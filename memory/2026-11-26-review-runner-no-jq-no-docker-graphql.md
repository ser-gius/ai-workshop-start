# On the review runner: no `jq`, no Docker, and REST can be rate-limited while GraphQL works

**Task**: review and address-review of PR #19 (ser-gius/ai-workshop-start), run after the baselines commit 0f6a518
**Learned**:
- `jq` is not installed: `jq -n … | gh api …/reviews --input -` sends an empty body, and GitHub creates a **pending** review (the URL comes back anyway). Find it with GraphQL `reviews(states:PENDING)` and submit it with `submitPullRequestReview`. Build JSON with `gh api -f`/`--jq` or `node -e` instead.
- No Docker daemon (`/var/run/docker.sock` missing): `npm run test:visual:docker` cannot run. Use CI's `visual` result instead.
- The installation token's REST limit can be spent (`gh run list`, `…/check-runs` → 403) while `gh api rate_limit` still shows `remaining`. GraphQL still works: commit checks through `object(expression:"<sha>"){… on Commit{checkSuites{…checkRuns{name conclusion}}}}`, and replies through `addPullRequestReviewThreadReply`.
- A baselines commit pushed by `visual-baselines.yml` shows "no checks" in `gh pr checks`: its CI is a `workflow_dispatch` run, visible only in the commit's check suites.
**Why it matters**: otherwise a review is left pending and invisible, or CI on the baselines commit looks missing.
