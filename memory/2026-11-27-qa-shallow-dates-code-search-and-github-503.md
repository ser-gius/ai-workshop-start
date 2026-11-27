# Manual QA here: CLI-19 needs the shallow rule, ORG-04 code search can miss repos, github.com blob pages can 503

**Task**: manual QA (`qa.mjs --all`) of PR #41, *Keep long texts inside their cards*
**Learned**:
- The automation's checkout is shallow (`.git/shallow` holds HEAD): fixture skills have no `updated` line, as spec/analysis.md says. CLI-19 step 2 now expects none for a folder whose latest commit is in `.git/shallow`.
- One `--all` plus one rerun of the GitHub cases spent the shared token's whole core limit (another agent ran e2e at the same time). Rerun right after the reset, the org cases (WEB-15, WEB-25, WEB-27) first and ORG-04 last.
- ORG-04 once printed `JetBrains · …`, exit 0, without JetBrains/koog and JetBrains/MPS (both still have skills). The next run listed them. GitHub's code search is incomplete at times; rerun before calling it a bug.
- CLI-07's link check got HTTP 503 ("Unicorn!") for every `github.com/.../blob/...` page for a few minutes, while `tree/` pages and HEAD requests answered 200. Wait until `curl -s -o /dev/null -w '%{http_code}'` on a blob page gives 200.
- Topic chips use `flex: 0 1 auto`, so a short name is cut too (`short` → `sho…`) beside a long one. The spec says nothing on this.
**Why it matters**: otherwise a shallow clone, the code search or GitHub's 503 pass for regressions.
