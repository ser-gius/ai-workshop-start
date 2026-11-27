# `claude -p` for the topics: stub it on PATH; this runner has no jq, no Claude login, and a spent GitHub token

**Task**: issue #24, *Group the skills by topic* (ser-gius/ai-workshop-start)
**Learned**:
- Tests stub `claude` with `stubClaude(t, body)` in `tests/helpers.ts`: a `sh` script that saves its args and stdin. `startServe` in `tests/web.test.ts` always puts a stub (failing by default) first on PATH, so `./skill-atlas serve` never reaches a real model.
- An empty argument (`--tools ""`) shows as an empty line in the stub's saved args; `trim().split('\n')` keeps it, as long as it is not last.
- `claude` is not installed here; `npm i @anthropic-ai/claude-code` in `/tmp` works, but it answers `Not logged in · Please run /login` (exit 1): only the fallback can be checked for real. An unknown flag says `error: unknown option '…'` instead, a way to check flags without a login.
- `jq` is missing: `sudo apt-get install -y jq` for the Slack step of issue-to-pr.
- `t.api()` in `.claude/skills/manual-qa/qa.mjs` opens the URL in the case's page: open the page and scan again before the next UI step.
- `npm run test:e2e` here failed with `GitHub rate limit reached (the core limit); try again in 55 minutes`: rely on CI's run.
**Why it matters**: otherwise a test or a QA case calls a real model, or a rate limit looks like a failure of the change.
