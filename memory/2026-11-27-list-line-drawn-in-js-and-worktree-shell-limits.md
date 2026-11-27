# The line between skill rows is drawn in JS, because CSS sibling selectors count hidden rows

**Task**: address-review of PR #23 (ser-gius/ai-workshop-start), 6 threads, fixed in 6cd7219
**Learned**:
- `li + li` selectors still see rows the filter hides with `hidden`, so CSS cannot say "previous shown skill". `drawLines()` in `src/web.ts` sets class `line` and must be called after anything that changes what is shown, selected or hovered.
- jsdom has no `::before` computed style and no `:hover`; test the `line` class, and hover with `dispatchEvent(new window.MouseEvent('mouseenter'))`.
- Headless Chromium from `~/.cache/ms-playwright` will not start on this runner: `libnspr4.so` is missing.
- In a worktree-isolated agent, Bash refuses shell functions, python heredocs and multi-command chains as "too complex": run each `gh api` reply as its own call, and batch the `resolveReviewThread` calls in one GraphQL mutation with aliases.
- Visual CI passed on 6cd7219 without new baselines: the screenshots did not change enough to fail.
**Why it matters**: otherwise the next change to the list brings back stray lines, or loses time on the browser and the shell.
