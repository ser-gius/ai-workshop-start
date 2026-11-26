# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**, **last updated**; for an organization, *grouped by repository*
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit, updated
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*: the default branch's, or the one in the URL
- A fixed commit is listed through its tree: code search sees only the default branch.
  A tree too large for one answer is listed a directory at a time, a few requests at once
- Unknown commit → a clear message, exit code 1
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
- GitHub's rate limit, when it says to wait *a minute* or less (code search: 10 requests a minute) →
  wait, then ask again, twice at most; a longer wait → `GitHub rate limit reached; try again in <n> minutes`, exit code 1.
  `<n>` is GitHub's wait rounded up: `Retry-After: 120` → `2 minutes`. When GitHub names the limit
  (`x-ratelimit-resource`), so does the message: `GitHub rate limit reached (the core limit); try again in 13 minutes`
- `.` or `..` as the owner or the name → `Repository not found: <URL>`, nothing asked of GitHub
- A **private** repository, with a `GITHUB_TOKEN` that can read it: listed *and read* with the token
- An empty repository (no commit yet) → `Repository is empty: <URL>`, exit code 1

## When a skill last changed
**Updated**: the time of the *latest commit* that touched the skill's files, up to the scanned commit;
its *committer* date, in UTC (`2026-03-01T01:00:00+02:00` → `2026-02-28T23:00:00Z`).
- Its files: its **folder** (`<root>/<name>/`, everything in it), and *each copy's*: the latest of them
- GitHub: a folder's history, one commit a page, `/repos/<owner>/<repo>/commits?sha=<commit>&path=<folder>&per_page=1`;
  one request per folder
- A local directory: `git log` in the git repository it is in (it may be below the root); changes not committed
  yet do not count
- No commit touched it (a local skill not committed yet), or a directory outside git → *no date*, no warning
- A folder's history that fails → a *warning* (`<path>: last update unknown: <message>`), the skill without a date;
  the rate limit, a rejected token, GitHub unreachable stop the scan, as anywhere else

## An organization
`github.com/<owner>`: every repository of an organization, or of a user's account, at its default branch.
- Its repositories: GitHub's list, `/orgs/<owner>/repos` (`/users/<owner>/repos` for a user), 100 a page;
  the pages its public repositories need *at once*, then the next while a page is full (private ones)
- **Forks** are left out: their skills are their upstream's
- **More than 20** repositories, with `GITHUB_TOKEN`: *one* code search over the whole organization
  (`org:<owner>`, `user:<owner>`), not one per repository; only the repositories it finds are read
- Up to 20, or without a token: each repository's **tree**, as a fixed commit is; no code search, which has
  a tight limit of its own (and the Actions `GITHUB_TOKEN` hardly any)
- Code search returns at most *1000* files: more `SKILL.md` than that → a *warning*, some may be missing
- Each repository: the rules above, skills and copies within that repository only
- Listed: the repositories **with skills**, sorted by `owner/name`, ignoring case; the others are only counted
- A repository's warning, prefixed with `owner/name`, as a *warning*; so is one that fails
  (`JetBrains/x: Commit not found: …; skipped`): the scan goes on
- An empty repository → no skills, no warning
- Unknown organization → `Organization not found: <URL>`, exit code 1; so is `.` or `..` as the owner
  (`github.com/..`, nothing asked of GitHub), and an answer from GitHub without a `login`
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
- **A copy changed last**: the skill's date is its copy's, not its linked folder's.
  ```
  JetBrains/MPS · actions · updated 2026-05-21
    .agents/skills/actions/   2026-04-14
    .claude/skills/actions/   2026-05-21
  ```
