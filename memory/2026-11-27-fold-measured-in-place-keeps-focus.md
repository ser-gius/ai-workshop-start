# Replacing a focused element drops focus to `<body>`: measure a fold in place

**Task**: review of PR #39 (ser-gius/ai-workshop-start), *Fold a description again when the window is resized*
**Learned**:
- `foldIfClamped` runs on every `resize`; swapping a closed `details` for a plain `div` to measure it detached a focused `summary`, even when nothing changed.
- The fix measures the `details` where it is with a `measuring` class (summary `display: block`, no `::before` `▸`), so the width matches the plain row; it rebuilds a row only when `clamped !== folded`.
- jsdom keeps `document.activeElement` honest: a test can `summary.focus()`, resize, and compare elements (`pageAtWidth` returns `doc`).
- `npm run test:e2e` passed with `GITHUB_TOKEN=$(gh auth token)`; the reviewer's 4 e2e failures were only the core rate limit.
**Why it matters**: any DOM rebuild on resize or filter must keep the existing node when its state is unchanged, or keyboard users lose their place.
