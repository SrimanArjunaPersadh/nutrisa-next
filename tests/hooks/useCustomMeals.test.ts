// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomMeal, Result } from "@/lib/data";
import { useCustomMeals } from "@/lib/hooks/useCustomMeals";

/**
 * REGRESSION GUARD — written BEFORE the `useCollection<T>` extraction.
 *
 * `useCustomMeals` shipped in Phase 4 with no test of its own. Phase 5 (eng
 * review D8) moves its body onto a shared `useCollection<T>`, because it and
 * `useCustomFoods` are the same function with a different fetcher. Restructuring
 * merged, phone-verified, untested code is exactly the case the regression rule
 * exists for: this file pins the behaviour as it is TODAY, must be green before
 * the refactor starts, and must still be green after it.
 *
 * What it pins:
 *   • the four-states union — `loading | error | empty | ready` (Plan §4.4)
 *   • error carries the REAL message, never a vague one
 *   • a failed refetch keeps the last good rows (PHASE-3-DECISIONS §8a)
 *   • out-of-order responses are discarded by sequence number
 *
 * `lib/data` is mocked wholesale, matching `useWeights.test.ts`: Phase 2 already
 * tests the repositories against a fake Supabase, and the live DB is off-limits
 * (PHASE-2-DECISIONS §11). What is under test here is the STATE MACHINE.
 */

/**
 * The mock supplies all three data calls. `saveCustomMeal` / `deleteCustomMeal`
 * were added to the factory when Phase 5 gave this hook its writes — the module
 * shape has to match what the hook imports or the import itself fails. Note
 * that NOT ONE assertion below changed for the refactor: the read behaviour
 * pinned here is the Phase 4 behaviour, and it still holds.
 */
vi.mock("@/lib/data", () => ({
  fetchCustomMeals: vi.fn(),
  saveCustomMeal: vi.fn(),
  deleteCustomMeal: vi.fn(),
}));

const { fetchCustomMeals, saveCustomMeal, deleteCustomMeal } = await import(
  "@/lib/data"
);
const mockFetch = vi.mocked(fetchCustomMeals);
const mockSave = vi.mocked(saveCustomMeal);
const mockDelete = vi.mocked(deleteCustomMeal);

const MEALS: CustomMeal[] = [
  {
    _id: "11111111-1111-1111-1111-111111111111",
    id: "11111111-1111-1111-1111-111111111111",
    name: "Tofu Scramble",
    cat: "Breakfast",
    note: "Weekday default",
    kcal: 512,
    pro: 34.2,
    carb: 41.8,
    fat: 22.1,
    ingredients: [
      { name: "Vejoy Tofu", qty: "150g", kcal: 330, pro: 18.9, carb: 6, fat: 20.9 },
    ],
  },
  {
    _id: "22222222-2222-2222-2222-222222222222",
    id: "22222222-2222-2222-2222-222222222222",
    name: "Seitan Bowl",
    cat: "Supper",
    note: "",
    kcal: 640,
    pro: 48.5,
    carb: 72.3,
    fat: 12.4,
    ingredients: [],
  },
];

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(
  kind: "network" | "conflict" | "unknown",
  message: string,
): Result<T> => ({
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
  mockFetch.mockResolvedValue(ok(MEALS));
  mockSave.mockResolvedValue(ok(MEALS[0]));
  mockDelete.mockResolvedValue(ok(null));
});

describe("useCustomMeals — the four states", () => {
  it("starts in loading with no data", () => {
    mockFetch.mockReturnValue(deferred<Result<CustomMeal[]>>().promise);
    const { result } = renderHook(() => useCustomMeals());

    expect(result.current.state).toBe("loading");
    expect(result.current.meals).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("reaches ready with the library, oldest first", async () => {
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    // Order is the repository's (`.order('created_at')`), not the hook's — the
    // hook must not re-sort. This is the old app's `am()` order.
    expect(result.current.meals).toEqual(MEALS);
    expect(result.current.error).toBeNull();
  });

  it("distinguishes empty from ready-with-nothing", async () => {
    // A library with no meals is an invitation to build one, not an empty list
    // (Plan §4.4). The surface renders something different, so the hook must
    // say something different.
    mockFetch.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useCustomMeals());

    await waitFor(() => expect(result.current.state).toBe("empty"));
    expect(result.current.meals).toEqual([]);
  });

  it("reaches error carrying the real message, never a vague one", async () => {
    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    const { result } = renderHook(() => useCustomMeals());

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toEqual({
      kind: "network",
      message: "Failed to fetch",
    });
  });
});

describe("useCustomMeals — a failed read keeps the last good rows", () => {
  it("keeps the library on screen when a refetch fails", async () => {
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    await act(async () => {
      await result.current.refetch();
    });

    // Stale data under a visible error beats blanking the picker: those meals
    // were real a moment ago, and the error says so (PHASE-3-DECISIONS §8a).
    expect(result.current.state).toBe("error");
    expect(result.current.meals).toEqual(MEALS);
  });

  it("clears a previous error once a refetch succeeds", async () => {
    mockFetch.mockResolvedValue(fail("network", "Failed to fetch"));
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("error"));

    mockFetch.mockResolvedValue(ok(MEALS));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.state).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("goes from error straight to empty when the retry finds nothing", async () => {
    mockFetch.mockResolvedValue(fail("unknown", "boom"));
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("error"));

    mockFetch.mockResolvedValue(ok([]));
    await act(async () => {
      await result.current.refetch();
    });

    // Not `ready` with an empty array — the union's whole point.
    expect(result.current.state).toBe("empty");
    expect(result.current.error).toBeNull();
  });
});

describe("useCustomMeals — out-of-order responses", () => {
  it("discards a slow read that resolves after a newer one", async () => {
    // The bug this guards: a slow initial read landing after a later refetch
    // would quietly restore stale library rows, and nothing would look wrong.
    const first = deferred<Result<CustomMeal[]>>();
    const second = deferred<Result<CustomMeal[]>>();
    mockFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useCustomMeals());
    expect(result.current.state).toBe("loading");

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refetch();
    });

    // The newer read wins; the older one arrives late and must be ignored.
    await act(async () => {
      second.resolve(ok(MEALS));
      await pending;
      first.resolve(ok([]));
    });

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.meals).toEqual(MEALS);
  });

  it("ignores a late error from a superseded read", async () => {
    // A stale FAILURE must not knock a good list into the error state either.
    const first = deferred<Result<CustomMeal[]>>();
    const second = deferred<Result<CustomMeal[]>>();
    mockFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useCustomMeals());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refetch();
    });

    await act(async () => {
      second.resolve(ok(MEALS));
      await pending;
      first.resolve(fail("network", "stale failure"));
    });

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.error).toBeNull();
    expect(result.current.meals).toEqual(MEALS);
  });
});

/**
 * NEW IN PHASE 5 — everything above this line pins Phase 4 behaviour and did not
 * change for the `useCollection` refactor. Everything below is the writes the
 * meal builder needs (§8a's contracts, now enforced inside `useCollection`).
 */
describe("useCustomMeals — writes refetch, and report at the call site", () => {
  it("refetches after a successful save", async () => {
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const added = [...MEALS, { ...MEALS[0], _id: "33", id: "33", name: "New" }];
    mockFetch.mockResolvedValue(ok(added));

    await act(async () => {
      await result.current.save({
        name: "New",
        cat: "Lunch",
        note: "",
        kcal: 400,
        pro: 30,
        carb: 40,
        fat: 10,
        ingredients: [],
      });
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.meals).toEqual(added);
  });

  it("refetches after a successful delete", async () => {
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockFetch.mockResolvedValue(ok([MEALS[0]]));
    await act(async () => {
      await result.current.remove(MEALS[1]._id);
    });

    expect(mockDelete).toHaveBeenCalledWith(MEALS[1]._id);
    expect(result.current.meals).toEqual([MEALS[0]]);
  });

  it("does not refetch a failed write, and leaves the list untouched", async () => {
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    mockSave.mockResolvedValue(fail("network", "Failed to fetch"));
    await act(async () => {
      await result.current.save({
        name: "New",
        cat: "Lunch",
        note: "",
        kcal: 400,
        pro: 30,
        carb: 40,
        fat: 10,
        ingredients: [],
      });
    });

    // A failed write changed nothing, so the list must claim nothing changed.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("ready");
    expect(result.current.meals).toEqual(MEALS);
  });

  it("hands the write's Result back, and does NOT enter the error state", async () => {
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    // 42P10 is what a MISSING unique index on custom_meals.name looks like.
    // PHASE-2-DECISIONS §8 records that constraint as observed, never confirmed,
    // so this is the failure the meal builder must be able to report.
    mockSave.mockResolvedValue(fail("conflict", 'no unique constraint matching "name"'));

    let returned: Result<CustomMeal> | undefined;
    await act(async () => {
      returned = await result.current.save({
        name: "Tofu Scramble",
        cat: "Breakfast",
        note: "",
        kcal: 512,
        pro: 34.2,
        carb: 41.8,
        fat: 22.1,
        ingredients: [],
      });
    });

    expect(returned).toEqual({
      ok: false,
      error: { kind: "conflict", message: 'no unique constraint matching "name"' },
    });
    // The Save button reports it; the library keeps telling the truth (§4.4).
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("ready");
  });

  it("overwrite is ONE call — save is never followed by a delete (D14)", async () => {
    // saveCustomMeal upserts on `name`, so saving under an existing name updates
    // that row and returns the same id. A delete afterwards would remove the row
    // just written and destroy the meal. The hook must never do it, and nothing
    // built on top of it should either.
    const { result } = renderHook(() => useCustomMeals());
    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.save({
        name: "Tofu Scramble", // the name of an EXISTING meal
        cat: "Breakfast",
        note: "Now with more tofu",
        kcal: 600,
        pro: 40,
        carb: 45,
        fat: 25,
        ingredients: [],
      });
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("useCustomMeals — unmount", () => {
  it("does not blow up when a read resolves after unmount", async () => {
    // A weak pin, deliberately: React 19 no longer warns on setState after
    // unmount, so this asserts the `alive` ref's OBSERVABLE effect (nothing
    // throws, nothing is logged) rather than the ref itself. Keep it anyway —
    // if `useCollection` drops the guard, a real console error here is the
    // cheapest place to notice.
    const pending = deferred<Result<CustomMeal[]>>();
    mockFetch.mockReturnValue(pending.promise);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderHook(() => useCustomMeals());
    unmount();

    await act(async () => {
      pending.resolve(ok(MEALS));
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
