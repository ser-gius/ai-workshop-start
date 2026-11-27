# A flex-basis can wrap a row just above its media-query breakpoint; a browser does install here

**Task**: address the last review round on PR #41 (long texts in their cards)
**Learned**:
- A header row of `h1` + `#form { flex: 1 1 <basis> }` + `#status { max-width: 40% }` wraps whenever h1 + basis + gaps + 40% exceeds the row, which can be well above the `@media (max-width: 860px)` breakpoint (it was 861-937 px with a 360 px basis). Set a smaller basis only above the breakpoint (`@media (min-width: 861px)`), so the narrow layout and its baselines do not move, and check layout at the breakpoint's edge (861 px), not only at 1280 px.
- In this sandbox `npm ci` then `npx playwright install --with-deps chromium` worked, so `npx playwright test tests/visual/long-text.spec.ts` ran locally (unlike [[2026-11-27-flex-wrap-status-and-no-local-browser]]). It needs `node_modules` first: without it the config fails with ERR_MODULE_NOT_FOUND.
**Why it matters**: the reviewer flagged this for three rounds; one width in a layout test hides a gap.
