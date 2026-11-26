---
name: address-review
description: Read the review comments on a Skill Atlas pull request, fix or answer each one, reply on the thread and resolve it. Use when a PR has new review comments, or when asked to address a review.
---

# Address a review

Every unresolved review thread ends with a reply, and is resolved once it is handled.
The spec, the code and the tests still change together, as in
[issue-to-pr](../issue-to-pr/SKILL.md).

## 1. Read
On the PR's branch (`gh pr checkout <pr>`), list the unresolved threads with their comments:

```sh
gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<pr> -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line
          comments(first: 50) { nodes { databaseId author { login } body } }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

Also read the review summaries and the PR's general comments: `gh pr view <pr> --comments`.
Skip threads whose last comment is already your reply and that wait for the reviewer.

## 2. Decide, per thread
- **Agree**: change the code, with the spec and a test when the behaviour changes.
- **Disagree or unclear**: do not change the code; answer with the reason or a question.
  Ask the user before pushing back on a reviewer when unsure.
- **Out of scope**: say so and propose a follow-up issue (open it with the user's agreement).

## 3. Fix
One commit per comment or per group of related comments, message like `git log`
(`Handle a SKILL.md without front matter`). Then run all of
[issue-to-pr step 5](../issue-to-pr/SKILL.md#5-check-what-ci-checks) and push.

## 4. Answer and resolve
Reply in the thread, after the push so the commit exists on GitHub:

```sh
gh api repos/{owner}/{repo}/pulls/<pr>/comments/<databaseId of the first comment>/replies \
  -f body='Fixed in <sha>: <one line on what changed>.'
```

Resolve a thread only when it is fixed, or when the answer needs nothing more from the reviewer:

```sh
gh api graphql -f id=<thread id> -f query='
mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }'
```

Leave questions and disagreements unresolved for the reviewer. Answer general PR comments
with `gh pr comment <pr> --body '…'`.

## 5. Report
To the user: each thread, one line: fixed (with the commit), answered, or left open and why.
Then `gh pr checks <pr> --watch` until CI is green.
