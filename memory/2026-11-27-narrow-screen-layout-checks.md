# A narrow-screen bug needs a real browser at 375 px; jsdom and the 1280 px baselines never see it

**Task**: issue #32, *Scan* sticks out of the header at 375 px
**Learned**:
- A flex item's default `min-width: auto` is its min-content: `#form` (input + Scan) would not shrink below ~340 px whatever its `flex-basis`; `min-width: 0` lets it.
- `test.use({ video })` inside `test.describe` fails (`forces a new worker`); `test.use({ viewport })` there is fine.
- Measure overflow with `document.documentElement.scrollWidth` vs `innerWidth`; list the culprits with `getBoundingClientRect().right > innerWidth`.
- Still open after #32: at 375 px a scanned repository's long skill names (`#skills .name`, mono, nowrap) widen the page to 665 px (`JetBrains/kotlin`); PR #23 restyles that list.
- Outside the pinned image, `CHROME=/usr/bin/google-chrome npx playwright test` fails every screenshot, but the `-actual.png` files of two runs (stash / no stash) can be `cmp`ed to prove a change leaves them as they were. Delete the `-linux.png` it writes for a new screenshot.
**Why it matters**: otherwise a CSS fix is checked only at 1280 px, or a local baseline gets committed.
