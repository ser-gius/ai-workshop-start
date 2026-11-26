# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**; for an organization, *grouped by repository*
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*: the default branch's, or the one in the URL
- A fixed commit is listed through its tree: code search sees only the default branch.
  A tree too large for one answer is listed a directory at a time, a few requests at once
- Unknown commit → a clear message, exit code 1
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
- A **private** repository, with a `GITHUB_TOKEN` that can read it: listed *and read* with the token
- An empty repository (no commit yet) → `Repository is empty: <URL>`, exit code 1

## An organization
`github.com/<owner>`: every repository of an organization, or of a user's account, at its default branch.
- Its repositories: GitHub's list, `/orgs/<owner>/repos` (`/users/<owner>/repos` for a user), 100 a page;
  the pages its public repositories need *at once*, then the next while a page is full (private ones)
- **Forks** are left out: their skills are their upstream's
- With `GITHUB_TOKEN`: *one* code search over the whole organization (`org:<owner>`), not one per repository;
  at the same time as the list; only the repositories it finds are read. Without it: each repository's tree, as above
- Code search returns at most *1000* files: more `SKILL.md` than that → a *warning*, some may be missing
- Each repository: the rules above, skills and copies within that repository only
- Listed: the repositories **with skills**, sorted by `owner/name`, ignoring case; the others are only counted
- A repository's warning, prefixed with `owner/name`, as a *warning*; so is one that fails
  (`JetBrains/x: Commit not found: …; skipped`): the scan goes on
- An empty repository → no skills, no warning
- Unknown organization → `Organization not found: <URL>`, exit code 1
- A rejected token, the rate limit, GitHub unreachable → the whole scan stops: a clear message, exit code 1

## What is a project skill?
`<root>/<name>/SKILL.md`, where `<root>` is a folder named `skills`:
`.agents/skills`, `.claude/skills`, `.github/skills`, `agent/skills`,
or one specific to the repository, such as a plugin's `…/skills`.
- A `<root>` inside test data → not a skill: a folder before `<name>` has the word
  `test`, `tests`, `fixture` or `fixtures` (`jvmTest`, `integration-tests`, `testData`)
- The same `<name>` in two roots → one skill: linked in the first root, in the order above,
  then by path; the other paths are its copies
- Anything else → not a skill: a `SKILL.md` outside a `skills` folder, or below a skill

## Edge cases
Each is checked end to end on the real repository at a fixed commit (`tests/e2e`).
- **Duplicates in `.agents` and `.claude`**: the same skill, one copy per agent.
  ```
  JetBrains/MPS · mps-tests
    .agents/skills/mps-tests/SKILL.md
    .claude/skills/mps-tests/SKILL.md
  ```
- **An unusual folder**: the repository's own workflow, outside `.agents` and `.claude`; a skill.
  ```
  JetBrains/android · writing-lint-checks
    agent/skills/writing-lint-checks/SKILL.md
  ```
- **Part of the product**: shipped to users inside a plugin; a skill.
  ```
  JetBrains/MPS · mps-aspect-generator
    plugins/mcp-tools/resources/…/skills/mps-aspect-generator/SKILL.md
  ```
- **Test data**: a fixture for the project's own tests, not a skill.
  ```
  JetBrains/koog · weather-retrieval
    integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md
  ```
