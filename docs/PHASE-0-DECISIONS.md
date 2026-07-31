# Phase 0 — decisions record

**Dated 2026-07-31.** Answers given by the owner in the Stage-0 interview
(Plan §9) before any code was written. These resolve points the Migration Plan
left open or that the scaffold's actual stack forced. They are not feature
additions — the §3 inventory is untouched.

Where a decision contradicts nothing in the Plan it is simply a choice; where it
interprets the Plan, the reasoning is recorded so a later session does not
silently re-decide it.

| # | Decision | Reasoning |
|---|---|---|
| 1 | **shadcn/ui not installed in Phase 0.** Tokens defined standalone; shadcn arrives in the phase that first needs a primitive and maps onto them. | The scaffold is Tailwind v4, where `shadcn init` writes its own oklch token set that collides conceptually with §4's names. Installing it now would add Radix + cva + a token layer nothing consumes. §4 is explicit that the NutriSA tokens ARE the theme, so they stay canonical. |
| 2 | **Hand-written `public/sw.js`, no dependency.** | §4.5 asks for shell-cache only. `next-pwa` is unmaintained and unverified on Next 16; Serwist does more than asked. ~60 readable lines match the spec exactly, and the passthrough rules make the §0.3 "no offline writes" guarantee auditable at a glance. |
| 3 | **Placeholder icon mark generated** (`scripts/generate-icons.mjs`), not final artwork. | Install needs real icons or the home-screen result looks broken. Drawn as an SVG path rather than set as text, because SVG text rasterisation depends on fonts installed on the build machine and Barlow is not one of them. Replace `mark()` and run `npm run icons` to swap in real artwork; the manifest already points at the output. |
| 4 | **GitHub repo exists; Vercel project to be created by the owner.** Phone verification happens on the Vercel preview URL. | A phone cannot install a PWA from a laptop's localhost — it is not a secure context for that device. No env vars are needed at Phase 0; Supabase lands in Phase 2. |
| 5 | **Text ramp frozen**: `--text #E9ECF2` (16.4:1) · `--text-2 #9BA3B4` (7.2:1) · `--text-3 #6C7686` (4.6:1). `--border #242A38` as specced. | §4.1 says "pick the three hexes once and reuse". Tertiary at 4.6:1 keeps uppercase eyebrow labels recessive without dropping below AA for their size. **Owner to confirm on the real OLED screen** — cheap to change now, expensive after Phase 8. |
| 6 | **Radius 12 / 8** (`--radius-card` / `--radius-btn`). | Top of §4.3's 10–12px range; reads as the consumer instrument rather than a terminal. Deliberately NOT named `--radius-sm` — Tailwind v4 ships its own `--radius-sm`, and redefining it would silently break the `rounded-sm` utility. |
| 7 | **Dashboard at `/`, `(tabs)` route group for the shell.** | The installed PWA launches straight onto the Dashboard with no redirect and no blank frame, which is what §4.5's "feels native, not a white flash" is protecting. |
| 8 | **lucide-react for nav icons.** | One tree-shaken dependency, and it is shadcn's default icon set — so adopting shadcn later does not introduce a second icon system. |
| 9 | **Vitest installed in Phase 0 with a real smoke test.** | §9.1's commit block runs `npm test` before every commit; with no test script that line errors from this phase onward. The test is infrastructure, not Phase 1 engine work — it asserts the token contract, not any §6 function. |
| 10 | **Type ramp encoded in rem, fixed (not fluid).** | Identical to §4.2's px at default root size, but respects a reader's browser font-size setting. Fixed rather than `clamp()` so the number on the laptop is the number on the phone — which matters when checking against the old app during cutover. |
| 11 | **Install prompt built in Phase 0**, including the iOS manual-install hint. | Phase 0's verify gate is literally "installed on phone home screen". Building it now means the install path is exercised this phase rather than discovered broken in Phase 9. |
| 12 | **`/styleguide` ships in production, unlinked from the nav.** | The point is checking the palette on the real OLED screen in real lighting, which is impossible if it is dev-only. One static page; single-user tool. |

## Two defects found and fixed during Phase 0 implementation

Recorded because both are the kind of thing that silently reappears.

1. **`font-display` set only the family.** Barlow Condensed is loaded in exactly
   one cut (800 italic), so a `font-family`-only utility let the browser
   faux-synthesise a 400-upright from that file — every page title in the app
   would have been subtly wrong. Fixed by making `font-display` a custom
   `@utility` that binds family + `font-style: italic` + `font-weight: 800`
   together, so the correct usage is the only usage.

2. **`/styleguide` read its token values inside `requestAnimationFrame`**, which
   does not fire in a background tab — every swatch stayed blank. Replaced with
   `useSyncExternalStore` over a module-cached snapshot: the stylesheet is
   render-blocking, so the values are available at first client render.

## Known gap — the hex invariant is only half enforced

`tests/tokens.test.ts` guarantees "each hex exactly once" **within
`app/globals.css` only**. Three files outside CSS necessarily restate `--bg`
or `--blue`, because each is read before any stylesheet exists:

| File | Value | Why it cannot reference a CSS variable |
|---|---|---|
| `app/layout.tsx` | `viewport.themeColor` | The browser reads it to paint the status bar pre-CSS |
| `app/manifest.ts` | `theme_color`, `background_color` | JSON manifest; drives the splash screen |
| `scripts/generate-icons.mjs` | `BG`, `BLUE` | Rasterises PNGs at build time |

Nothing currently fails if these drift from `globals.css`. Changing `--bg` or
`--blue` means grepping for the old hex and updating all four sites by hand.
Extending the token test to assert cross-file agreement is the obvious fix and
is logged as a follow-up, not done in Phase 0.

## Deliberately NOT done in Phase 0

Supabase client, any §6 function, any chart, shadcn, real icon artwork, the
four-states matrix ticks (the tab pages are stubs, not surfaces — they earn no
`STATUS.md` tick).
