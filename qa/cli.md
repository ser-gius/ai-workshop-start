# Command line: `./skill-atlas scan`
See [README.md](README.md) for the setup. Warnings go to *stderr*: to tell them apart, add `2>/dev/null`
(only stdout) or `>/dev/null` (only stderr).

## CLI-01 · Help
**Steps**
1. `./skill-atlas`
2. `./skill-atlas help`

**Should see**
- Both print the same usage: `scan <GitHub URL | directory>`, `scan github.com/<owner>`,
  `serve [--port <number>]` and `help`, each with a short description
- Exit code 0

## CLI-02 · A local directory: every skill, sorted by name
**Steps**
1. `./skill-atlas scan fixture 2>/dev/null`

**Should see**
- First line: `fixture · 7 skills`
- Then, in this order: `aspect-generator`, `code-style`, `commits`, `lint-checks`, `release-checklist`,
  `reviews`, `run-tests`
- Each skill on two lines: `<name> — <first sentence of the description>`, then, indented, a
  `file:///…/fixture/…/SKILL.md` link to its file
- The description is cut to its *first sentence*: `commits — Write commit messages the way this repository does.`
  (not `Use for every commit.`)
- Exit code 0

## CLI-03 · A local directory: what is not a skill
**Steps**
1. `./skill-atlas scan fixture 2>/dev/null`

**Should see** none of these in the list
- `weather-retrieval`: test data (`integration-tests/src/jvmTest/resources/skills/…`)
- `notes`: a `SKILL.md` outside a `skills` folder
- `commits-example`: a `SKILL.md` below another skill (`.claude/skills/commits/examples/`)

And these *are* listed
- `run-tests`: "test" is in the skill's name, not in a folder before it
- `lint-checks`: an unusual folder, `agent/skills`
- `aspect-generator`: part of the product, `plugins/mcp-tools/resources/skills`
- `code-style`: another agent's folder, `.github/skills`

## CLI-04 · Duplicates: one skill, its copies
**Steps**
1. `./skill-atlas scan fixture 2>/dev/null`

**Should see**
- `reviews` listed **once**, linked to `.agents/skills/reviews/SKILL.md` (`.agents` comes before `.claude`)
- Under its link: `  also in .claude/skills/reviews/SKILL.md`
- No `also in` line under any other skill

## CLI-05 · Malformed front matter: a warning, the scan goes on
**Steps**
1. `./skill-atlas scan fixture >/dev/null` (only stderr)
2. `./skill-atlas scan fixture 2>/dev/null | grep -A1 release-checklist` (only stdout)

**Should see**
- Step 1: one line, `warning: .agents/skills/release-checklist/SKILL.md: malformed front matter: …; using the directory name`
- Step 2: `release-checklist` is still listed, named after its directory, with no description, and its link
- Exit code 0

## CLI-06 · Not a directory, not a GitHub URL
**Steps**
1. `./skill-atlas scan /no/such/directory`

**Should see**
- `Not a GitHub URL or a readable directory: /no/such/directory`
- Exit code 1

## CLI-07 · A GitHub repository at a fixed commit
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan https://github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85`

**Should see** exactly
```
JetBrains/koog · 2 skills
add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).
  https://github.com/JetBrains/koog/blob/709079e4a34d6c9234583352550e6a2b88a0bb85/.claude/skills/add-java-code-snippets-in-docs/SKILL.md
  updated 2026-05-18
split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.
  https://github.com/JetBrains/koog/blob/709079e4a34d6c9234583352550e6a2b88a0bb85/.claude/skills/split-jvm-nonjvm/SKILL.md
  updated 2026-03-25
```
- `weather-retrieval` and `arithmetic-evaluator` (test data) are **not** listed
- Nothing on stderr; exit code 0
- Each link opens the `SKILL.md` on GitHub, at that commit

## CLI-08 · A GitHub repository at its default branch
**Steps**
1. `./skill-atlas scan https://github.com/JetBrains/koog`

**Should see**
- `JetBrains/koog · <n> skills`, then its skills sorted by name
- Every link has the form `https://github.com/JetBrains/koog/blob/<40-hex commit>/…`: the commit scanned,
  not `main`; it is the same in every link
- The result prints at once; running it again stores nothing in the checkout (`git status` is clean)

## CLI-09 · An unusual folder; the name from the front matter
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/JetBrains/android/tree/6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765`

**Should see**
- `JetBrains/android · 6 skills`
- Every link is under `agent/skills/`
- `write-evals — Expertise in building new AI agent evaluations (evals) for Android Studio.` linked to
  `agent/skills/android-studio-evals/SKILL.md`: named by its front matter, not its directory
- `writing-lint-checks` is listed

## CLI-10 · Duplicates and the product's copies, on a large repository
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/JetBrains/MPS/tree/1cbf7f783dbc5c74c8e5231d31f61b02829143de`

**Should see**
- `JetBrains/MPS · 43 skills`; nothing on stderr
- `mps-tests` and `mps-aspect-generator` each listed once, linked to `.agents/skills/<name>/SKILL.md`, then
  `also in .claude/skills/<name>/SKILL.md, plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/<name>/SKILL.md`
- Every one of the 43 skills has an `also in .claude/skills/…` line

## CLI-11 · An unknown commit
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan https://github.com/JetBrains/koog/tree/0000000000000000000000000000000000000000`

**Should see**
- `Commit not found: https://github.com/JetBrains/koog/tree/0000000000000000000000000000000000000000`
- Exit code 1

## CLI-12 · An unknown repository
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan https://github.com/JetBrains/no-such-repository-qa`

**Should see**
- `Repository not found: https://github.com/JetBrains/no-such-repository-qa`
- Exit code 1

## CLI-13 · `.` or `..` in the URL: nothing asked of GitHub
**Steps**
1. Disconnect from the network (or `export GITHUB_TOKEN=bad`, which GitHub would reject)
2. `./skill-atlas scan https://github.com/./x`
3. `./skill-atlas scan https://github.com/JetBrains/..`

**Should see**
- `Repository not found: https://github.com/./x`, and `Repository not found: https://github.com/JetBrains/..`
  at once: not a network error, not `GitHub rejected the token`
- Exit code 1 each

## CLI-14 · A rejected token
**Steps**
1. `GITHUB_TOKEN=bad ./skill-atlas scan https://github.com/JetBrains/koog`

**Should see**
- `GitHub rejected the token in GITHUB_TOKEN`
- Exit code 1

## CLI-15 · An empty repository
*Needs `GITHUB_TOKEN`, and an empty repository of your own: create one on GitHub with no README, no commit.*

**Steps**
1. `./skill-atlas scan https://github.com/<you>/<empty-repository>`

**Should see**
- `Repository is empty: https://github.com/<you>/<empty-repository>`
- Exit code 1

## CLI-16 · A private repository
*Needs a private repository with a skill in `.claude/skills/<name>/SKILL.md`, and a `GITHUB_TOKEN` that can read it.*

**Steps**
1. `unset GITHUB_TOKEN; ./skill-atlas scan https://github.com/<you>/<private-repository>`
2. `export GITHUB_TOKEN=$(gh auth token); ./skill-atlas scan https://github.com/<you>/<private-repository>`

**Should see**
- Step 1: `Repository not found: …`, exit code 1
- Step 2: the repository and its skills, with their descriptions (the `SKILL.md` was *read* with the token);
  exit code 0

## CLI-17 · Without a token
**Steps**
1. `unset GITHUB_TOKEN; ./skill-atlas scan https://github.com/JetBrains/koog`

**Should see**
- Either the skills, as in CLI-08, or, once GitHub's anonymous limit is spent,
  `GitHub rate limit reached (the core limit); set GITHUB_TOKEN` and exit code 1. Never a stack trace

## CLI-18 · Speed on a very large repository
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `time ./skill-atlas scan https://github.com/JetBrains/intellij-community`

**Should see**
- The repository and its skills in **under 5 seconds** (`real`), with no clone on disk

## CLI-19 · When each skill last changed
*Step 1 needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/JetBrains/MPS/tree/1cbf7f783dbc5c74c8e5231d31f61b02829143de 2>/dev/null | grep -A3 '^actions '`
2. `./skill-atlas scan fixture 2>/dev/null`
3. `rm -rf /tmp/qa-plain && cp -r fixture /tmp/qa-plain && ./skill-atlas scan /tmp/qa-plain`

**Should see**
- Step 1: `actions`, its link, `also in .claude/skills/actions/SKILL.md`, then `updated 2026-05-21`: the day its
  copy in `.claude` changed, later than its `.agents` folder (2026-04-14). Every skill's block ends with `updated <day>`
- Step 2: each skill's last line is `updated <YYYY-MM-DD>`: the day of the latest commit to its folder in this
  checkout (`git log -1 --format=%cs -- fixture/.claude/skills/commits` for `commits`, in UTC)
  In a shallow clone, a skill whose latest commit is where the history stops (`.git/shallow`) has no `updated` line
- Step 3: outside git: no `updated` line at all, and no warning about it
