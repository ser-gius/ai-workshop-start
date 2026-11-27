# A child killed by a signal has exitCode null: qa.mjs hung forever on WEB-01

**Task**: the automation run on PR #23 that got stuck (manual QA never finished)
**Learned**:
- `./skill-atlas serve` stopped with SIGINT exits with `exitCode === null` and `signalCode === 'SIGINT'`; a "has it exited?" check must test both
- `qa.mjs` `stop()` checked only `exitCode`, so a case that calls `stop()` itself (WEB-01, and others in `cases.mjs`) waited forever on the second `stop()` in the cleanup; Chrome's pipe keeps the process alive, so no error and no output
- To find a silent hang: `DEBUG=pw:api node .claude/skills/manual-qa/qa.mjs <case>` shows the last Playwright call
- `pkill -f <pattern>` in an agent's Bash call matches the agent's own shell and gives "Exit code 144"; use exact PIDs
- Two subagents (code review and QA) on one token used up GitHub's core limit (5000), so the GitHub cases failed or were blocked
**Why it matters**: without this, a hung `qa.mjs --all` looks like slow GitHub calls and the run waits until it is killed
