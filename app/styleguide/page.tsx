"use client";

import { useSyncExternalStore } from "react";

/**
 * The token documentation surface (§10 Phase 0).
 *
 * Deliberately reads every hex at RUNTIME via getComputedStyle rather than
 * restating it. globals.css stays the only place a hex is written, and this
 * page doubles as a live check that the bare-name alias layer (--bg -> the
 * @theme token) actually resolves. If a swatch shows a blank value, the alias
 * chain is broken.
 *
 * Ships in production, unlinked from the nav: the whole point is to check the
 * palette on the real phone screen in real lighting.
 */

type TokenValues = Record<string, string>;

const EMPTY: TokenValues = {};

/** getComputedStyle never changes here — the palette is static per session. */
const NEVER_CHANGES = () => () => {};

/**
 * Cached at module scope so the snapshot is referentially stable. Returning a
 * fresh object on every render would spin useSyncExternalStore forever.
 */
let snapshot: TokenValues | null = null;

function readTokens(names: readonly string[]): TokenValues {
  if (snapshot) return snapshot;

  const style = getComputedStyle(document.documentElement);
  const next: TokenValues = {};
  for (const name of names) {
    // Browsers normalise #0066ff to #06f; expand it back so the page shows the
    // value as it is actually authored in globals.css.
    const raw = style.getPropertyValue(name).trim();
    next[name] = /^#[0-9a-f]{3}$/i.test(raw)
      ? `#${raw
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")}`
      : raw;
  }

  snapshot = next;
  return next;
}

/**
 * Reads the live CSS variables. useSyncExternalStore rather than an effect:
 * the stylesheet is render-blocking so the values are available at first client
 * render, and unlike requestAnimationFrame this still resolves when the page is
 * loaded in a background tab.
 */
function useTokenValues(names: readonly string[]): TokenValues {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => readTokens(names),
    () => EMPTY,
  );
}

const SURFACES = [
  { token: "--bg", role: "Page background" },
  { token: "--bg2", role: "Card / panel / modal" },
  { token: "--bg3", role: "Insets, secondary elements, skeletons" },
  { token: "--border", role: "1px borders — one value everywhere" },
] as const;

const TEXT = [
  { token: "--text", role: "Primary — values, headings" },
  { token: "--text-2", role: "Secondary — supporting text" },
  { token: "--text-3", role: "Tertiary — labels, eyebrows, meta" },
] as const;

const SEMANTIC = [
  { token: "--blue", role: "Primary · navigation · progress · focus" },
  { token: "--green", role: "Loss · goal achieved · on-track" },
  { token: "--red", role: "Gain · over-target · destructive" },
  { token: "--amber", role: "Warning · check intake" },
] as const;

const MACRO = [
  { token: "--protein", role: "Protein ONLY" },
  { token: "--carbs", role: "Carbs ONLY" },
  { token: "--fats", role: "Fat ONLY" },
] as const;

const ALL_TOKENS = [
  ...SURFACES.map((s) => s.token),
  ...TEXT.map((t) => t.token),
  ...SEMANTIC.map((s) => s.token),
  ...MACRO.map((m) => m.token),
] as const;

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-section font-semibold text-text">{title}</h2>
      {note && <p className="mt-1 text-body text-text-2">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-medium uppercase text-text-3">
      {children}
    </span>
  );
}

function Swatch({
  token,
  role,
  value,
}: {
  token: string;
  role: string;
  value: string | undefined;
}) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-bg2 p-3">
      <div
        className="size-11 shrink-0 rounded-btn border border-border"
        style={{ backgroundColor: `var(${token})` }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-card font-semibold text-text">{token}</p>
        <p className="text-label text-text-2" data-numeric>
          {value || "—"}
        </p>
        <p className="mt-0.5 text-label text-text-3">{role}</p>
      </div>
    </li>
  );
}

export default function StyleguidePage() {
  const values = useTokenValues(ALL_TOKENS);

  return (
    <main className="mx-auto max-w-md px-4 pt-safe pb-16">
      <header className="pt-8">
        <Label>Migration Plan §4</Label>
        <h1 className="mt-1 font-display text-title text-text">
          NutriSA styleguide
        </h1>
        <p className="mt-2 text-body text-text-2">
          Every value on this page is read live from the CSS variables. Hex is
          written once, in <code className="text-text">globals.css</code>.
        </p>
      </header>

      <Section title="Surfaces" note="Elevation is surface lift, not shadow.">
        <ul className="grid gap-2">
          {SURFACES.map(({ token, role }) => (
            <Swatch
              key={token}
              token={token}
              role={role}
              value={values[token]}
            />
          ))}
        </ul>
      </Section>

      <Section title="Text ramp">
        <ul className="grid gap-2">
          {TEXT.map(({ token, role }) => (
            <Swatch
              key={token}
              token={token}
              role={role}
              value={values[token]}
            />
          ))}
        </ul>
        <div className="mt-3 rounded-card border border-border bg-bg2 p-4">
          <p className="font-display text-hero text-text" data-numeric>
            87.4
          </p>
          <p className="text-body text-text-2">Trend down 0.3 kg this week</p>
          <p className="mt-2 text-label font-medium uppercase text-text-3">
            Weekly rate
          </p>
        </div>
      </Section>

      <Section
        title="Semantic colour"
        note="Colour is meaning. None of these is decoration."
      >
        <ul className="grid gap-2">
          {SEMANTIC.map(({ token, role }) => (
            <Swatch
              key={token}
              token={token}
              role={role}
              value={values[token]}
            />
          ))}
        </ul>
      </Section>

      <Section
        title="Macro colour — reserved"
        note="Each of these belongs to its macro and to nothing else, on every screen."
      >
        <ul className="grid gap-2">
          {MACRO.map(({ token, role }) => (
            <Swatch
              key={token}
              token={token}
              role={role}
              value={values[token]}
            />
          ))}
        </ul>

        <div className="mt-3 grid gap-3 rounded-card border border-border bg-bg2 p-4">
          {[
            { token: "--protein", label: "Protein", value: 96, target: 150 },
            { token: "--carbs", label: "Carbs", value: 180, target: 220 },
            { token: "--fats", label: "Fat", value: 52, target: 70 },
          ].map(({ token, label, value, target }) => (
            <div key={token}>
              <div className="flex items-baseline justify-between">
                <Label>{label}</Label>
                <span className="text-label text-text-2" data-numeric>
                  {target - value} g left
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-btn bg-bg3">
                <div
                  className="h-full rounded-btn"
                  style={{
                    width: `${(value / target) * 100}%`,
                    backgroundColor: `var(${token})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type ramp" note="Barlow Condensed 800 italic + Barlow 400–600.">
        <div className="grid gap-4 rounded-card border border-border bg-bg2 p-4">
          <div>
            <Label>Hero stat · display 800 italic · 2.75rem</Label>
            <p className="font-display text-hero text-text" data-numeric>
              88.0 kg
            </p>
          </div>
          <div>
            <Label>Page title · display 800 italic · 1.5rem</Label>
            <p className="font-display text-title text-text">Nutrition</p>
          </div>
          <div>
            <Label>Section header · 600 · 1.125rem</Label>
            <p className="text-section font-semibold text-text">Today’s meals</p>
          </div>
          <div>
            <Label>Card header · 600 · 0.9375rem</Label>
            <p className="text-card font-semibold text-text">Breakfast</p>
          </div>
          <div>
            <Label>Body · 400 · 0.9375rem · 1.6</Label>
            <p className="text-body text-text">
              Two eggs and a slice of low-GI brown bread.
            </p>
          </div>
          <div>
            <Label>Label · 500 · 0.75rem · +0.04em · uppercase</Label>
          </div>
          <div>
            <Label>Tabular numerals</Label>
            <p className="text-body text-text" data-numeric>
              1,840 / 2,100
              <br />
              1,111 / 1,111
            </p>
          </div>
        </div>
      </Section>

      <Section title="Radius" note="Never pill-rounded, never sharp.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card border border-border bg-bg2 p-4 text-center">
            <p className="text-card font-semibold text-text">--radius-card</p>
            <p className="text-label text-text-3">cards · modals · inputs</p>
          </div>
          <div className="rounded-btn border border-border bg-bg2 p-4 text-center">
            <p className="text-card font-semibold text-text">--radius-btn</p>
            <p className="text-label text-text-3">buttons · chips · badges</p>
          </div>
        </div>
      </Section>

      <Section
        title="Buttons"
        note="Tab to each one — the focus ring is --blue and always visible."
      >
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 rounded-btn bg-blue px-4 text-card font-semibold text-white transition-opacity hover:opacity-90 active:opacity-75">
            Primary
          </button>
          <button className="min-h-11 rounded-btn border border-border bg-bg2 px-4 text-card font-semibold text-text transition-colors hover:bg-bg3 active:bg-bg3">
            Secondary
          </button>
          <button className="min-h-11 rounded-btn px-4 text-card font-semibold text-text-2 transition-colors hover:text-text active:bg-bg3">
            Ghost
          </button>
          <button className="min-h-11 rounded-btn border border-red/40 px-4 text-card font-semibold text-red transition-colors hover:bg-red/10">
            Destructive
          </button>
          <button
            disabled
            className="min-h-11 rounded-btn bg-bg3 px-4 text-card font-semibold text-text-3 opacity-60"
          >
            Disabled
          </button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "On track", color: "--green" },
            { label: "Over target", color: "--red" },
            { label: "Check intake", color: "--amber" },
            { label: "Today", color: "--blue" },
          ].map(({ label, color }) => (
            <span
              key={label}
              className="rounded-btn px-2.5 py-1 text-label font-medium uppercase"
              style={{
                color: `var(${color})`,
                backgroundColor: `color-mix(in srgb, var(${color}) 14%, transparent)`,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </Section>

      <Section
        title="Loading skeleton"
        note="Skeletons are --bg3. No spinners-as-personality (§4.4)."
      >
        <div className="grid gap-2 rounded-card border border-border bg-bg2 p-4">
          <div className="h-8 w-2/3 animate-pulse rounded-btn bg-bg3" />
          <div className="h-4 w-1/2 animate-pulse rounded-btn bg-bg3" />
          <div className="h-4 w-1/3 animate-pulse rounded-btn bg-bg3" />
        </div>
      </Section>

      <p className="mt-10 text-label text-text-3">
        Touch targets on this page are ≥44px. If a swatch value reads “—”, the
        alias layer in globals.css is broken.
      </p>
    </main>
  );
}
