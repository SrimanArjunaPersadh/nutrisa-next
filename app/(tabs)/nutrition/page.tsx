"use client";

/**
 * The Nutrition tab — "log my food, fast" (Plan §5.2). Ports `vN()` (2749–2857).
 *
 * WHAT PHASE 4 SHIPPED (PHASE-4-DECISIONS §3): date picker, four remaining-tiles,
 * the macro bars, the Saved Meals picker, the logged list with delete, Copy
 * Yesterday, and the per-row gram editor (pulled forward, §3a).
 *
 * WHAT PHASE 5 ADDS: Quick Log (`qlRenderWidget`, 2311) and the editor's "Add
 * Item" search (`logAddSearchWidget`, 3403). Both need ingredient search, which
 * is why §4 deferred them. Drag-drop stays CUT (§5) and so does the water
 * tracker (§1).
 *
 * **The page owns `useCustomFoods()` and passes the pool down** (eng review D4).
 * Quick Log and every open editor read one fetch, not one each.
 *
 * Every figure on this page comes from `lib/engine/day` applied to the day's
 * meals. Nothing here adds, and nothing here rounds (Plan §6).
 */

import { useCallback, useMemo, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { LoggedList } from "@/components/nutrition/logged-list";
import { MacroBars } from "@/components/nutrition/macro-bars";
import { MacroTiles } from "@/components/nutrition/macro-tiles";
import { QuickLog } from "@/components/nutrition/quick-log";
import {
  SavedMeals,
  toLoggedIngredients,
} from "@/components/nutrition/saved-meals";
import { UndoToast, type ToastMessage } from "@/components/undo-toast";
import type { CustomMeal, LoggedMeal, StoredIngredient } from "@/lib/data";
import { deleteMeal } from "@/lib/data";
import { formatDayCompact, nowHM, todayIso } from "@/lib/date";
import { dayTotals } from "@/lib/engine/day";
import type { Macros } from "@/lib/engine/types";
import { foodPool } from "@/lib/food-search";
import { useCustomFoods } from "@/lib/hooks/useCustomFoods";
import { useCustomMeals } from "@/lib/hooks/useCustomMeals";
import { useDay } from "@/lib/hooks/useDay";

export default function NutritionPage() {
  const today = todayIso();
  const [date, setDate] = useState(today);

  const { meals, state, error, refetch, log, remove, update, copyYesterday } =
    useDay(date);
  const library = useCustomMeals();
  const foods = useCustomFoods();

  // Built-ins + the user's own foods, read once for every search box on the
  // page (D4). A failed custom-foods read degrades search to the built-in 74
  // rather than breaking it — `foods.foods` is simply empty.
  const pool = useMemo(() => foodPool(foods.foods), [foods.foods]);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  /**
   * The open editor's row id, and the row being saved.
   *
   * Held by the PAGE, not by the list, so that a refetch — which replaces every
   * meal object — cannot reopen or close an editor as a side effect. The id
   * survives the new objects; a React key or index would not.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // The day's arithmetic, all of it. `meals` is what the DB returned; the
  // mappers already rounded each row on read (Phase 2, frozen), and `dayTotals`
  // rounds the sum once at the end exactly as the old app's `tot()` did.
  const totals = useMemo(() => dayTotals(meals), [meals]);

  const dismissToast = useCallback(() => setToast(null), []);

  /* ---- Logging a saved meal (old app `qadd`, 3561) ----------------------- */

  const handleLog = useCallback(
    async (meal: CustomMeal) => {
      setLogging(meal.name);
      const result = await log({
        name: meal.name,
        kcal: meal.kcal,
        pro: meal.pro,
        carb: meal.carb,
        fat: meal.fat,
        // Stamped at the moment of the tap, like the old app's `qadd` (3571).
        time: nowHM(),
        // The NAME, not the id — see the note in saved-meals.tsx (old app 3564).
        _libId: meal.name,
        _ings: toLoggedIngredients(meal),
      });
      setLogging(null);

      if (!result.ok) {
        setToast({
          text:
            result.error.kind === "network"
              ? `Couldn’t reach the server — ${meal.name} was not logged.`
              : `Couldn’t log ${meal.name}: ${result.error.message}`,
          tone: "error",
        });
      }
    },
    [log],
  );

  /* ---- Quick Log (old app `qlLogAll`, 2270) ------------------------------ */

  /**
   * Returns whether the write landed, so Quick Log knows whether to clear its
   * rows. A failed log keeps them — retyping four ingredients to retry a
   * network blip is the kind of thing that makes people stop logging.
   *
   * `_libId` is null: this entry came from no library meal, so there is nothing
   * for the editor to look up (the old app simply omits the field, 2285).
   */
  const handleQuickLog = useCallback(
    async (
      name: string,
      macros: Macros,
      ings: readonly StoredIngredient[],
    ): Promise<boolean> => {
      const result = await log({
        name,
        kcal: macros.kcal,
        pro: macros.pro,
        carb: macros.carb,
        fat: macros.fat,
        time: nowHM(),
        _libId: null,
        _ings: ings,
      });

      if (!result.ok) {
        setToast({
          text:
            result.error.kind === "network"
              ? `Couldn’t reach the server — ${name} was not logged.`
              : `Couldn’t log ${name}: ${result.error.message}`,
          tone: "error",
        });
        return false;
      }

      setToast({ text: `Logged ${name} · ${macros.kcal} kcal`, tone: "info" });
      return true;
    },
    [log],
  );

  /* ---- Delete, with Undo (§6 / Phase 3 §6) ------------------------------- */

  const undoDelete = useCallback(
    async (meal: LoggedMeal) => {
      const result = await log({
        name: meal.name,
        kcal: meal.kcal,
        pro: meal.pro,
        carb: meal.carb,
        fat: meal.fat,
        // The original time is restored, not re-stamped: this is the same meal
        // coming back, not a new one being logged.
        time: meal.time,
        _libId: meal._libId,
        _ings: meal._ings,
      });

      if (!result.ok) {
        setToast({
          text: `Couldn’t restore ${meal.name}: ${result.error.message}`,
          tone: "error",
        });
      }
    },
    [log],
  );

  const handleDelete = useCallback(
    async (meal: LoggedMeal) => {
      setDeleting(meal._id ?? null);
      const result = await remove(meal._id);
      setDeleting(null);

      if (!result.ok) {
        setToast({
          text:
            result.error.kind === "network"
              ? `Couldn’t reach the server — ${meal.name} was not deleted.`
              : `Couldn’t delete ${meal.name}: ${result.error.message}`,
          tone: "error",
        });
        return;
      }

      setToast({
        text: `Deleted ${meal.name} · ${meal.kcal} kcal`,
        tone: "info",
        action: { label: "Undo", onClick: () => void undoDelete(meal) },
      });
    },
    [remove, undoDelete],
  );

  /* ---- Re-portioning, the gram editor (§3a) ------------------------------ */

  const handleSave = useCallback(
    async (
      meal: LoggedMeal,
      macros: Macros,
      ings?: readonly StoredIngredient[] | null,
    ) => {
      if (!meal._id) return;

      setSaving(meal._id);
      const result = await update(meal._id, macros, ings);
      setSaving(null);

      if (!result.ok) {
        // The editor STAYS OPEN on failure, holding the user's edit. Closing it
        // would discard the work and read as a silent revert (§4.4).
        setToast({
          text:
            result.error.kind === "network"
              ? `Couldn’t reach the server — ${meal.name} was not updated.`
              : `Couldn’t update ${meal.name}: ${result.error.message}`,
          tone: "error",
        });
        return;
      }

      setOpenId(null);
      setToast({
        text: `Updated ${meal.name} · ${macros.kcal} kcal`,
        tone: "info",
      });
    },
    [update],
  );

  /* ---- Copy Yesterday (§6) ---------------------------------------------- */

  /**
   * Undo removes exactly the rows the copy created, by id — so a meal logged by
   * hand between the copy and the undo is never touched.
   */
  const undoCopy = useCallback(
    async (ids: readonly string[]) => {
      const failures: string[] = [];
      for (const id of ids) {
        const result = await deleteMeal(id);
        if (!result.ok) failures.push(result.error.message);
      }
      await refetch();

      if (failures.length > 0) {
        setToast({
          text: `Couldn’t remove ${failures.length} of the copied meals: ${failures[0]}`,
          tone: "error",
        });
      }
    },
    [refetch],
  );

  const handleCopyYesterday = useCallback(async () => {
    // One tap, N writes: a double-tap genuinely doubles the day, so the guard
    // is request state on the button (§6).
    if (copying) return;
    setCopying(true);
    const result = await copyYesterday();
    setCopying(false);

    switch (result.kind) {
      case "nothing-to-copy":
        setToast({ text: "Nothing was logged yesterday.", tone: "info" });
        return;

      case "partial":
        setToast({
          text: `Copied ${result.ids.length} of yesterday’s meals, then hit a problem: ${result.error.message}`,
          tone: "error",
        });
        return;

      case "copied":
        setToast({
          text: `Copied ${result.ids.length} meal${result.ids.length === 1 ? "" : "s"} from ${formatDayCompact(result.from)}`,
          tone: "info",
          action: { label: "Undo", onClick: () => void undoCopy(result.ids) },
        });
    }
  }, [copying, copyYesterday, undoCopy]);

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main className="px-4 pb-8 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-title text-text">Nutrition Log</h1>
          <p className="mt-0.5 text-label text-text-3">
            Tap + on a saved meal to log it
          </p>
        </div>
        <div className="min-w-[10rem]">
          <DatePicker
            value={date}
            onChange={setDate}
            max={today}
            ariaLabel="Choose the day to log against"
          />
        </div>
      </header>

      {state === "loading" && <LoadingState />}

      {state === "error" && (
        <ErrorState
          message={error?.message ?? "Unknown error"}
          onRetry={refetch}
          stale={meals.length > 0}
        />
      )}

      {(state === "ready" || state === "empty" || state === "error") && (
        <div className="mt-4 grid gap-4">
          {/* Tiles and bars render for an EMPTY day too: "2400 left" is the
              honest answer to "what can I still eat", and it is the number you
              open the app for in the morning. Unlike Weight, an empty day here
              is a daily normal, not an onboarding screen (§9). */}
          <MacroTiles totals={totals} />
          <MacroBars totals={totals} />

          {/* Directly above the log, as the old app places it (2841–2844). */}
          <section className="rounded-card border border-border bg-bg2 p-4">
            {/* A failed custom-foods read degrades search to the built-in 74
                rather than breaking it — but it must SAY so. Silently showing
                a shorter list leaves the user searching for a food they saved
                and never learning why it is missing, which is the same failure
                `unusableFoods` exists to prevent on the Library page (D7).
                Both search boxes on this page read this one pool, so one line
                here covers Quick Log and every open editor's Add Item. */}
            {foods.state === "error" && (
              <p role="alert" className="mb-3 text-label text-amber">
                Your custom foods couldn’t be loaded, so search is showing the
                built-in list only. {foods.error?.message}
              </p>
            )}
            <QuickLog pool={pool} onLog={handleQuickLog} />
          </section>

          <section className="rounded-card border border-border bg-bg2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-card font-semibold text-text">
                Logged · {formatDayCompact(date)}
              </h2>
              <div className="flex items-center gap-3">
                {meals.length > 0 && (
                  <span className="text-label text-text-3" data-numeric>
                    {meals.length} meal{meals.length === 1 ? "" : "s"} ·{" "}
                    {totals.kcal} kcal
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleCopyYesterday()}
                  disabled={copying}
                  className="min-h-11 rounded-btn border border-border px-3 text-label font-medium text-text-2 transition-colors hover:border-blue/50 hover:text-text disabled:opacity-40"
                >
                  {copying ? "Copying…" : "Copy Yesterday"}
                </button>
              </div>
            </div>

            <div className="mt-2">
              {meals.length === 0 ? (
                <EmptyDay />
              ) : (
                <LoggedList
                  meals={meals}
                  onDelete={(meal) => void handleDelete(meal)}
                  deleting={deleting}
                  openId={openId}
                  onToggle={setOpenId}
                  library={library.meals}
                  pool={pool}
                  onSave={handleSave}
                  saving={saving}
                />
              )}
            </div>
          </section>

          <section className="rounded-card border border-border bg-bg2 p-4">
            <h2 className="text-card font-semibold text-text">Saved Meals</h2>
            <p className="mt-0.5 text-label text-text-3">
              Search and the meal builder arrive with the Library
            </p>

            <div className="mt-3">
              {library.state === "loading" && (
                <div className="grid gap-1.5" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-card border border-border bg-bg3"
                    />
                  ))}
                </div>
              )}

              {library.state === "error" && (
                <div role="alert" className="rounded-card border border-red/40 p-3">
                  <p className="text-body text-text-2">
                    Couldn’t load your saved meals. Everything already logged
                    today is still correct.
                  </p>
                  <p className="mt-1 text-label text-text-3">
                    {library.error?.message}
                  </p>
                  <button
                    type="button"
                    onClick={library.refetch}
                    className="mt-2 min-h-11 rounded-btn bg-blue px-4 text-body font-semibold text-text"
                  >
                    Try again
                  </button>
                </div>
              )}

              {library.state === "empty" && (
                <p className="text-body text-text-2">
                  No saved meals yet. The Library tab is where they get built —
                  that lands next.
                </p>
              )}

              {library.state === "ready" && (
                <SavedMeals
                  meals={library.meals}
                  onLog={(meal) => void handleLog(meal)}
                  logging={logging}
                />
              )}
            </div>
          </section>
        </div>
      )}

      <UndoToast message={toast} onDismiss={dismissToast} />
    </main>
  );
}

/** Skeletons are --bg3, never a spinner-as-personality (§4.4). */
function LoadingState() {
  return (
    <div className="mt-4 grid gap-4" aria-busy="true" aria-label="Loading the day">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-card border border-border bg-bg3"
          />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-card border border-border bg-bg3" />
      <div className="h-56 animate-pulse rounded-card border border-border bg-bg3" />
    </div>
  );
}

/**
 * A failed day-read keeps the last good rows underneath (§8a), so this is a
 * banner above the page rather than a replacement for it.
 */
function ErrorState({
  message,
  onRetry,
  stale,
}: {
  message: string;
  onRetry: () => void;
  stale: boolean;
}) {
  return (
    <section role="alert" className="mt-4 rounded-card border border-red/40 bg-bg2 p-4">
      <h2 className="text-card font-semibold text-text">
        Couldn’t load this day
      </h2>
      <p className="mt-1 text-body text-text-2">
        {stale
          ? "What you see below is the last good read — it may be out of date. Nothing was lost."
          : "Nothing was lost — this is a read problem, not your data. Check your signal and try again."}
      </p>
      <p className="mt-2 text-label text-text-3">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-btn bg-blue px-4 text-body font-semibold text-text transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </section>
  );
}

/**
 * The Empty state (§9). Deliberately not a welcome screen: an empty day is what
 * every morning looks like, so this is a short prompt, not an explanation of
 * what NutriSA is.
 */
function EmptyDay() {
  return (
    <p className="py-6 text-center text-body text-text-2">
      Nothing logged yet. Tap <span className="text-blue">+</span> on a saved
      meal below, or copy yesterday.
    </p>
  );
}
