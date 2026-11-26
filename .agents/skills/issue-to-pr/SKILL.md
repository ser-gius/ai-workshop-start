---
name: issue-to-pr
description: Implement a GitHub issue in Skill Atlas end to end, with the spec, the code and an integration test for every case, then open a pull request with green CI. Use when asked to fix, implement or pick up an issue.
---

# Issue to pull request

One issue, one branch, one pull request. The spec, the code and the tests change together;
the PR is done when [AGENTS.md](../../../AGENTS.md)'s definition of done holds: all tests pass
locally, the spec's edge cases have tests, the CI build is green.

## 1. Understand the issue
1. Read it with its comments: `gh issue view <n> --comments`.
2. Read [spec/](../../../spec/) and [AGENTS.md](../../../AGENTS.md).
3. Reproduce the problem before changing anything: a command such as
   `./skill-atlas scan ./fixture` or `./skill-atlas scan github.com/<owner>/<repo>/tree/<commit>`,
   or a failing test. Keep the command and its output for the PR.
4. If the issue is unclear, contradicts the spec, or cannot be reproduced, stop and ask
   in a comment on the issue (with the user's agreement) instead of guessing.

## 2. Branch
From an up-to-date `main`: `git switch main && git pull && git switch -c <n>-<short-slug>`.
Never commit to `main`.

## 3. Spec first
Write down the new behaviour in `spec/` before the code: `spec/cli.md` for what the user
types and sees, `spec/analysis.md` for what counts as a skill and how a repository is read.
Same terse style as the rest: short lines, the rule, then the example. A new edge case
goes under **Edge cases** with the real repository and path that shows it.

## 4. Tests, then code
- A failing test first, one per case in the spec change, then the code that makes it pass.
- `tests/*.test.ts` (`npm test`) are offline: use `fixture/` for local directories (add a
  folder there, and a line to [fixture/README.md](../../../fixture/README.md)) and the recorded
  GitHub answers in `tests/helpers.ts` for URLs. Never call the network here.
- An edge case seen on a real repository also gets a test in
  `tests/e2e/real-repositories.test.ts`, pinned to a **full commit SHA** so the answer never changes.
- Keep the core (`src/core/`: fetch → find → parse) separate from the CLI, which stays a thin client.
- Warnings go to stderr; errors print a clear message and exit 1.

## 5. Check what CI checks
All of it, on Node 24 or later, before pushing:

```sh
npm ci
npm run typecheck
npm test
GITHUB_TOKEN=$(gh auth token) npm run test:e2e
./skill-atlas help && ./skill-atlas scan ./fixture
```

Then run the reproduction from step 1 again: it must now show the expected output.
Fix every failure; do not skip or weaken a test to make it pass.

## 6. Commit and open the PR
- Commit messages: imperative, short, like `git log` (`Add the code-review skill`).
- Push and open the PR against `main`:

```sh
git push -u origin HEAD
gh pr create --base main --title "<what it does, imperative>" --body-file - <<'EOF'
<one paragraph: what changed in the spec and in the code>

<the reproduction from step 1: the command, before and after, output shortened with …>

Tests: <the new tests, one line each>. `npm test` and `npm run test:e2e` pass.

Closes #<n>
EOF
```

## 7. Wait for green
`gh pr checks --watch`. If CI fails, read the log (`gh run view --log-failed`), fix it,
push again. Report the PR URL and the CI result to the user; do not merge unless asked.
