/**
 * The Supabase client and the error classifier (Plan §2, §8).
 *
 * ONE shared instance, created lazily, running in the BROWSER. This is the old
 * app's pattern (1842–1848) and Plan §8 requires it: *"no new CRUD routes needed
 * where the old app used the Supabase JS client directly; preserve that pattern."*
 * Server-component reads were considered and rejected in PHASE-2-DECISIONS §9 —
 * they would add a second client, a per-route caching policy and a revalidation
 * story for every write, none of which the old app has an equivalent of.
 *
 * The ANON key is public by design (Plan §2). The `service_role` key must never
 * appear in this repo, under any framing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { err, type ErrorKind, type Result } from "./types";

/** Thrown at first use when configuration is missing. Named so it is greppable. */
export class SupabaseConfigError extends Error {
  constructor(missing: string) {
    super(
      `${missing} is not set. Copy .env.example to .env.local and fill in both ` +
        `Supabase values (Project Settings → API), and set the same two variables ` +
        `in the Vercel project for Production, Preview and Development.`,
    );
    this.name = "SupabaseConfigError";
  }
}

let client: SupabaseClient | null = null;

/**
 * The shared client, created on first call.
 *
 * Lazy on purpose: reading env at module scope would throw during `next build`
 * whenever this module is merely imported, rather than when it is actually used.
 * Fails LOUDLY and by name — never returns a half-configured client that produces
 * mystery 401s at runtime.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  client = createClient(url, key, {
    auth: {
      // Single-user, no auth this migration (Plan §2). Nothing to persist or
      // refresh, and no session to restore on load.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

/** Test seam: swap the client for a fake. Only `tests/` should call this. */
export function __setSupabaseForTests(fake: SupabaseClient | null): void {
  client = fake;
}

/* ── error classification ─────────────────────────────────────────────────── */

/** The shape supabase-js hands back in `{ error }`. Structural, not imported. */
export type PostgrestLikeError = {
  readonly message?: string;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
};

/**
 * Postgres / PostgREST codes we can say something USEFUL about.
 *
 * `23505` is a plain uniqueness violation. `42P10` is the one that matters most
 * here: *"there is no unique or exclusion constraint matching the ON CONFLICT
 * specification"* — exactly what an upsert raises when the constraint backing an
 * `onConflict` target does not exist. Those constraints cannot be verified from
 * the client (the OpenAPI endpoint requires `service_role`, which we never use),
 * so this classification is how a missing one becomes visible instead of silent.
 * See PHASE-2-DECISIONS §12 finding 8.
 */
const CONFLICT_CODES = new Set(["23505", "42P10", "23P01"]);
/** PostgREST returns this when `.single()` matched no rows. */
const NOT_FOUND_CODES = new Set(["PGRST116"]);

/**
 * Classify a failure into an `ErrorKind`.
 *
 * The message is always preserved. Plan §4.4 forbids a silent or vague error
 * state, so nothing here swallows a reason — `unknown` still carries the text.
 */
export function classifyError(error: unknown): { kind: ErrorKind; message: string } {
  if (error instanceof Error && error.name === "SupabaseConfigError") {
    return { kind: "unknown", message: error.message };
  }

  const e = (error ?? {}) as PostgrestLikeError;
  const message =
    e.message || e.details || e.hint || "Unknown database error";

  if (e.code && CONFLICT_CODES.has(e.code)) return { kind: "conflict", message };
  if (e.code && NOT_FOUND_CODES.has(e.code)) return { kind: "not-found", message };

  // supabase-js surfaces a dropped connection as a TypeError from fetch, with no
  // Postgres code. This is the case the gym-with-no-signal hits (Plan §0.3: the
  // write must fail visibly, never queue).
  if (
    !e.code &&
    /fetch|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(message)
  ) {
    return { kind: "network", message };
  }

  return { kind: "unknown", message };
}

/** Wrap a classified failure as a `Result`. */
export function toFailure<T>(error: unknown): Result<T> {
  const { kind, message } = classifyError(error);
  return err<T>(kind, message);
}

/**
 * Run one Supabase call and convert it into a `Result`.
 *
 * Two failure routes, both caught here so no caller ever needs a try/catch:
 *   • `{ error }` in the response — Postgres said no.
 *   • a THROWN error — fetch died, or `getSupabase()` found no configuration.
 *
 * `map` runs only on success, so the mapping code below never sees a null `data`.
 */
export async function run<Row, T>(
  call: () => PromiseLike<{ data: Row | null; error: PostgrestLikeError | null }>,
  map: (data: Row) => T,
): Promise<Result<T>> {
  try {
    const { data, error } = await call();
    if (error) return toFailure<T>(error);
    if (data === null) {
      return err<T>("not-found", "The database returned no row.");
    }
    return { ok: true, data: map(data) };
  } catch (thrown) {
    return toFailure<T>(thrown);
  }
}
