# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1

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
