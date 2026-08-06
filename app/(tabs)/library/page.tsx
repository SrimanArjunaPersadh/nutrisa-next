"use client";

/**
 * The Library tab — "build a meal once, log it forever" (Plan §5.4). Ports
 * `vLib()` (3108).
 *
 * WHAT THIS PHASE SHIPS: the meal builder with live ingredient search, the
 * manual Add Custom Food form, and the saved meals grouped by category with a
 * gram editor and a log-to-today button. What it deliberately does NOT ship:
 * the barcode scanner and Open Food Facts lookup (Phase 6) and the label-photo
 * OCR (Phase 7). Both are buttons on the old form; neither is stubbed here,
 * because a button that does nothing is worse than a button that is absent.
 *
 * **THE PAGE OWNS THE FOOD POOL** (eng review D4). `useCustomFoods()` is called
 * once, here, and `foodPool()` hands the merged list down to every search box.
 * A hook per search box would mean one read of `custom_foods` per mounted
 * widget, three loading states, and three copies of the truth.
 *
 * Nothing on this page computes a macro. The builder's totals come from
 * `sumIngredients`, each row from `macrosForQuantity`, and the gram editor from
 * `scaleIngredients` — all of `lib/engine/`, all oracle-tested (Plan §6).
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { AddCustomFood } from "@/components/library/add-custom-food";
import { LibraryMeal } from "@/components/library/library-meal";
import { MealBuilder } from "@/components/library/meal-builder";
import { UndoToast, type ToastMessage } from "@/components/undo-toast";
import type { CustomFood, CustomMeal, StoredIngredient } from "@/lib/data";
import { nowHM, todayIso } from "@/lib/date";
import type { Macros } from "@/lib/engine/types";
import { isGramUnit } from "@/lib/engine/macros";
import { foodPool, unusableFoods } from "@/lib/food-search";
import { useCustomFoods } from "@/lib/hooks/useCustomFoods";
import { useCustomMeals } from "@/lib/hooks/useCustomMeals";
import { useDay } from "@/lib/hooks/useDay";
import { CATS, UNCATEGORISED, groupByCategory } from "@/lib/meal-categories";

export default function LibraryPage() {
  const router = useRouter();

  const library = useCustomMeals();
  const foods = useCustomFoods();
  // Today's day, for `sort_order` when logging from here. The old app's
  // `qaddL` (3588) sets the date to today first, and so do we.
  const today = useDay(todayIso());

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [foodFormOpen, setFoodFormOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [deletingMeal, setDeletingMeal] = useState<string | null>(null);
  const [deletingFood, setDeletingFood] = useState<string | null>(null);

  const pool = useMemo(() => foodPool(foods.foods), [foods.foods]);
  const broken = useMemo(() => unusableFoods(pool), [pool]);
  const groups = useMemo(() => groupByCategory(library.meals), [library.meals]);

  /**
   * The active tab. Explicit choice wins; otherwise the first category that
   * HAS meals, falling back to the first (old app 3111).
   */
  const activeCat = cat ?? groups[0]?.cat ?? CATS[0];
  const inCat = groups.find((g) => g.cat === activeCat)?.meals ?? [];

  const dismissToast = useCallback(() => setToast(null), []);

  /* ---- Log a saved meal to today (old app `logCustomG` 685 / `qaddL` 3588) -- */

  const handleLog = useCallback(
    async (
      meal: CustomMeal,
      macros: Macros,
      ings: readonly StoredIngredient[] | null,
    ) => {
      setLogging(meal.name);
      const result = await today.log({
        name: meal.name,
        kcal: macros.kcal,
        pro: macros.pro,
        carb: macros.carb,
        fat: macros.fat,
        time: nowHM(),
        // The NAME, not the id — a UUID changes if a meal is deleted and
        // recreated, a name does not (old app 3564).
        _libId: meal.name,
        _ings: ings,
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
        return;
      }

      // Straight to the day, as the old app does. Seeing the meal land in the
      // log is a stronger confirmation than a toast, and it is where you were
      // going next anyway. Errors stay HERE, where the tap happened.
      router.push("/nutrition");
    },
    [router, today],
  );

  /* ---- Delete a saved meal, with Undo (Phase 3 §6) ------------------------ */

  const undoDeleteMeal = useCallback(
    async (meal: CustomMeal) => {
      // Re-save under the same name. `saveCustomMeal` upserts on `name`, so
      // this restores the row rather than creating a rival (D14).
      const result = await library.save({
        name: meal.name,
        cat: meal.cat,
        note: meal.note,
        kcal: meal.kcal,
        pro: meal.pro,
        carb: meal.carb,
        fat: meal.fat,
        ingredients: meal.ingredients,
      });

      if (!result.ok) {
        setToast({
          text: `Couldn’t restore ${meal.name}: ${result.error.message}`,
          tone: "error",
        });
      }
    },
    [library],
  );

  const handleDeleteMeal = useCallback(
    async (meal: CustomMeal) => {
      setDeletingMeal(meal._id);
      const result = await library.remove(meal._id);
      setDeletingMeal(null);

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
        text: `Deleted ${meal.name}`,
        tone: "info",
        action: { label: "Undo", onClick: () => void undoDeleteMeal(meal) },
      });
    },
    [library, undoDeleteMeal],
  );

  /* ---- Delete a custom food, with Undo ----------------------------------- */

  const undoDeleteFood = useCallback(
    async (food: CustomFood) => {
      const result = await foods.save({
        name: food.name,
        cat: food.cat,
        unit: food.unit,
        defaultQty: food.defaultQty,
        per100: food.per100,
        perUnit: food.perUnit,
        unitLabel: food.unitLabel,
        barcode: food.barcode,
      });

      if (!result.ok) {
        setToast({
          text: `Couldn’t restore ${food.name}: ${result.error.message}`,
          tone: "error",
        });
      }
    },
    [foods],
  );

  const handleDeleteFood = useCallback(
    async (food: CustomFood) => {
      setDeletingFood(food._id ?? null);
      const result = await foods.remove(food._id);
      setDeletingFood(null);

      if (!result.ok) {
        setToast({
          text: `Couldn’t delete ${food.name}: ${result.error.message}`,
          tone: "error",
        });
        return;
      }

      setToast({
        text: `Deleted ${food.name} — it will no longer appear in ingredient search.`,
        tone: "info",
        action: { label: "Undo", onClick: () => void undoDeleteFood(food) },
      });
    },
    [foods, undoDeleteFood],
  );

  /* ---- Render ------------------------------------------------------------ */

  return (
    <main className="px-4 pb-8 pt-4">
      <header>
        <h1 className="font-display text-title text-text">Meal Library</h1>
        <p className="mt-0.5 text-label text-text-3">
          Build custom meals · search ingredients · edit grams · macros update
          live
        </p>
      </header>

      <div className="mt-4 grid gap-4">
        {/* ── Create Custom Meal ────────────────────────────────────────── */}
        <Card
          title="Create Custom Meal"
          open={builderOpen}
          onToggle={() => setBuilderOpen((v) => !v)}
        >
          {foods.state === "error" && (
            <p role="alert" className="mb-3 text-label text-amber">
              Your custom foods couldn’t be loaded, so search is showing the
              built-in list only. {foods.error?.message}
            </p>
          )}

          <MealBuilder
            pool={pool}
            existing={library.meals}
            /* `ready` and `empty` are the two states in which the read
               SUCCEEDED, so `meals` is the whole library and the absence of a
               clash means something. `loading` and `error` both leave it
               partial or stale (§8a keeps the last good rows), and the builder
               says so rather than implying a check it could not run. */
            existingKnown={
              library.state === "ready" || library.state === "empty"
            }
            onSave={library.save}
            onSaved={(name) =>
              setToast({ text: `Saved ${name} to your library`, tone: "info" })
            }
          />

          {library.meals.length > 0 && (
            <p className="mt-4 text-label text-text-3">
              {library.meals.length} meal
              {library.meals.length === 1 ? "" : "s"} in your library.
            </p>
          )}
        </Card>

        {/* ── Add Custom Food ───────────────────────────────────────────── */}
        <Card
          title="Add Custom Food"
          open={foodFormOpen}
          onToggle={() => setFoodFormOpen((v) => !v)}
        >
          <AddCustomFood
            existing={foods.foods}
            onSave={foods.save}
            onSaved={(name) =>
              setToast({ text: `Saved ${name} — now searchable`, tone: "info" })
            }
          />

          <div className="mt-5 border-t border-border pt-3">
            <h3 className="text-label font-medium uppercase text-text-3">
              Your custom foods ({foods.foods.length})
            </h3>

            {foods.state === "loading" && (
              <div className="mt-2 grid gap-1.5" aria-busy="true">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-card border border-border bg-bg3"
                  />
                ))}
              </div>
            )}

            {foods.state === "error" && (
              <div role="alert" className="mt-2 rounded-card border border-red/40 p-3">
                <p className="text-body text-text-2">
                  Couldn’t load your custom foods. Anything you save now will
                  still be written.
                </p>
                <p className="mt-1 text-label text-text-3">
                  {foods.error?.message}
                </p>
                <button
                  type="button"
                  onClick={() => void foods.refetch()}
                  className="mt-2 min-h-11 rounded-btn bg-blue px-4 text-body font-semibold text-text"
                >
                  Try again
                </button>
              </div>
            )}

            {foods.state === "empty" && (
              <p className="mt-2 text-body text-text-2">
                None yet. Anything you add above joins the 74 built-in foods in
                every ingredient search.
              </p>
            )}

            {foods.foods.length > 0 && (
              <>
                {broken.length > 0 && (
                  // `unusableFoods` exists so a surface can SAY this (D7).
                  // These rows are hidden from search — silently dropping them
                  // would leave the user searching for a food they saved and
                  // never learning why it is not there.
                  <p className="mt-2 text-label text-amber">
                    {broken.length} food{broken.length === 1 ? "" : "s"} below
                    can’t be used in a meal — the stored macros don’t match the
                    unit. Delete and re-add {broken.length === 1 ? "it" : "them"}.
                  </p>
                )}

                <ul className="mt-2 grid gap-1.5">
                  {foods.foods.map((food) => {
                    const macros = isGramUnit(food) ? food.per100 : food.perUnit;
                    const basis = isGramUnit(food)
                      ? `per 100${food.unit}`
                      : `per ${food.unitLabel || food.unit}`;

                    return (
                      <li
                        key={food._id ?? food.name}
                        className="flex items-center gap-3 rounded-card border border-border bg-bg3 p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-body font-medium text-text">
                            {food.name}{" "}
                            <span className="text-label text-text-3">
                              {food.cat}
                            </span>
                          </div>
                          <div className="mt-0.5 text-label text-text-3" data-numeric>
                            {macros ? (
                              <>
                                {Math.round(macros.kcal)} kcal ·{" "}
                                <span className="text-protein">
                                  {macros.pro}g P
                                </span>{" "}
                                · {macros.carb}g C · {macros.fat}g F · {basis}
                              </>
                            ) : (
                              <span className="text-amber">
                                No macros stored for a “{food.unit}” food —
                                unusable
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleDeleteFood(food)}
                          disabled={deletingFood === food._id}
                          aria-label={`Delete ${food.name}`}
                          className="min-h-11 shrink-0 rounded-btn px-3 text-label text-text-3 transition-colors hover:text-red disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </Card>

        {/* ── Meals by Category ─────────────────────────────────────────── */}
        <section className="rounded-card border border-border bg-bg2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-card font-semibold text-text">
              Meals by Category
            </h2>

            <div className="flex flex-wrap gap-1" role="tablist">
              {[
                ...CATS,
                ...(groups.some((g) => g.cat === UNCATEGORISED)
                  ? [UNCATEGORISED]
                  : []),
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={activeCat === c}
                  onClick={() => setCat(c)}
                  className={`min-h-11 rounded-btn px-3 text-label font-medium transition-colors ${
                    activeCat === c
                      ? "bg-blue text-text"
                      : "border border-border text-text-3 hover:text-text-2"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

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
                  {library.meals.length > 0
                    ? "Couldn’t refresh your saved meals — what you see is the last good read."
                    : "Couldn’t load your saved meals. Nothing was lost; this is a read problem."}
                </p>
                <p className="mt-1 text-label text-text-3">
                  {library.error?.message}
                </p>
                <button
                  type="button"
                  onClick={() => void library.refetch()}
                  className="mt-2 min-h-11 rounded-btn bg-blue px-4 text-body font-semibold text-text"
                >
                  Try again
                </button>
              </div>
            )}

            {library.state === "empty" && (
              <p className="py-6 text-center text-body text-text-2">
                No saved meals yet. Open{" "}
                <span className="text-blue">Create Custom Meal</span> above and
                build your first one — it takes a search and a tap.
              </p>
            )}

            {library.meals.length > 0 &&
              (inCat.length === 0 ? (
                <p className="py-6 text-center text-body text-text-2">
                  No {activeCat} meals yet.
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {inCat.map((meal) => (
                    <LibraryMeal
                      key={meal._id}
                      meal={meal}
                      open={openMeal === meal._id}
                      onToggle={() =>
                        setOpenMeal((id) => (id === meal._id ? null : meal._id))
                      }
                      onLog={(m, macros, ings) => void handleLog(m, macros, ings)}
                      onDelete={(m) => void handleDeleteMeal(m)}
                      logging={logging === meal.name}
                      deleting={deletingMeal === meal._id}
                    />
                  ))}
                </ul>
              ))}
          </div>
        </section>
      </div>

      <UndoToast message={toast} onDismiss={dismissToast} />
    </main>
  );
}

/** A collapsible card, as the old app's `S.openCards` sections are (3122). */
function Card({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-bg2 p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-card font-semibold text-text">{title}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-text-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
