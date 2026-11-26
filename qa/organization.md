# An organization: `./skill-atlas scan github.com/<owner>`
See [README.md](README.md) for the setup. An organization changes over time, so these cases check the
*shape* of what is printed, not exact counts.

## ORG-01 · A small organization, grouped by repository
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/getnao 2>/dev/null`
2. Open https://github.com/orgs/getnao/repositories, *Type: Sources* (forks left out)

**Should see**
- First line: `getnao · <s> skills in <k> of <m> repositories`, where `<m>` is the number of repositories in step 2,
  **not** counting forks
- Then a blank line and one block per repository *with skills* (`<k>` blocks); repositories without skills are not listed
- Each block: `getnao/<name> · <n> skills`, then its skills as for a single repository (sorted by name, linked)
- The blocks are sorted by `owner/name`, ignoring case; the `<n>` of the blocks add up to `<s>`
- Each link is pinned to that repository's commit: `…/blob/<40-hex commit>/…`

## ORG-02 · A block is what scanning that repository alone prints
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/getnao 2>/dev/null`; pick a block, and the commit in its links
2. `./skill-atlas scan github.com/getnao/<name>/tree/<that commit> 2>/dev/null`

**Should see**
- Step 2 prints exactly the block of step 1, line for line

## ORG-03 · A repository's warnings, prefixed, the scan goes on
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/getnao >/dev/null` (only stderr)

**Should see**
- Each warning starts with `warning: getnao/<name>: ` and names the file, such as
  `warning: getnao/sylph: .claude/skills/blog-writer/SKILL.md: no front matter; using the directory name`
- The scan still lists every repository with skills; exit code 0

## ORG-04 · A large organization, through code search
*Needs `GITHUB_TOKEN`; takes a while.*

**Steps**
1. `time ./skill-atlas scan github.com/JetBrains`

**Should see**
- `JetBrains · <s> skills in <k> of <m> repositories`, `<m>` in the hundreds
- Blocks such as `JetBrains/koog`, `JetBrains/MPS`, sorted ignoring case
- If there are more than 1000 `SKILL.md`: a warning that some may be missing; the scan still prints

## ORG-05 · A user's account
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan github.com/<a GitHub user with a skill in a repository of their own>`

**Should see**
- The same shape as ORG-01: `<user> · <s> skills in <k> of <m> repositories`, then the blocks

## ORG-06 · An unknown organization
*Needs `GITHUB_TOKEN`.*

**Steps**
1. `./skill-atlas scan https://github.com/no-such-org-qa-12345`

**Should see**
- `Organization not found: https://github.com/no-such-org-qa-12345`
- Exit code 1

## ORG-07 · `..` as the owner: nothing asked of GitHub
**Steps**
1. Disconnect from the network
2. `./skill-atlas scan https://github.com/..`
3. `./skill-atlas scan https://github.com/.`

**Should see**
- `Organization not found: https://github.com/..` (and `…/.`) at once, not a network error
- Exit code 1 each

## ORG-08 · A rejected token stops the whole scan
**Steps**
1. `GITHUB_TOKEN=bad ./skill-atlas scan github.com/getnao`

**Should see**
- Only `GitHub rejected the token in GITHUB_TOKEN`: no partial list
- Exit code 1

## ORG-09 · GitHub unreachable stops the whole scan
**Steps**
1. Disconnect from the network
2. `./skill-atlas scan github.com/getnao`

**Should see**
- `Cannot reach GitHub: …`, no partial list, no stack trace
- Exit code 1
