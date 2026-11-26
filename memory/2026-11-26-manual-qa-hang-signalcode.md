# Manual QA hung forever on WEB-01: a server stopped by SIGINT has `exitCode === null`

**Task**: why the Run Manual QA automation (run 44f5597a…) ran so long and many sessions started on PR #19
**Learned**:
- `qa.mjs` `serve().stop()` checked only `server.exitCode`; a process ended by a signal has `exitCode null, signalCode 'SIGINT'`, so the second `stop()` (the case's cleanup) waited for an `exit` that had already fired. WEB-01, WEB-03, WEB-12 and WEB-28 stop their server mid-case; the run hung at WEB-01. Fixed by also checking `signalCode`; the 4 cases then take 29 s.
- There is no per-case timeout in `qa.mjs`, so any hang hangs the whole run.
- `pkill -f "qa.mjs …"` also kills the shell running it (its command line matches): exit 144.
- The automations (Code Review, Address Review, Manual QA) start on each push to the PR and auto-push their own commits (memory notes too) to the PR branch: each push starts the next round. Between 17:40 and 17:55 that was 7 reviews, 9 commits, and the token's 5000/h core limit was spent.
**Why it matters**: a hung QA run looks like "slow", and pushing to the PR branch from an automation restarts every automation.
