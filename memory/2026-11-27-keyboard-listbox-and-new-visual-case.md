# The skill list's keyboard: a roving tabindex that the filter must keep reachable; a new visual case needs three places

**Task**: issue #33, PR #44, a skill cannot be selected with the keyboard
**Learned**:
- Roving tabindex: `show()` puts the single `tabindex="0"` on the selected skill, and the arrows move it. A filter that hides the item holding it leaves Tab with no stop in the list, so `applyFilter()` hands it back to the selected skill.
- A keydown on a fold's `<summary>` bubbles to the option: Enter and Space are handled only when `event.target` is the `li` itself, otherwise Enter would select instead of unfold.
- jsdom has `focus()`, `tabIndex` and `KeyboardEvent`: dispatch `keydown` on `document.activeElement` with `cancelable: true`, and check `defaultPrevented` for "the page took the key" (see `keyboard()` in `tests/web.test.ts`).
- A new visual case needs `tests/visual/demo.spec.ts`, the `for case in …` list in `.github/workflows/demo.yml` (read from `main`, so it is posted only after merge), and `record.mjs`. Its screenshots fail CI until the `update-baselines` label runs.
- WEB-07 fails on `main` at its koog step (`locator.evaluate: Timeout`). It is not a regression.
- `jq` was missing on this runner too (`sudo apt-get install -y jq`), and the GitHub core limit was already spent at the start, so `npm run test:e2e` could not run locally.
**Why it matters**: otherwise a filtered list silently drops out of the Tab order, or a new demo case never shows up in a PR.
