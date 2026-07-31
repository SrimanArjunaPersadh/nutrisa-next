# PHASE 2 DECISIONS — Supabase data layer

**Date: 2026-07-31 · Branch: `phase-2-data` · Owner + Claude Code**

Decisions taken during the Phase 2 interview, before any code was written. The
Migration Plan remains the authority; where this file amends it, the amendment is
recorded in the Plan's own changelog (v1.3) as well as here.

All line numbers refer to `docs/reference/old-index.html`. Its Supabase layer is
lines 1835–2170, plus three `meal_logs` update sites at 3374, 3395 and 3556.

---

## 1. The table list was WRONG in the Plan. Five, not four. Amended.

**Found:** `CLAUDE.md:21`, Plan §2's Data row and Plan §8 all listed four tables.
`syncFromCloud` selects **five** (lines 1866–1872):

```js
sb.from('weight_logs')  .select('*').order('date', {ascending:true}),
sb.from('meal_logs')    .select('*').order('date').order('sort_order'),
sb.from('custom_meals') .select('*').order('created_at'),
sb.from('water_logs')   .select('*'),
sb.from('custom_foods') .select('*').order('created_at'),   // ← omitted from the Plan
```

`custom_foods` is not incidental. It is mapped at 1958–1979, upserted by
`cloudSaveCustomFood` (2108) via `saveCustomFood` (2129), deleted by
`cloudDelCustomFood` (2155), and read locally by `findCustomFoodByBarcode` (2100).
Plan §7 names it as the single destination shape all three add-food tiers funnel
into, so Phases 5, 6 and 7 all depend on it.

**Ruling: correct the docs to five; build all five in Phase 2.** This is a
documentation fix, NOT a schema change — the table already exists and already
holds rows. Nothing is created.

## 2. The localStorage merge layer is NOT translated

`syncFromCloud` is roughly 60% merge logic against the local store: preserving
"unsynced" entries that carry no `_id` (1925–1927, 1950–1952, 1974–1976), patching
`_ings`/`_libId` from local as a race guard (1917–1924), and deduping by lowercased
name.

**Ruling: dropped entirely. Readers return cloud rows, mapped, and nothing else.**

This IS Plan §0.3 made concrete. With no local store there is nothing to merge and
no never-uploaded entry to preserve. Recorded here explicitly, with line numbers, so
a later reader can tell a deliberate non-translation from an oversight.

Two consequences that follow from it and are also deliberate:

- The old app guards every mapping with `if (res.data.length > 0)` (1881, 1890,
  1934, 1958, 1982) — an empty result leaves the previous local value in place. With
  no local value, **empty means empty.** An empty table returns an empty collection,
  not a stale one.
- The old app's `_id`-less "pending upload" state cannot occur. A row either exists
  in the cloud or it does not.

## 3. Read-mapper rounding is kept exactly — it is ENGINE, not display

The read mappers round on the way IN (1900–1903 for `meal_logs`, 1941–1944 for
`custom_meals`):

```js
kcal: Math.round(r.kcal),
pro:  +parseFloat(r.pro).toFixed(1),
carb: +parseFloat(r.carb).toFixed(1),
fat:  +parseFloat(r.fat).toFixed(1),
```

So the database may hold more precision than the old app has ever displayed.

**Ruling: port it verbatim, in the mapper.** By PHASE-1-DECISIONS §3's rule —
*rounding that feeds further arithmetic is engine, rounding that only renders is
display* — this is engine-side: these values roll up into day totals. Dropping it
would make the new app's totals differ from the old app's on any row carrying hidden
precision, which is exactly the drift the Phase 9 cutover week exists to disprove.

Use the same `+parseFloat(x).toFixed(1)` idiom, **not** `Math.round(x*10)/10` — the
same lesson as PHASE-1-DECISIONS §1: they agree on most values and diverge on exact
halves, and `toFixed` produced every stored value.

**Outstanding:** confirm against the live DB whether any row actually carries
precision this discards, i.e. whether the quirk is live or theoretical. See §12.

## 4. `sort_order` — the quirk is ported, with one addition that changes no value

`cloudAddMeal` sets `sort_order` to the CURRENT list length (line 2022) and deletes
never renumber (`cloudDelMeal`, 2035–2042). So a mid-list delete leaves a gap, and
two rows on the same day can share a `sort_order`.

**Ruling: port the assignment and the no-renumber behaviour unchanged.** Renumbering
would rewrite stored values in existing rows and turn one delete into N writes — a
fix, not a translation.

**One addition:** the read orders by `date`, then `sort_order`, then **`id`**. The
old app's two-key order (1868) leaves duplicate `sort_order`s genuinely unordered at
Postgres's discretion, so the same day could render in a different sequence in the
two apps during cutover and read as a bug. The third key changes no stored value and
makes the order deterministic.

## 5. `sort_order` is a required caller parameter — and it is 1-BASED

`cloudAddMeal` reads `(S.meals[date]||[]).length` — the LOCAL array, which §2 just
deleted.

**Ruling: `addMeal(date, meal, sortOrder)`, required, not optional.** Keeps the data
layer stateless and avoids a second round trip per meal logged.

**CORRECTED after the live survey.** The interview said the caller passes
`list.length`. That is WRONG and would have written a different number than the old
app on every single insert. All five `cloudAddMeal` call sites push the meal onto the
local array BEFORE calling it (696→700, 802→805, 2062→2065, 2299→2304, 3578→3581),
and `cloudAddMeal` then reads the length AFTER that push. So the first meal of a day
is stored as **1, not 0**.

The live data confirms it: across all 16 populated days, no day's minimum
`sort_order` is 0 — every day starts at 1 or higher.

**The contract is therefore `sortOrder = dayList.length + 1`**, where `dayList` is the
day's currently fetched rows. Note this reproduces the old app's collisions faithfully
too: after a mid-list delete the local array shrank, so lengths repeat — which is
exactly why the real data contains `[2,2,3,4,5,6]` on 2 Jun, `[3,3,3,4,8]` on 3 Jun
and `[3,3,4,4]` on 9 Jun. The new app's fetched list shrinks the same way and collides
the same way. §4's `id` tiebreak is what makes those days render deterministically.

Rejected: `max(sort_order)+1`. More robust, and it produces a DIFFERENT stored number
than the old app on any day containing a deleted meal — a stored-number change.

## 6. `custom_foods` keeps its two-target upsert

Line 2119: `const onConflict = food.barcode ? 'barcode' : 'name';` — two different
conflict targets against one table, relying on unique constraints we must not touch.

**Ruling: port the branch.** Re-scanning a renamed product must update its row, which
is the whole reason the barcode branch exists. If Postgres rejects the upsert for
want of a matching unique constraint, the `Result` returns `kind:"conflict"` carrying
the real message — surfaced, never swallowed. If that happens we report it; we do not
propose a constraint, because that would be a schema change.

## 7. Writes return a typed `Result` and never throw

```ts
type Result<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { kind: ErrorKind; message: string } };
```

`ErrorKind` is a small closed union (network / conflict / not-found / unknown).

This mirrors the old app's boolean-returning `cloudLogW` / `cloudDelW` (2000, 2009)
but keeps the reason. Phase 3+ decides optimistic-vs-pessimistic per surface; the
data layer stays a pure pipe, and §4.4's Error state has something real to say.

**Rejected:** the data layer owning optimistic state and rollback. That is state
management, it is UI-coupled, and it would be building ahead of Phases 3–8.

## 8. Two write quirks: one preserved, one overruled

| Quirk | Ruling |
|---|---|
| `cloudDelMeal` returns `true` when given no id (2036) | **Preserved.** It is a genuine no-op; reporting failure would make Phase 4 show an error for an action that changed nothing |
| `cloudSetWater` (2165) returns nothing and only `console.error`s (2168) | **Overruled.** It is the one write with no error surface. §4.4 forbids a silent failure, so water returns the same `Result` as everything else. The silence is an oversight, not a behaviour |

This is the only place Phase 2 knowingly diverges from the old app's control flow.
It changes no stored value — a successful water write is byte-identical.

## 9. Browser-only client, one shared instance

**Ruling: the Supabase client runs in the browser only**, exactly the old app's
pattern (1842–1848). Plan §8 already requires it: *"no new CRUD routes needed where
the old app used the Supabase JS client directly; preserve that pattern."*

Server-component reads were considered and rejected for Phase 2: they would add a
second client, a per-route caching policy and a revalidation story for every write —
real architecture Phases 3–8 would inherit, with no old-app equivalent to translate.
It also keeps the anon key in the one place it is allowed and keeps `service_role`
out of the client by construction.

## 10. Per-table fetchers, no global sync

The old app's `Promise.all` over five tables (1866) existed to hydrate one global `S`
object on load. There is no global store now, so the batch has no job.

**Ruling:** `fetchWeights()`, `fetchMealsForDate(date)`, `fetchCustomMeals()`,
`fetchCustomFoods()`, `fetchWaterForDate(date)` — one query each, each returning a
`Result`. Every surface asks for exactly what it renders. No `fetchAll()`: it would
become the default because it is easy, and Dashboard would silently download every
meal ever logged.

## 11. Environment, layout and tests

| Decision | Ruling |
|---|---|
| Env vars | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Gitignored `.env.local` for dev; committed `.env.example` with names and no values; the same two added by the owner in the Vercel dashboard for all three environments. The client throws a NAMED error at construction if either is missing — never a silently broken client. Anon key public by design (§2); `service_role` never appears |
| Location | `lib/data/` — `client.ts`, `types.ts`, `mappers.ts`, then `weights.ts` / `meals.ts` / `customMeals.ts` / `customFoods.ts` / `water.ts`, plus an `index.ts` barrel. Mirrors `lib/engine/` so the repo has one idiom. `mappers.ts` is separate precisely so the crown jewel is reviewable on its own |
| Tests | `tests/data/`. Mappers tested directly against real rows captured as fixtures — that is where the risk lives. Repositories tested against a hand-written fake client returning those fixtures and canned errors, proving query shape, ordering keys, `onConflict` targets and every `Result` error path. **No network in CI** |
| Fixtures | Macros **verbatim** — they are the oracle and cannot be offset without destroying the `qty × perUnit` relationships that are under test (contrast the weight fixture's −9.0 kg offset, PHASE-1-DECISIONS §5, which preserves differences). Row ids replaced with synthetic UUIDs. Dates and product names kept real: a product name is not personal information in the way bodyweight is |
| Dates | The data layer owns no clock. Every `date` is a caller-supplied `YYYY-MM-DD` local calendar string and `logged_time` is whatever the caller passes — same as the old app, where `now()` and `S.mdate` are the caller's concern |

## 12. Live DB survey — 2026-07-31, read-only, anon key

Project `ajajsaquxmimsdxbueqb`. Row counts: `weight_logs` 36 · `meal_logs` 37 ·
`custom_meals` 4 · `water_logs` 1 · `custom_foods` 11. All five tables exist and are
readable with the anon key, confirming §1.

**1. Dates are BARE `YYYY-MM-DD`. RESOLVED.** All 36 `weight_logs`, all 37 `meal_logs`
and the `water_logs` row return a bare date. The old app's comment at 1882 —
*"Supabase returns 'YYYY-MM-DDT00:00:00' for date columns"* — is **wrong**, and its
`.slice(0,10)` (1883, 1893, 1984) is a no-op. Per the owner's instruction:
`lib/engine/trend.ts`'s `msFromIsoDate` guard **stays**; its comment now states the
confirmed fact instead of hedging. Our mappers keep a defensive slice for the same
reason — the column type is not ours to control.

**2. Zero hidden precision. §3's rounding is currently a no-op.** Checked every value:
0 of 36 weights carry more than 2 dp; 0 of 148 `meal_logs` macro values and 0 of 16
`custom_meals` macro values differ from the mapper's rounded form. So §3 costs nothing
today and changes no number. It is kept anyway — it is the old app's behaviour, it is
free, and the column types that make it redundant are not ours to guarantee.

**3. `sort_order` is 1-based, and messier than assumed.** See §5 — this overturned the
interview's ruling. Real distributions include `[2,2,3,4,5,6]`, `[3,3,3,4,8]` and
`[3,3,4,4]`. Duplicates and gaps are both live, not theoretical.

**4. `lib_id` holds a NAME, not a UUID.** Non-null values are `"Yamavegan Pasta"`,
`"English Brekkie"`, `"Greek Yoghurt Fruit Bowl"`, `"Chocolate Protein Oats"` — the
old app sets `_libId` to the meal name deliberately (3564–3565: *"UUIDs change if a
meal is deleted and recreated; names don't"*). Type it as `string | null`. Typing it
as a UUID or modelling it as a foreign key would be wrong. Null on 15 of 37 rows.

**5. The two `ings` columns have DIFFERENT shapes AND different qty conventions.**
- `meal_logs.ings_json` is a **JSON string** (`typeof === "string"`), parsed in JS
  (1898) inside a try/catch that yields `null`. Its `qty` values are bare numeric
  strings: `"200"`, `"0.75"`, `"30"`.
- `custom_meals.ingredients` is **jsonb**, arriving already parsed as an array (1945).
  Its `qty` values carry a **unit suffix**: `"1g"`, `"80g"`, `"0.9g"`.

Two tables, two conventions, both stored as strings. The old app survives this only
because `parseFloat("80g") === 80`. A typed mapper must not assume either column is
numeric, and must not assume the two agree. This is the sharpest mapping hazard found.

**6. `custom_foods`: `per100` and `per_unit` are mutually exclusive, and consistent
with `isGramUnit`.** 5 rows carry `per100` (all `unit` `g` or `ml`); 6 carry `per_unit`
(`slice`, `roll`, `biscuit`, `2 biscuits`, `2 slices`, `pops`). `unit_label` is
non-null on exactly the 6 per-unit rows. This is live proof that `unitType` had to be
typed open (PHASE-1-DECISIONS §6) — `"2 biscuits"` and `"pops"` are real stored units.
One quirk: `Albany SUPERIOR BROWN BREAD` has `unit: "2 slices"` with `default_qty: 80`,
a per-unit food whose default quantity looks like grams. Left exactly as stored.

**7. `logged_time` is free text, not a time.** Values are `"1:03"`, `"5:25"`,
`"17:19"`, `"23:25"` — unpadded `H:MM`. Map it as `string`, never parse it, never
reformat it. Non-null on all 37 rows.

**8. Uniqueness — observed, NOT confirmed.** All four `onConflict` targets are fully
distinct in the current data: `weight_logs.date` 36/36, `water_logs.date` 1/1,
`custom_meals.name` 4/4, `custom_foods.barcode` 11/11, `custom_foods.name` 11/11.
**This is data, not schema.** PostgREST's OpenAPI endpoint — the only route to declared
types and constraints — rejects the anon key and requires `service_role`, which we
never use. So the constraints backing §6's upserts cannot be verified from the client.
§6's ruling stands: a missing constraint surfaces as `kind:"conflict"` at runtime and
gets reported, never silently swallowed. If the owner wants certainty before Phase 6,
one look at the Supabase dashboard's table editor settles it.

**9. All 11 `custom_foods` rows carry a barcode.** The `onConflict:'name'` branch
(2119) has therefore never run against this data. It is ported per §6, but note it is
**untested by the oracle** — no stored row exercises it.

**The Phase 1 fixture gap is CLOSED.** `tests/fixtures/meal_logs.json` (2 real days,
9 rows), `custom_meals.json` (4 rows) and `custom_foods.json` (11 rows + 77
`macrosForQuantity` cases) now oracle the mapping and the macro arithmetic against
STORED rows. PHASE-1-DECISIONS §5's outstanding item is discharged.

## 14. Live read-only smoke check — every query chain, against the real DB

Run once before committing, read-only, no writes. All seven chains `lib/data` sends
returned rows without error:

| Chain | Result |
|---|---|
| `fetchWeights` — order `date` | 36 rows |
| `fetchMealsForDate` — order `date`,`sort_order`,`id` | 5 rows |
| `fetchAllMeals` — same three keys | 37 rows |
| `fetchCustomMeals` — order `created_at` | 4 rows |
| `fetchCustomFoods` — order `created_at` | 11 rows |
| `fetchWaterForDate` / `fetchAllWater` | 1 row |

The third ordering key is the ONLY query element the old app never ran, so it was the
one worth proving: PostgREST accepts `.order("id")`, and 3 June's tied `sort_order`s
now come back with ascending ids within each tie — `[3,3,3,4,8]`, stable.

## 15. Rulings taken at `/review`, before commit

**Water reads take the LAST row, not the first.** `fetchWaterForDate` originally took
`rows[0]`; `fetchAllWater` builds a keyed map, so it takes the last. The old app's
`forEach` assignment (1984) is also last-wins. Two readers in the same file disagreed
with each other and one disagreed with the old app. Resolved to last-wins everywhere,
with two tests pinning it. This only bites if a date has duplicate rows — and
`water_logs` holds exactly ONE row, so its date uniqueness is observed on a sample of
one and is not schema-verified (§12 finding 8). Precisely the case where a silent
disagreement produces a wrong number no test would catch.

**Plan §9.2's `CLAUDE.md` length target amended ~60 → ~130 lines** (Plan changelog
v1.4). The original number predated every phase and cannot hold §9.2's own seven
mandated content areas plus the Phase 1 and Phase 2 decision blocks. Trimming was
rejected: the material worth cutting for length is exactly the material that stops a
later session from "cleaning up" the trend rounding or the 1-based `sort_order`.

---

**Writes were NOT smoke-tested.** Every insert/upsert/delete path is covered by the
fake-client tests only. Exercising them for real would write rows to the oracle
database, and the oracle is the one thing this phase must not disturb. The first real
write happens in Phase 3 on the owner's phone, which is where Plan §9 puts verification
anyway.

## 13. Credential incident — recorded so it is not rediscovered

The URL and anon key first supplied for this phase belonged to project ref
`qabffglgenndgimwcddh`, which does not resolve on any public DNS resolver. The URL
and the key's `ref` claim agreed with each other, so it was not a typo — it was a
different project's credentials.

The live old app (`nutri-sa-three.vercel.app`) points at **`ajajsaquxmimsdxbueqb`**,
which resolves and responds. The owner confirmed there is exactly one Supabase
project, named NutriSA, serving both the old and new apps — consistent with Plan §2.

**`ajajsaquxmimsdxbueqb` is the correctness oracle.** Any future session finding
`qabffglgenndgimwcddh` anywhere should treat it as wrong.
