// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Result } from "@/lib/data";
import { useCollection } from "@/lib/hooks/useCollection";

/**
 * The generic itself, tested for the hazards that belong to IT rather than to
 * either consumer.
 *
 * `useCustomMeals.test.ts` and `useCustomFoods.test.ts` already exercise the
 * four states through their own surfaces. What is only testable here is the
 * behaviour the extraction INTRODUCED — chiefly the ops ref, which is the one
 * genuinely new failure mode: callers pass a fresh object literal on every
 * render, and if that object ever became a dependency the mount effect would
 * re-run forever.
 */

type Thing = { readonly id: string; readonly name: string };

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(message: string): Result<T> => ({
  ok: false,
  error: { kind: "network", message },
});

const THINGS: Thing[] = [
  { id: "1", name: "one" },
  { id: "2", name: "two" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Mirrors how the real hooks call it: a fresh object literal every render. */
function setup(
  fetchImpl: () => Promise<Result<Thing[]>>,
  saveImpl?: () => Promise<Result<Thing>>,
  removeImpl?: () => Promise<Result<null>>,
) {
  const fetch = vi.fn(fetchImpl);
  const save = vi.fn(saveImpl ?? (() => Promise.resolve(ok(THINGS[0]))));
  const remove = vi.fn(removeImpl ?? (() => Promise.resolve(ok(null))));

  const hook = renderHook(() =>
    // NOTE the inline literal — a new object identity on every single render.
    useCollection<Thing, { name: string }>({ fetch, save, remove }),
  );

  return { hook, fetch, save, remove };
}

describe("useCollection — the ops ref (the hazard the extraction introduced)", () => {
  it("reads ONCE even though callers pass a new ops object every render", async () => {
    // If `ops` were a dependency of `refetch`, the mount effect would see a new
    // `refetch` on every render and read again forever. This is the test that
    // would hang or explode if someone "simplifies" the ref away.
    const { hook, fetch } = setup(() => Promise.resolve(ok(THINGS)));
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    expect(fetch).toHaveBeenCalledTimes(1);

    // Force several extra renders; each one hands over a brand-new ops object.
    hook.rerender();
    hook.rerender();
    hook.rerender();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps refetch/save/remove referentially stable across renders", async () => {
    // Consumers put these in useCallback/useEffect dep arrays. If they changed
    // identity each render, every consumer would churn in turn.
    const { hook } = setup(() => Promise.resolve(ok(THINGS)));
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    const before = hook.result.current;
    hook.rerender();
    const after = hook.result.current;

    expect(after.refetch).toBe(before.refetch);
    expect(after.save).toBe(before.save);
    expect(after.remove).toBe(before.remove);
  });

  it("calls the LATEST ops, not the ones captured at mount", async () => {
    // The flip side of the ref: it must not staple the first render's functions
    // in place, or a consumer that swaps an implementation would be ignored.
    const first = vi.fn(() => Promise.resolve(ok(THINGS)));
    const second = vi.fn(() => Promise.resolve(ok([THINGS[0]])));
    const save = vi.fn(() => Promise.resolve(ok(THINGS[0])));
    const remove = vi.fn(() => Promise.resolve(ok(null)));

    let current = first;
    const hook = renderHook(() =>
      useCollection<Thing, { name: string }>({
        fetch: () => current(),
        save,
        remove,
      }),
    );
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    current = second;
    await act(async () => {
      await hook.result.current.refetch();
    });

    expect(second).toHaveBeenCalledTimes(1);
    expect(hook.result.current.items).toEqual([THINGS[0]]);
  });
});

describe("useCollection — read contracts", () => {
  it("goes loading → ready, and distinguishes empty", async () => {
    const { hook } = setup(() => Promise.resolve(ok(THINGS)));
    expect(hook.result.current.state).toBe("loading");
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    const emptyHook = setup(() => Promise.resolve(ok([])));
    await waitFor(() => expect(emptyHook.hook.result.current.state).toBe("empty"));
  });

  it("keeps the last good rows when a refetch fails", async () => {
    let impl = () => Promise.resolve(ok(THINGS));
    const { hook } = setup(() => impl());
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    impl = () => Promise.resolve(fail<Thing[]>("offline"));
    await act(async () => {
      await hook.result.current.refetch();
    });

    expect(hook.result.current.state).toBe("error");
    expect(hook.result.current.items).toEqual(THINGS);
  });

  it("discards a slow read that resolves after a newer one", async () => {
    const slow = deferred<Result<Thing[]>>();
    const quick = deferred<Result<Thing[]>>();
    const fetch = vi
      .fn<() => Promise<Result<Thing[]>>>()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(quick.promise);
    const save = vi.fn(() => Promise.resolve(ok(THINGS[0])));
    const remove = vi.fn(() => Promise.resolve(ok(null)));

    const hook = renderHook(() =>
      useCollection<Thing, { name: string }>({ fetch, save, remove }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.refetch();
    });

    await act(async () => {
      quick.resolve(ok(THINGS));
      await pending;
      slow.resolve(ok([])); // the stale answer arrives last and must be dropped
    });

    await waitFor(() => expect(hook.result.current.state).toBe("ready"));
    expect(hook.result.current.items).toEqual(THINGS);
  });
});

describe("useCollection — write contracts", () => {
  it("refetches only when the write succeeded", async () => {
    const { hook, fetch, save } = setup(() => Promise.resolve(ok(THINGS)));
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.result.current.save({ name: "three" });
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    save.mockResolvedValue(fail<Thing>("offline"));
    await act(async () => {
      await hook.result.current.save({ name: "four" });
    });
    // Nothing changed on the server, so nothing to re-read.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never moves the list into the error state for a failed write", async () => {
    const { hook, save } = setup(() => Promise.resolve(ok(THINGS)));
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    save.mockResolvedValue(fail<Thing>("offline"));
    let returned: Result<Thing> | undefined;
    await act(async () => {
      returned = await hook.result.current.save({ name: "four" });
    });

    // The Result goes back to the caller to show at the button; the list is
    // still true and still says so (Plan §4.4, PHASE-3-DECISIONS §8a).
    expect(returned?.ok).toBe(false);
    expect(hook.result.current.state).toBe("ready");
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.items).toEqual(THINGS);
  });

  it("passes the id straight through to remove", async () => {
    const { hook, remove } = setup(() => Promise.resolve(ok(THINGS)));
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));

    await act(async () => {
      await hook.result.current.remove("2");
    });

    expect(remove).toHaveBeenCalledWith("2");
  });
});
