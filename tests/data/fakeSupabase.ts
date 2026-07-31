import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A hand-written stand-in for the Supabase client.
 *
 * Phase 2's tests must not touch the live DB (PHASE-2-DECISIONS §11), but the
 * things most worth testing about a repository are exactly the things a mapper
 * test cannot see: which table it hit, which columns it ordered by, which
 * `onConflict` target it chose, and what it does with a failure.
 *
 * So this records the whole builder chain and replays a canned response. It is
 * deliberately dumb — it does not simulate Postgres, it proves the SHAPE of the
 * call we send.
 */

export type RecordedCall = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
  filters: { column: string; value: unknown }[];
  orders: { column: string; ascending: boolean }[];
  single: boolean;
  selectedAfterWrite: boolean;
};

export type CannedResponse = {
  data?: unknown;
  error?: { message?: string; code?: string; details?: string } | null;
  /** Throw instead of resolving — models a dead connection. */
  throws?: unknown;
};

class Builder implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(
    private readonly call: RecordedCall,
    private readonly response: CannedResponse,
  ) {}

  select() {
    if (this.call.op !== "select") this.call.selectedAfterWrite = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.filters.push({ column, value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.call.orders.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }

  /** Type-only in the real client; a no-op passthrough here. */
  returns<T>(): Builder & PromiseLike<{ data: T; error: unknown }> {
    return this as never;
  }

  single<T>(): Builder & PromiseLike<{ data: T; error: unknown }> {
    this.call.single = true;
    return this as never;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.response.throws !== undefined) {
      return Promise.reject(this.response.throws).then(onfulfilled, onrejected);
    }
    return Promise.resolve({
      data: this.response.data ?? null,
      error: this.response.error ?? null,
    }).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(response: CannedResponse = {}) {
  const calls: RecordedCall[] = [];

  const make = (table: string, op: RecordedCall["op"], payload?: unknown, options?: unknown) => {
    const call: RecordedCall = {
      table,
      op,
      payload,
      options,
      filters: [],
      orders: [],
      single: false,
      selectedAfterWrite: false,
    };
    calls.push(call);
    return new Builder(call, response);
  };

  const client = {
    from(table: string) {
      return {
        // The column list is discarded: every caller selects "*", and what these
        // tests assert is the table, the filters and the ordering keys.
        select: () => make(table, "select").select(),
        insert: (payload: unknown) => make(table, "insert", payload),
        update: (payload: unknown) => make(table, "update", payload),
        upsert: (payload: unknown, options?: unknown) =>
          make(table, "upsert", payload, options),
        delete: () => make(table, "delete"),
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    /** The most recent recorded call — what a single-operation test asserts on. */
    last: () => calls[calls.length - 1],
  };
}
