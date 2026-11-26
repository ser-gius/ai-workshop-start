# Review runs race on one PR, and they spend the GitHub token's core limit together

**Task**: review and address-review of PR #19 (ser-gius/ai-workshop-start), run after 9a30b35
**Learned**:
- Several Code Review runs can start on the same PR at once. Only one run's commits land: replies on #19 cite `a648306` and `352cad5`, which are not on the branch. Check `git log origin/main..HEAD` before you trust a "Fixed in <sha>" reply.
- The clone is shallow: `git log main..HEAD` shows 1 commit until `git fetch --unshallow origin`.
- Those runs together use up the token's 5000/h core limit (`gh api rate_limit --jq .resources.core`). Then `npm run test:e2e` and the GitHub QA cases fail with `GitHub rate limit reached … try again in N minutes`. Posting through `gh api …/reviews` still worked, and GraphQL has its own limit.
- In `cases.mjs`, Playwright's `isHidden('#x')` is true for an element that does not exist, so check one that always exists (e.g. `#list`) to tell "hidden" from "missing".
**Why it matters**: otherwise you report fixes that never landed, or read a rate-limit failure as a product bug.
