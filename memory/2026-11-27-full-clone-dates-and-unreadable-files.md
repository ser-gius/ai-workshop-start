# A test that compares a /tmp copy of the fixture with the fixture fails in a full clone; `r` without `x` is not readable

**Task**: address-review of PR #36 (a folder that cannot be read in a local directory)
**Learned**:
- The fixture's skills get `updated <day>` from git in a full clone, but not in CI's shallow checkout (its one commit is
  where history stops). A copy in `/tmp` is in no git repository, so it never has days: compare it without the
  `updated` lines, or the test passes in CI and fails locally.
- A folder with mode `644` can be listed (`readdir` works, `Dirent` types too) but not entered; check `access(X_OK)`.
  The local `read` must tell "not there" (ENOENT) from "not readable" (EACCES), or the skill gets GitHub's
  `listed, but not found at the scanned commit` wording.
- The `listed.filter is not a function` in the getnao e2e test shows up when CI's token hits the core rate limit.
- Run `git push` on its own before replying "Fixed in <sha>": `git push … | tail -1 && …` hides a failed push.
**Why it matters**: otherwise the next task misreads a local-only failure, or replies with a sha GitHub does not have.
