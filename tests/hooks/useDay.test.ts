// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoggedMeal, Result } from "@/lib/data";
import { useDay } from "@/lib/hooks/useDay";

/**
 * The Nutrition day's state machine (PHASE-4-DECISIONS §8).
 *
 * `lib/data` is mocked wholesale for the same reason `useWeights.test.ts` does
 * it: Phase 2 already tests the repositories against a fake Supabase, and the
 * live DB is off-limits to tests (PHASE-2-DECISIONS §11). What is under test is
 * which of the four states a surface is told to render, whether writes refetch,
 * and the two contracts inherited from Phase 3 §8a.
 */

vi.mock("@/lib/data", () => ({
  fetchMealsForDate: vi.fn(),
  addMeal: vi.fn(),
  deleteMeal: vi.fn(),
  updateMeal: vi.fn(),
}));

const { fetchMealsForDate, addMeal, deleteMeal, updateMeal } = await import(
  "@/lib/data"
);

const mockFetch = vi.mocked(fetchMealsForDate);
const mockAdd = vi.mocked(addMeal);
const mockDelete = vi.mocked(deleteMeal);
const mockUpdate = vi.mocked(updateMeal);

const meal = (name: string, sortOrder: number, id = name): LoggedMeal => ({
  _id: id,
  _libId: name,
  _ings: null,
  name,
  kcal: 500,
  pro: 30,
  carb: 50,
  fat: 15,
  time: "8:15",
  sortOrder,
});

const DAY: LoggedMeal[] = [meal("Oats", 1), meal("English Brekkie", 2)];

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(kind: "network" | "unknown", message: string): Result<T> => ({
  ok: false,
  error: { kind, message },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(ok(DAY));
  mockAdd.mockResolvedValue(ok(DAY[0]));
  mockDelete.mockResolvedValue(ok(null));
  mockUpdate.mockResolvedValue(ok(DAY[0]));
});

describe("useDay — the four states", () => {
  it("starts in loading", () => {
    mockFetch.mockReturnValue(deferred<Result<LoggedMeal[]>>().promise);
    const { result } = renderHook(() => useDay("2026-06-01"));

    expect(result.current.state).toBe("loading");
    expect(result.current.meals).toEqual([]);
  });

  it("reaches ready with the day's meals", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    expect(result.current.meals).toEqual(DAY);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("2026-06-01");
  });

  it("reports empty for a day with nothing logged", async () => {
    mockFetch.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useDay("2026-06-02"));

    await waitFor(() => expect(result.current.state).toBe("empty"));
  });

  it("reports error with the real message", async () => {
    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    const { result } = renderHook(() => useDay("2026-06-01"));

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toEqual({
      kind: "network",
      message: "Failed to fetch",
    });
  });
});

describe("useDay — the date is a dependency", () => {
  it("re-reads when the day changes", async () => {
    const { result, rerender } = renderHook(({ d }) => useDay(d), {
      initialProps: { d: "2026-06-01" },
    });
    await waitFor(() => expect(result.current.state).toBe("ready"));

    rerender({ d: "2026-06-03" });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("2026-06-03"));
  });

  it("discards a response for a day the user has already left", async () => {
    // The June 1 read is slow; the user steps to June 3, whose read lands first.
    const slow = deferred<Result<LoggedMeal[]>>();
    mockFetch.mockReturnValueOnce(slow.promise);

    const { result, rerender } = renderHook(({ d }) => useDay(d), {
      initialProps: { d: "2026-06-01" },
    });

    const JUNE3 = [meal("Pasta", 1)];
    mockFetch.mockResolvedValue(ok(JUNE3));
    rerender({ d: "2026-06-03" });
    await waitFor(() => expect(result.current.meals).toEqual(JUNE3));

    // June 1 finally answers. Without the sequence check it would overwrite the
    // day the user is actually looking at.
    await act(async () => {
      slow.resolve(ok(DAY));
    });

    expect(result.current.meals).toEqual(JUNE3);
  });
});

describe("useDay — writes", () => {
  const NEW = {
    name: "Pasta",
    kcal: 700,
    pro: 30,
    carb: 90,
    fat: 20,
    time: "19:02",
    _libId: "Pasta",
    _ings: null,
  };

  it("logs with a 1-BASED sort_order taken from the day's length", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.log(NEW);
    });

    // Two meals already logged, so the third is sort_order 3 (PHASE-2 §5).
    expect(mockAdd).toHaveBeenCalledWith("2026-06-01", NEW, 3);
  });

  it("refetches after a successful write", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const reads = mockFetch.mock.calls.length;

    await act(async () => {
      await result.current.log(NEW);
    });

    expect(mockFetch.mock.calls.length).toBe(reads + 1);
  });

  it("does NOT refetch after a failed write", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const reads = mockFetch.mock.calls.length;

    mockAdd.mockResolvedValue(fail("network", "offline"));
    await act(async () => {
      await result.current.log(NEW);
    });

    expect(mockFetch.mock.calls.length).toBe(reads);
  });

  it("a failed WRITE never moves the LIST into its error state", async () => {
    // The contract inherited from PHASE-3-DECISIONS §8a: state/error describe the
    // read. A write that failed changed nothing, so the list keeps saying what it
    // said, and the caller surfaces the returned Result at the button.
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockAdd.mockResolvedValue(fail("network", "offline"));
    let returned: Result<LoggedMeal> | undefined;
    await act(async () => {
      returned = await result.current.log(NEW);
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.error).toBeNull();
    expect(result.current.meals).toEqual(DAY);
    expect(returned).toEqual({
      ok: false,
      error: { kind: "network", message: "offline" },
    });
  });

  it("a failed READ keeps the last good rows under the error", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(fail("network", "offline"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.meals).toEqual(DAY);
  });

  it("deletes by id and refetches", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.remove("Oats");
    });

    expect(mockDelete).toHaveBeenCalledWith("Oats");
  });
});

describe("useDay — update (the gram editor's write path)", () => {
  const MACROS = { kcal: 400, pro: 25, carb: 40, fat: 12 };
  const INGS = [
    { name: "Oats", qty: "60", kcal: 220, pro: 8, carb: 38, fat: 4 },
  ];

  it("passes ingredients through so ings_json is replaced", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.update("Oats", MACROS, INGS);
    });

    expect(mockUpdate).toHaveBeenCalledWith("Oats", MACROS, INGS);
  });

  it("omits ingredients entirely on a macro-only edit", async () => {
    // `updateMeal`'s three-way contract: undefined leaves the stored column
    // untouched, null clears it. A meal with no ingredient list must not have
    // its ings_json wiped just because its macros were corrected.
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.update("Oats", MACROS);
    });

    expect(mockUpdate).toHaveBeenCalledWith("Oats", MACROS, undefined);
  });

  it("refetches after a successful update", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const reads = mockFetch.mock.calls.length;

    await act(async () => {
      await result.current.update("Oats", MACROS, INGS);
    });

    expect(mockFetch.mock.calls.length).toBe(reads + 1);
  });

  it("a failed update leaves the list alone and returns the Result", async () => {
    const { result } = renderHook(() => useDay("2026-06-01"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockUpdate.mockResolvedValue(fail("network", "offline"));
    let returned;
    await act(async () => {
      returned = await result.current.update("Oats", MACROS, INGS);
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.meals).toEqual(DAY);
    expect(returned).toEqual({
      ok: false,
      error: { kind: "network", message: "offline" },
    });
  });
});

describe("useDay — copyYesterday", () => {
  it("reads the previous DAY, not the whole table", async () => {
    const { result } = renderHook(() => useDay("2026-06-03"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.copyYesterday();
    });

    // Phase 2 warns fetchAllMeals grows without bound; one extra day-read is
    // the cheaper and more honest call (§8).
    expect(mockFetch).toHaveBeenCalledWith("2026-06-02");
  });

  it("reports nothing-to-copy rather than erroring", async () => {
    const { result } = renderHook(() => useDay("2026-06-03"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(ok([]));
    let outcome;
    await act(async () => {
      outcome = await result.current.copyYesterday();
    });

    expect(outcome).toEqual({ kind: "nothing-to-copy" });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("returns the new ids so Undo can remove exactly those rows", async () => {
    const { result } = renderHook(() => useDay("2026-06-03"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockAdd
      .mockResolvedValueOnce(ok(meal("Oats", 3, "new-1")))
      .mockResolvedValueOnce(ok(meal("English Brekkie", 4, "new-2")));

    let outcome;
    await act(async () => {
      outcome = await result.current.copyYesterday();
    });

    expect(outcome).toEqual({
      kind: "copied",
      ids: ["new-1", "new-2"],
      from: "2026-06-02",
    });
  });

  it("continues sort_order from the day's existing meals", async () => {
    const { result } = renderHook(() => useDay("2026-06-03"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.copyYesterday();
    });

    // Two already logged, so the copies are 3 and 4 — never reusing 1 and 2.
    expect(mockAdd.mock.calls[0][2]).toBe(3);
    expect(mockAdd.mock.calls[1][2]).toBe(4);
  });

  it("reports a partial copy with the ids that DID land", async () => {
    const { result } = renderHook(() => useDay("2026-06-03"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockAdd
      .mockResolvedValueOnce(ok(meal("Oats", 3, "new-1")))
      .mockResolvedValueOnce(fail("network", "offline"));

    let outcome;
    await act(async () => {
      outcome = await result.current.copyYesterday();
    });

    // Half a day really was copied. Saying "it failed" would be a lie the user
    // discovers later, from wrong totals (§4.4).
    expect(outcome).toEqual({
      kind: "partial",
      ids: ["new-1"],
      from: "2026-06-02",
      error: { kind: "network", message: "offline" },
    });
  });
});
