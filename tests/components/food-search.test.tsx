// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FoodSearch } from "@/components/library/food-search";
import { FOOD_DB, type SearchableFood } from "@/lib/food-db";
import { foodPool } from "@/lib/food-search";

/**
 * THE DROPDOWN RULE, pinned by test.
 *
 * From the Project Instructions, and the single most important rule in this
 * project: custom dropdown items use `onmousedown` + `preventDefault()`, NEVER
 * `onclick`, because blur fires before click and kills the selection. Always
 * click-outside-to-close. Always Enter = select first, Escape = close.
 *
 * This is the first surface in the migration to hand-render a dropdown (Phase 4
 * deferred search precisely so it would land here), and it is the file that
 * stops the rule from being quietly regressed by someone who reads
 * `onMouseDown` as a typo for `onClick`.
 *
 * `@testing-library/jest-dom` is NOT installed — see `tsx-canary.test.tsx`. All
 * assertions here read the DOM directly.
 */

/**
 * EXPLICIT CLEANUP IS REQUIRED HERE. `@testing-library/react` auto-registers an
 * `afterEach(cleanup)` only when the runner exposes global hooks, and this repo
 * runs Vitest WITHOUT `globals: true` (see `vitest.config.mts`). Without this
 * line every `render` stacks another copy in the same document, and
 * `getByRole("combobox")` starts failing with "found multiple elements" in
 * whichever test happens to run second. Any `.test.tsx` that renders must do
 * the same.
 */
afterEach(cleanup);

const POOL = foodPool();

function setup(onSelect = vi.fn(), pool: readonly SearchableFood[] = POOL) {
  render(<FoodSearch pool={pool} onSelect={onSelect} ariaLabel="Search food" />);
  const input = screen.getByRole("combobox") as HTMLInputElement;
  return { onSelect, input };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
}

describe("the dropdown rule — mousedown, never click alone", () => {
  it("selects on mousedown", () => {
    const { onSelect, input } = setup();
    type(input, "tofu");

    const option = screen.getByRole("option");
    fireEvent.mouseDown(option);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].name).toBe("Vejoy Tofu");
  });

  it("calls preventDefault on that mousedown — this is what stops the blur", () => {
    // If preventDefault stops being called, focus leaves the input, the list
    // unmounts, and on a real device the tap does nothing at all. The symptom
    // is "the dropdown doesn't work sometimes", which is very hard to find.
    const { input } = setup();
    type(input, "tofu");

    const option = screen.getByRole("option");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(option, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("a real tap — mousedown then click — selects exactly ONCE", () => {
    // preventDefault suppresses the blur but NOT the click that follows. The
    // guard inside the component is what keeps one tap from adding two foods.
    const { onSelect, input } = setup();
    type(input, "tofu");

    const option = screen.getByRole("option");
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("still selects on a bare click, for keyboard and assistive tech", () => {
    // Options are real <button>s. A keyboard Enter on a focused option fires
    // click with no preceding mousedown, and that path must work too.
    const { onSelect, input } = setup();
    type(input, "tofu");

    fireEvent.click(screen.getByRole("option"));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("the dropdown rule — keyboard", () => {
  it("Enter selects the FIRST result", () => {
    const { onSelect, input } = setup();
    // "protein" matches several foods; pool order decides which is first.
    type(input, "protein");

    const firstName = screen.getAllByRole("option")[0].textContent;
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(firstName).toContain(onSelect.mock.calls[0][0].name);
  });

  it("Enter with no results selects nothing and does not throw", () => {
    const { onSelect, input } = setup();
    type(input, "zzzznotafood");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Escape closes the list", () => {
    const { input } = setup();
    type(input, "tofu");
    expect(screen.queryAllByRole("option")).not.toHaveLength(0);

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("the dropdown rule — click outside", () => {
  it("closes when a pointerdown lands outside the widget", () => {
    const { input } = setup();
    type(input, "tofu");
    expect(screen.queryAllByRole("option")).not.toHaveLength(0);

    fireEvent.pointerDown(document.body);

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("stays open when the pointerdown is inside it", () => {
    const { input } = setup();
    type(input, "tofu");

    fireEvent.pointerDown(screen.getByRole("option"));

    expect(screen.queryAllByRole("option")).not.toHaveLength(0);
  });
});

describe("results", () => {
  it("shows nothing until something is typed", () => {
    const { input } = setup();
    fireEvent.focus(input);

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("says which query found nothing", () => {
    const { input } = setup();
    type(input, "zzzznotafood");

    expect(document.body.textContent).toContain("zzzznotafood");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("caps at the old app's 8 results", () => {
    const { input } = setup();
    // "a" matches far more than eight of the 74 built-ins.
    type(input, "a");

    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(8);
  });

  it("clears the box after a selection, ready for the next ingredient", () => {
    const { input } = setup();
    type(input, "tofu");
    fireEvent.mouseDown(screen.getByRole("option"));

    expect(input.value).toBe("");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("marks an off-plan food in the results", () => {
    const { input } = setup();
    type(input, "olive");

    expect(screen.getByRole("option").textContent).toContain("Off-plan");
  });

  it("shows the per-100 basis for a gram food and the unit label otherwise", () => {
    const { input } = setup();

    type(input, "Vejoy Tofu");
    expect(screen.getByRole("option").textContent).toContain("per 100g");

    type(input, "Vanilla Whey");
    expect(screen.getByRole("option").textContent).toContain("per scoop (33g)");
  });

  it("never offers a food that cannot be computed (D7)", () => {
    // A `custom_foods` row whose basis does not match its unit. Offering it
    // would put a throwing food one tap away.
    const broken = {
      ...FOOD_DB[0],
      _id: "broken-1",
      name: "Broken Tofu",
      per100: undefined,
    } as unknown as SearchableFood;

    const { input } = setup(vi.fn(), foodPool([broken]));
    type(input, "Broken");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
