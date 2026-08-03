// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Result, WeightEntry } from "@/lib/data";
import { useWeights } from "@/lib/hooks/useWeights";

/**
 * The four-states contract, tested (Plan §4.4, PHASE-3-DECISIONS §8).
 *
 * `lib/data` is mocked wholesale: Phase 2 already tests the repositories against
 * a fake Supabase, and the live DB is off-limits to tests (PHASE-2-DECISIONS §11).
 * What is under test here is the STATE MACHINE — which of the four states the
 * surface is told to render, and whether a write is followed by a refetch.
 */

vi.mock("@/lib/data", () => ({
  fetchWeights: vi.fn(),
  logWeight: vi.fn(),
  deleteWeight: vi.fn(),
}));

const { fetchWeights, logWeight, deleteWeight } = await import("@/lib/data");

const mockFetch = vi.mocked(fetchWeights);
const mockLog = vi.mocked(logWeight);
const mockDelete = vi.mocked(deleteWeight);

const ROWS: WeightEntry[] = [
  { date: "2026-05-05", weight: 91.1 },
  { date: "2026-05-07", weight: 88.9 },
];

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(kind: "network" | "unknown", message: string): Result<T> => ({
  ok: false,
  error: { kind, message },
});

/** A promise whose resolution this test controls, for ordering races. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(ok(ROWS));
  mockLog.mockResolvedValue(ok(ROWS[0]));
  mockDelete.mockResolvedValue(ok(null));
});

describe("useWeights — the four states", () => {
  it("starts in loading with no data", () => {
    mockFetch.mockReturnValue(deferred<Result<WeightEntry[]>>().promise);
    const { result } = renderHook(() => useWeights());

    expect(result.current.state).toBe("loading");
    expect(result.current.weights).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("reaches ready with the full history, oldest first", async () => {
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    expect(result.current.weights).toEqual(ROWS);
    expect(result.current.error).toBeNull();
  });

  it("distinguishes empty from ready-with-nothing", async () => {
    // An empty history is an invitation to act, not a chart with no points
    // (PHASE-3-DECISIONS §10). The surface renders something different.
    mockFetch.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useWeights());

    await waitFor(() => expect(result.current.state).toBe("empty"));
    expect(result.current.weights).toEqual([]);
  });

  it("reaches error carrying the real message, never a vague one", async () => {
    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    const { result } = renderHook(() => useWeights());

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toEqual({
      kind: "network",
      message: "Failed to fetch",
    });
  });

  it("keeps the last good list when a refetch fails", async () => {
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    await act(async () => {
      await result.current.refetch();
    });

    // Stale data under a visible error beats blanking the screen — the numbers
    // on screen were true a moment ago, and the error says so.
    expect(result.current.state).toBe("error");
    expect(result.current.weights).toEqual(ROWS);
  });

  it("clears a previous error once a refetch succeeds", async () => {
    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("error"));

    mockFetch.mockResolvedValue(ok(ROWS));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.error).toBeNull();
  });
});

describe("useWeights — writes refetch, and report at the call site", () => {
  it("refetches after a successful log", async () => {
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const added = [...ROWS, { date: "2026-05-08", weight: 89.8 }];
    mockFetch.mockResolvedValue(ok(added));

    await act(async () => {
      await result.current.log("2026-05-08", 89.8);
    });

    expect(mockLog).toHaveBeenCalledWith("2026-05-08", 89.8);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.weights).toEqual(added);
  });

  it("refetches after a successful delete", async () => {
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(ok([ROWS[0]]));
    await act(async () => {
      await result.current.remove("2026-05-07");
    });

    expect(mockDelete).toHaveBeenCalledWith("2026-05-07");
    expect(result.current.weights).toEqual([ROWS[0]]);
  });

  it("does not refetch a failed write, and leaves the list untouched", async () => {
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockLog.mockResolvedValue(fail("network", "Failed to fetch"));
    await act(async () => {
      await result.current.log("2026-05-08", 89.8);
    });

    // A failed write changed nothing, so the list must claim nothing changed.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("ready");
    expect(result.current.weights).toEqual(ROWS);
  });

  it("hands the write's Result back for the caller to surface", async () => {
    const { result } = renderHook(() => useWeights());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockLog.mockResolvedValue(fail("unknown", "duplicate key"));
    let returned: Result<WeightEntry> | undefined;
    await act(async () => {
      returned = await result.current.log("2026-05-08", 89.8);
    });

    // The hook does NOT flip the list into its error state for a write failure:
    // the button/toast reports it, and the list stays true (Plan §4.4).
    expect(returned).toEqual({
      ok: false,
      error: { kind: "unknown", message: "duplicate key" },
    });
    expect(result.current.error).toBeNull();
  });
});

describe("useWeights — out-of-order responses", () => {
  it("discards a slow read that resolves after a newer one", async () => {
    // The bug this guards: a slow initial read landing after a post-write
    // refetch would quietly restore pre-write data, and nothing would look wrong.
    const first = deferred<Result<WeightEntry[]>>();
    const second = deferred<Result<WeightEntry[]>>();
    mockFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useWeights());
    expect(result.current.state).toBe("loading");

    const fresh = [...ROWS, { date: "2026-05-08", weight: 89.8 }];
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refetch();
    });

    // Newer read wins, then the older one arrives late and must be ignored.
    await act(async () => {
      second.resolve(ok(fresh));
      await pending;
      first.resolve(ok([]));
    });

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.weights).toEqual(fresh);
  });
});
