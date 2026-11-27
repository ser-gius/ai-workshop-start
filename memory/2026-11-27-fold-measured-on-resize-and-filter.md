# A one-sentence fold is measured in `applyFilter()` and on `resize`, not when a row is listed

**Task**: issue #29 (fold lost after narrowing the window), PR #39
**Learned**:
- `foldIfClamped()` now takes no arguments and goes over `scanned.entries`. It skips hidden rows, rows showing a snippet, and open folds, because a hidden row measures 0 and would lose its `▸`.
- jsdom has no `requestAnimationFrame` unless `pretendToBeVisual` is set, so the `resize` handler runs synchronously. It reads every row before writing any, so a resize costs one layout pass.
- Tests: `pageAtWidth()` in `tests/web.test.ts` stubs the layout from a `width` variable. The stub must cut only long text (`textContent.length > 40`), otherwise short descriptions fold too.
- Real-browser check: Playwright `page.setViewportSize()` fires `resize`; `attach.sh` can race another run on `demo-assets` (`cannot lock ref`): just rerun it.
**Why it matters**: if `foldIfClamped()` goes back to being called per row in `list()`, the ▸ is lost again after a resize or a filter.
