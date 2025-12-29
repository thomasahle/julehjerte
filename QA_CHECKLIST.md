# QA Checklist

Use this for pre-release UI validation. Mark each item Pass/Fail and capture issues with a short note + repro steps.

## Automated Checks
- [ ] `npm run check` passes (TypeScript and Svelte checks).
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run test` passes all unit tests.
- [ ] `npm run build` completes without errors.

## Setup
- [ ] Verify on at least two viewports: 1280x800 and 375x812.
- [ ] Test in Chromium + one other browser (Safari or Firefox if available).
- [ ] Clear cache/local storage once to validate first-load state.
- [ ] Confirm console has no new errors; warnings are reviewed and understood.
- [ ] Favicon displays correctly in browser tab (2x2 woven heart).

## Global UI States
- [ ] Hover/focus/active/disabled styles are visible and consistent.
- [ ] Selected indicators stay visible on hover and focus (no hidden affordances).
- [ ] Focus ring is visible for keyboard navigation.
- [ ] Clickable regions do not shift layout or flicker.
- [ ] Skeletons/placeholder content are replaced cleanly with real content.
- [ ] No element is visually clipped when hovered or focused.

## Navigation & Layout
- [ ] Header links work from all pages.
- [ ] Back buttons return to the expected page/state.
- [ ] Footer links and language toggle work.
- [ ] Main layout does not jump on route transitions.
- [ ] Mobile layout avoids horizontal scroll.

## Gallery / Home Page
- [ ] Selecting a heart immediately shows selection state.
- [ ] Selecting/deselecting updates the Print Selected count.
- [ ] Details button opens the correct heart detail page.
- [ ] Delete (user hearts) works and updates the list without flicker.
- [ ] Print Selected is disabled when empty and enabled when non-empty.
- [ ] PDF Settings menu opens/closes and updates settings.

## Heart Detail Page
- [ ] Carousel slides (photo/template/right template) navigate correctly.
- [ ] Download PDF Template button triggers download.
- [ ] Open in Editor opens the correct design.
- [ ] Share button provides feedback (copied/failed) and does not crash.
- [ ] Difficulty, symmetry, and description are displayed correctly.
- [ ] Image slide gracefully handles missing photos.

## Editor Page
- [ ] Canvas renders immediately after load; controls are usable.
- [ ] Undo/redo enable/disable appropriately.
- [ ] Symmetry toggles reflect the current design.
- [ ] Export/Import/Download Template buttons work.
- [ ] Imported SVG loads without UI glitches.
- [ ] Save/return flow works when entering from detail page.

## Downloads & Rendering
- [ ] PDF export renders crisp preview with outline (no white-on-white).
- [ ] PDF download triggers without errors (blob URL created).
- [ ] SVG template download includes preview heart.
- [ ] Exported SVG opens in a standalone viewer.

## User Data & Persistence
- [ ] User-created hearts persist across page reloads.
- [ ] User hearts appear in "MINE HJERTER" section on home page.
- [ ] Delete button removes user hearts from collection without page refresh.
- [ ] Color picker changes persist and apply to all heart previews.

## Internationalization
- [ ] All UI strings switch between DA/EN on language toggle.
- [ ] URLs reflect the selected language (where applicable).
- [ ] No mixed-language labels appear on a single page.

## Accessibility Basics
- [ ] All interactive elements are reachable with keyboard only.
- [ ] Enter/Space triggers buttons and selectable cards.
- [ ] ARIA labels are meaningful where icons are used.

## Error & Edge States
- [ ] Missing heart ID shows a friendly error page.
- [ ] Network failure shows a visible error message (no blank screen).
- [ ] Invalid import shows a clear error.

## Visual Polish
- [ ] No overlapping UI elements on mobile.
- [ ] Buttons align and wrap nicely when space is tight.
- [ ] Tooltip content is legible and not clipped.
