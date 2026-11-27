# A wrapping flex row puts a long nowrap item on its own row; no browser in some sandboxes

**Task**: address the review on PR #41 (long texts in their cards)
**Learned**:
- In a `flex-wrap: wrap` row, `min-width: 0; overflow: hidden; text-overflow: ellipsis` is not enough: the item's max-content basis (clamped only by `max-width: 100%`) wraps it onto its own row before it can shrink. Bound it (`max-width: 40%`) and assert in the browser that it shares the row (`status.y < form.y + form.height`), not only that it is inside the card.
- Some agent sandboxes have no Chrome (`/usr/bin/google-chrome` missing), no Docker daemon, and `npx playwright install chromium` downloads a shell that cannot start (missing libnss3 etc.; `playwright install-deps` fails in apt). Then the browser specs run only on CI (`ci.yml` job `visual` runs all of `tests/visual`): push, `gh pr checks <pr> --watch`, read its log, and only then resolve threads that depend on them.
**Why it matters**: the layout bug passed the box-inside-card checks; and a run without a browser should not be reported as tested.
