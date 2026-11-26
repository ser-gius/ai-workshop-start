---
name: code-review
description: Review a pull request or a diff in Skill Atlas with a short summary and inline comments, each saying where the problem is and how to reproduce it. Use when asked to review a change, a branch or a PR.
---

# Code review

A short review: a few lines of summary, then one inline comment per problem.
Only real problems: a bug, a broken spec rule, a missing test. No style nits that the
typecheck or the tests would not catch, no praise, no restating the diff.

## Before commenting
1. Read [spec/](../../../spec/) and [AGENTS.md](../../../AGENTS.md): the change must keep the spec
   and the code in step, with an integration test for every case in the spec.
2. Get the change: `gh pr diff <n>`, or `git diff main...HEAD`.
3. Run what CI runs: `npm ci`, `npm run typecheck`, `npm test`,
   `GITHUB_TOKEN=$(gh auth token) npm run test:e2e` (Node 24 or later).
4. Reproduce every problem before writing it down. If you cannot reproduce it, leave it out
   or say plainly that it is a suspicion.

## The summary
Three lines at most:
- the verdict: ready, or what blocks it;
- the number of problems, the worst one first;
- what you ran, and whether it passed.

## Each inline comment
On the line it is about, in this shape:

```
**Problem**: <one sentence: what is wrong>
**Where**: `<path>:<line>`, in `<function>`
**Reproduce**:
    <a command, or an input, that shows it>
**Expected**: <what the spec or the user expects>
**Actual**: <what happens instead, quoted output>
**Fix** (optional): <one line>
```

A good reproduction is one command a reader can paste, for example
`./skill-atlas scan github.com/JetBrains/koog/tree/709079e`, or a failing test to add to
`tests/`. Quote the actual output, shortened with `…`.

## Posting
Inline comments go in one review, through the GitHub API:

```sh
gh api repos/{owner}/{repo}/pulls/<n>/reviews --input - <<'EOF'
{
  "event": "COMMENT",
  "body": "<the summary>",
  "comments": [
    { "path": "src/core/find.ts", "line": 42, "side": "RIGHT", "body": "<the comment>" }
  ]
}
EOF
```

`line` is a line of the new file that is in the diff. Use `"event": "REQUEST_CHANGES"`
only when the user asks for it. Without a PR, print the same review in the terminal,
with each comment headed by its `path:line`.
