# Trimming ?repo= in openLink alone does not stop a duplicate history entry

**Task**: address the review on PR #42 (Back to an earlier scan)
**Learned**:
- The review's first suggested fix (trim `params.get('repo')` in `openLink`) is not enough: `updateLink` compares the scanned repo with the raw `?repo=` of `location.search`, which still has the spaces; the trim has to be in the `isNewScan` comparison
- `npm test` in a fresh worktree fails with `ERR_MODULE_NOT_FOUND` (`yaml`, `jsdom`) until `npm ci` is run there; worktrees do not share `node_modules`
- `tests/web.test.ts` `openPage` helper has `linkedRepo()` for the page's current `?repo=`
**Why it matters**: saves a round of a test still failing after the "obvious" fix
