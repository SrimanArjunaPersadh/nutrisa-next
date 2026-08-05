/**
 * Calendar-day helpers for the UI layer.
 *
 * TWO DATE CONVENTIONS LIVE IN THIS APP AND THAT IS DELIBERATE — the old app has
 * them too. Read this before touching anything date-shaped:
 *
 *   • `lib/engine` parses `YYYY-MM-DD` as UTC midnight (`msFromIsoDate`). It only
 *     ever measures SPANS between weigh-ins, so a consistent zone is what matters.
 *   • This file works in LOCAL time, because pickers are about the day the user
 *     is standing in. The old app does the same: `td()` (line 484) builds today
 *     from local parts, and `new Date(date+'T00:00:00')` (2896) parses local.
 *
 * They never disagree, because the `YYYY-MM-DD` STRING is the interchange format
 * and neither side hands the other a `Date`. Keep it that way: a `Date` crossing
 * this boundary is how you get an off-by-one weigh-in at 02:00 SAST.
 */

/** `YYYY-MM-DD` from a Date's LOCAL calendar parts. Old app `td()`, line 484. */
export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today, as `YYYY-MM-DD` in the user's own timezone. */
export function todayIso(): string {
  return toIsoDay(new Date());
}

/**
 * `YYYY-MM-DD` → a Date at LOCAL midnight.
 *
 * Built from parts rather than `new Date(iso)`, which the spec parses as UTC and
 * would land on the previous day for anyone west of Greenwich.
 */
export function fromIsoDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The wall-clock stamp a logged meal carries. Old app `now()` (485).
 *
 * `H:MM` — hours UNPADDED, minutes padded. `meal_logs.logged_time` is free text
 * that nothing ever parses (PHASE-2-DECISIONS), so this is a display convention
 * rather than a data one — but it is the convention every existing row was
 * written in, and the two apps run side by side during cutover. Reproduced
 * exactly, missing hour pad included.
 */
export function nowHM(): string {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The calendar day before this one. Old app `copyYesterdayMeals` (2050–2052),
 * which builds it from LOCAL parts exactly like this.
 *
 * Local, not UTC, and deliberately so: "yesterday" is a fact about the day the
 * user is standing in. The `YYYY-MM-DD` string is what crosses back out, so the
 * engine's UTC convention is never handed a `Date` — see this file's header.
 */
export function previousDay(iso: string): string {
  const d = fromIsoDay(iso);
  d.setDate(d.getDate() - 1);
  return toIsoDay(d);
}

/** `"3 Aug 2026"` — the old app's trigger-button format (2897). */
export function formatDayShort(iso: string): string {
  return fromIsoDay(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `"3 Aug"` — for dense rows where the year is obvious from context. */
export function formatDayCompact(iso: string): string {
  return fromIsoDay(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Order two days low-to-high. Either may be `""` (unset). */
export function orderDays(a: string, b: string): { lo: string; hi: string } {
  if (!a || !b) return { lo: a || b, hi: "" };
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a };
}
