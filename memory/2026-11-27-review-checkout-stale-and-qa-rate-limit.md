# A PR-triggered checkout can be behind the PR's branch; the shared token's GitHub core limit runs out mid-QA

**Task**: code review and manual QA of PR #44
**Learned**:
- The automation's checkout was the PR's first commit (`f3f1454`), while `origin/<branch>` already had the visual-baselines commit and a merge of main. A review claimed "no baselines" that the branch already had. `git fetch origin <branch>` and review `origin/<branch>`, and rebase local commits onto it, so the platform's push stays a fast-forward.
- The clone is shallow and local `main` is stale: `git diff main...HEAD` fails with "no merge base". Use `gh pr diff <n>`, or fetch the base.
- The `gh` token is an installation token shared by every automation: its 5000/h core limit was at 0 at the start and was spent again during one QA `--all` pass. GraphQL keeps working while core is at 0. CI's e2e job fails for the same reason (`GitHub rate limit reached (the core limit)`), which says nothing about the change.
- With this integration token, WEB-11 and WEB-28 step 1 fail on a 403 "Resource not accessible by integration" for the user's repository list. That is the token, not the product.
- The WEB-07 failure noted in the keyboard-listbox note is the rate limit: WEB-07 passes once the limit has reset.
**Why it matters**: otherwise a review reports problems already fixed, and rate-limit failures pass for regressions.
