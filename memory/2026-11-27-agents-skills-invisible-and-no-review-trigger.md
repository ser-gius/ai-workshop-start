# Skills in .agents/skills were invisible to Claude Code, and nothing runs address-review on a new review

**Task**: why PR #25's review (4 threads, 2026-11-27 10:51) was never addressed
**Learned**:
- Claude Code loads skills only from `.claude/skills`; `address-review`, `issue-to-pr`, `code-review`, `red-agent`, `update-memory` sat in `.agents/skills` and never showed up as skills. Now symlinked from `.claude/skills/<name>`.
- Skill Atlas itself counts a symlinked skill once (`./skill-atlas scan .` → 7 skills, no "also in" lines).
- The project `code-review` skill now shares its name with Claude Code's built-in `/code-review`.
- The only path to address-review was issue-to-pr step 8 (`/loop 5m`), which dies with the headless Issue To PR run; the Code Review automation posted ~2 min after the PR opened, after that run was done. No workflow or automation fires on `pull_request_review`.
**Why it matters**: without a review trigger, bot PRs keep unanswered review threads.
