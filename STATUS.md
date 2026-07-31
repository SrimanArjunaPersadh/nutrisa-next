# STATUS.md — four-states acceptance matrix

Every surface ships all four states or it does not ship (Plan §4.4). A cell is ticked
ONLY after verification on the ACTUAL PHONE — not Live Server alone. This matrix IS
the Phase 9 cutover gate: cutover cannot start with an unticked cell on a shipped
surface.

Legend: `[ ]` not done · `[x]` verified on phone · `[-]` not applicable

| Surface | Empty | Loading | Error | Happy |
|---------|-------|---------|-------|-------|
| Dashboard | [ ] | [ ] | [ ] | [ ] |
| Nutrition | [ ] | [ ] | [ ] | [ ] |
| Weight | [ ] | [ ] | [ ] | [ ] |
| Library / Meal Builder | [ ] | [ ] | [ ] | [ ] |
| Add-food: barcode scan | [ ] | [ ] | [ ] | [ ] |
| Add-food: OCR photo | [ ] | [ ] | [ ] | [ ] |
| Add-food: manual entry | [ ] | [ ] | [ ] | [ ] |

Notes on specific cells:
- **OCR / barcode Loading**: a live "transcribing label…" / "scanning…" indicator is
  correct here — a 3–8s silent wait reads as broken.
- **OCR Error**: MUST fall back to blank manual entry WITH a visible "couldn't read
  that label" line. Never a silent revert.
- **Camera denied** (barcode + OCR): counts as the Error state — show it with the
  manual-entry escape always one tap away.
