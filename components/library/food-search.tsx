"use client";

/**
 * The ingredient search box. Ports `mbSearch` (1033), `qlSearch` (2172) and
 * `logAddSearch` (3418) — three copies of one widget in the old app — plus the
 * input markup at 1098–1105.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DROPDOWN RULE (Project Instructions — the most important one). This is
 * the first surface in the migration to hand-render a dropdown, which is why
 * Phase 4 deferred search to here (PHASE-4-DECISIONS §4).
 *
 *   1. **`onMouseDown` + `preventDefault()`, NEVER `onClick`.** Blur fires
 *      before click. With `onClick` the input blurs, a blur handler (or a
 *      re-render that closes the list) tears the option out of the DOM, and the
 *      click never lands on anything — the tap silently does nothing. Calling
 *      `preventDefault()` in `onMouseDown` stops the blur from happening at
 *      all, so focus never leaves the input and the selection always fires.
 *      The old app does exactly this at 1042 and it is the one piece of that
 *      markup that must survive translation intact.
 *   2. **Click-outside-to-close**, on `pointerdown` so it beats the same blur.
 *   3. **Enter selects the first result, Escape closes.** Old app 1102–1103.
 *
 * `onMouseDown` alone would not fire for a keyboard or a screen-reader user, so
 * each option is a real `<button>` and carries `onClick` as well. That is not a
 * violation of the rule — the rule forbids `onClick` INSTEAD OF `onMouseDown`,
 * not in addition to it. `preventDefault()` in the mousedown means the click
 * that follows a tap is harmless: `selecting` is guarded so one tap adds one
 * food, never two.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **The pool is a PROP, not a hook call** (eng review D4). Up to three of these
 * can be mounted at once on Nutrition — Quick Log plus an Add Item per open
 * editor — and a `useCustomFoods()` inside would mean three reads of one table
 * and three copies of the truth.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";

import { isGramUnit } from "@/lib/engine/macros";
import { isFlagged, type SearchableFood } from "@/lib/food-db";
import { foodIdentity, searchFoods } from "@/lib/food-search";

export type FoodSearchProps = {
  /** Built-ins + the user's custom foods. Built by `foodPool()` on the page. */
  pool: readonly SearchableFood[];
  /** Called once per selection. The composer decides add-vs-top-up. */
  onSelect: (food: SearchableFood) => void;
  placeholder?: string;
  /** Accessible name for the input — there is no visible <label>. */
  ariaLabel: string;
};

/** `per 100g` / `per scoop (33g)`. Old app 1040. */
function basisLabel(food: SearchableFood): string {
  return isGramUnit(food)
    ? `per 100${food.unit}`
    : `per ${food.unitLabel || food.unit}`;
}

/** The macros a result row shows: whichever basis the food actually carries. */
function basisMacros(food: SearchableFood) {
  return isGramUnit(food) ? food.per100 : food.perUnit;
}

export function FoodSearch({
  pool,
  onSelect,
  placeholder = "Search ingredient (e.g. tofu, oats, paneer, banana)…",
  ariaLabel,
}: FoodSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Guards the mousedown/click pair. `preventDefault()` stops the blur but NOT
   * the click that follows, so without this a tap on an option would call
   * `onSelect` twice — and a double top-up is a wrong quantity that looks
   * deliberate.
   *
   * A TIMESTAMP, NOT A BOOLEAN, because the flag has to heal itself. A
   * mousedown does not always produce a click — drag the finger off the option,
   * or let the OS cancel the touch, and the pair never completes. A boolean set
   * on mousedown and cleared only in the click handler stays stuck true, and the
   * next click-only selection (keyboard Enter on a focused option, or a screen
   * reader's synthetic click) is silently swallowed. A stale timestamp simply
   * ages out.
   */
  const lastMouseDown = useRef(0);

  /** How long after a mousedown its paired click is still expected. */
  const CLICK_PAIR_MS = 700;

  const listId = useId();

  // Recomputed per keystroke. `searchFoods` is a capped substring scan over ~80
  // entries; the old app's 300ms debounce existed because it was writing
  // innerHTML, which React is not doing.
  const results = searchFoods(query, pool);
  const showList = open && query.trim().length > 0;

  /* ── Click-outside-to-close ─────────────────────────────────────────────
     `pointerdown`, not `click`: the same blur-before-click ordering that makes
     `onClick` wrong on the options would make a `click` listener here fire
     after the list had already gone. */
  useEffect(() => {
    if (!showList) return;

    function onPointerDown(event: PointerEvent) {
      const wrap = wrapRef.current;
      if (wrap && !wrap.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showList]);

  const select = useCallback(
    (food: SearchableFood) => {
      onSelect(food);
      // Old app 983–985: clear the box, drop the list, put focus back. The
      // next ingredient is almost always typed straight away.
      setQuery("");
      setOpen(false);
      inputRef.current?.focus();
    },
    [onSelect],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter = select first (old app 1102). Deliberately NOT an arrow-key
    // roving highlight: the rule is "Enter = select first", and a highlight
    // would make Enter mean something that depends on invisible state.
    if (event.key === "Enter") {
      event.preventDefault();
      const first = results[0];
      if (first) select(first);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-btn border border-border bg-bg3 py-2 pl-9 pr-3 text-body text-text placeholder:text-text-3"
      />

      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label={`${ariaLabel} results`}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-card border border-border bg-bg2 shadow-lg"
        >
          {results.length === 0 ? (
            // The old app's own empty line (1037). It says which query found
            // nothing, so a stale box is obvious.
            <p className="px-3 py-3 text-label text-text-3">
              No ingredients found for “{query.trim()}”
            </p>
          ) : (
            results.map((food) => {
              const macros = basisMacros(food);
              const flagged = isFlagged(food.name);

              return (
                <button
                  /* `foodIdentity`, NOT name+unit. Eng review D6 exists
                     precisely because a custom food may carry the same name as
                     a built-in — and it will usually carry the same unit too.
                     Two options sharing a React key is a duplicate-key warning
                     at best and the WRONG food being selected after a
                     re-render at worst. The id is what tells them apart. */
                  key={foodIdentity(food)}
                  type="button"
                  role="option"
                  aria-selected={false}
                  /* THE RULE. preventDefault stops the blur; the selection
                     happens here, on mousedown, not on click. */
                  onMouseDown={(event) => {
                    event.preventDefault();
                    lastMouseDown.current = Date.now();
                    select(food);
                  }}
                  /* Keyboard and assistive-tech path only — a real tap has
                     already been handled above and is swallowed by the guard. */
                  onClick={() => {
                    if (Date.now() - lastMouseDown.current < CLICK_PAIR_MS) {
                      return;
                    }
                    select(food);
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-bg3"
                >
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-body font-medium ${flagged ? "text-amber" : "text-text"}`}
                    >
                      {food.name}
                      {flagged && " ⚠️ Off-plan"}
                    </span>
                    <span className="block text-label text-text-3">
                      {food.cat} · {basisLabel(food)}
                    </span>
                  </span>

                  {macros && (
                    <span className="shrink-0 text-right text-label" data-numeric>
                      <span className="block text-text-2">{macros.kcal} kcal</span>
                      <span className="block text-text-3">
                        <span className="text-protein">{macros.pro}g P</span> ·{" "}
                        {macros.carb}g C · {macros.fat}g F
                      </span>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
