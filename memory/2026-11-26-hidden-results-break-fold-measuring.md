# `foldIfClamped` measures on screen: show `#results` before listing the skills

**Task**: review of PR #19 (ser-gius/ai-workshop-start), *Show the skill filter only once a scan has answered*
**Learned**:
- `list()` calls `foldIfClamped()` as each skill is appended; under a `hidden` ancestor every `scrollHeight`/`clientHeight` is 0, so a one-sentence description cut at two lines silently loses its `▸` fold.
- jsdom has no layout: to test it, stub `HTMLElement.prototype.scrollHeight`/`clientHeight` in `beforeParse` (see `pageAt`'s `layout` hook in `tests/web.test.ts`), returning 0 under `[hidden]`.
- The fixture has no single-sentence skill (every description has two sentences, or none): use a stubbed `organizationAnswer` with `summary === description`.
- A real-browser check: `.claude/skills/record-demo/setup.sh`, then Playwright from `~/.cache/skill-atlas-demo` with `executablePath: '/usr/bin/google-chrome'`.
- `pkill -f "serve --port …"` from the Bash tool also kills that tool's own shell (exit 144): kill by PID.
**Why it matters**: hiding or moving the list's container breaks a fold that no jsdom test or `npm test` shows by default.
