# GitHub REST quota can be spent before a review starts; GraphQL still works

**Task**: code review of PR #17 (record-demo attach.sh), then addressing it
**Learned**:
- The installation token's REST quota (5000/h, shared) was already at 0 at the start: `gh pr diff 17` → `HTTP 403: API rate limit exceeded`. GraphQL has its own quota.
- `git diff origin/main...HEAD` replaces `gh pr diff` (local `main` may be stale: `no merge base`; `git fetch origin main` first).
- Post a review with GraphQL `addPullRequestReview` (`threads: [{path, line, side, body}]`), and reply with `addPullRequestReviewThreadReply`. `gh api graphql` must run inside the checkout (`gh-wrapper: not a GitHub repo` elsewhere).
- To test `attach.sh` offline, use a bare repository as `origin` and a fake `gh` on `PATH` that answers `repo view`, `pr view --json body|url` and `pr edit <n> --body-file <f>` (the file is `$5`). ffmpeg is not preinstalled (`sudo apt-get install -y ffmpeg`).
**Why it matters**: without these, a review run stalls on the rate limit or can't exercise attach.sh.
