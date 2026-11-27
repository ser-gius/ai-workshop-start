# Web view: `./skill-atlas serve`
See [README.md](README.md) for the setup. Unless a case says otherwise: start the server with
`./skill-atlas serve`, open http://127.0.0.1:4173/ in a browser, and in the field type the full path of
`fixture/` in your checkout (`<checkout>/fixture`, `pwd` shows it), then **Scan**.

## Server

### WEB-01 · Start, on the default port and another one
**Steps**
1. `./skill-atlas serve`; stop it with Ctrl+C
2. `./skill-atlas serve --port 4180`

**Should see**
- Step 1: `Skill Atlas at http://127.0.0.1:4173/`; the page opens at that URL
- Step 2: `Skill Atlas at http://127.0.0.1:4180/`; the page opens there, and not on 4173

### WEB-02 · A wrong argument
**Steps**
1. `./skill-atlas serve --port abc`
2. `./skill-atlas serve --verbose`

**Should see**
- `Usage: skill-atlas serve [--port <number>]` each time; the server does not start
- Exit code 1

### WEB-03 · Only local, no DNS rebinding
**Steps**
1. `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4173/`
2. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/`
3. `curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example:4173' http://127.0.0.1:4173/`
4. From another machine on the network: `http://<this machine's IP>:4173/`

**Should see**
- Steps 1, 2: `200`
- Step 3: `403`
- Step 4: the connection is refused (the server listens on `127.0.0.1` only)

## The page

### WEB-31 · Before a scan, only the header; the skills once a scan has answered
**Steps**
1. Open http://127.0.0.1:4173/ (no `?repo=`)
2. Scan `https://github.com/JetBrains/no-such-repository-qa`
3. Scan `<checkout>/fixture`

**Should see**
- Step 1: the header on one row: `Skill Atlas`, the field (placeholder `A GitHub link or a local directory`)
  and **Scan**. No *Filter the skills* card, no list, no `SKILL.md` view
- Step 2: `Scanning …` in the header, then `Repository not found: …`; still only the header, no skills
- Step 3: on the header's row, after **Scan**: `fixture · 7 skills`; under it, *Filter the skills* and the skills

### WEB-04 · A repository: its skills, the first one selected
**Steps**
1. Scan `<checkout>/fixture`

**Should see**
- `fixture · 7 skills`
- The skills, by name: `aspect-generator`, `code-style`, `commits`, `lint-checks`, `release-checklist`,
  `reviews`, `run-tests`; each with its description's first sentence, on one line
- `weather-retrieval`, `notes`, `commits-example` are not listed
- `aspect-generator` is selected: on the right, its name, its link, and its whole `SKILL.md`
- Under the field, the warning about `release-checklist`'s malformed front matter
- The organization card, *Scan the organization*, is **not** shown

### WEB-05 · Selecting a skill; its copies
**Steps**
1. Click `commits`
2. Click `reviews`

**Should see**
- Step 1: the `commits` `SKILL.md` as it is in the file, front matter included:
  ``Start with the area, then say what changed: `editor: keep the caret after undo`.``
- Step 2: `also in .claude/skills/reviews/SKILL.md` under its link

### WEB-32 · Selecting a skill with the keyboard
**Steps**
1. Click in the filter field, then press Tab
2. Press ↓ four times
3. Press Enter
4. Press End, then ↑; press Space
5. Press Tab, then Enter

**Should see**
- Step 1: a ring on `aspect-generator`, the selected skill: the list is one Tab stop
- Step 2: the ring moves down to `release-checklist` (it has no `▸`); `aspect-generator` stays selected
- Step 3: `release-checklist` is selected, its SKILL.md shows, as with a click
- Step 4: the ring on `run-tests`, then `reviews`; Space selects `reviews`; the page does not scroll
- Step 5: Tab goes to `reviews`' `▸`; Enter unfolds it, and `reviews` stays selected

### WEB-06 · A SKILL.md is shown as text, never as HTML
**Steps**
1. Copy `fixture` to a scratch folder: `cp -r fixture /tmp/qa-fixture`
2. Append to `/tmp/qa-fixture/.claude/skills/commits/SKILL.md`: `<b>bold</b> <img src=x onerror=alert(1)>`
3. Scan `/tmp/qa-fixture`, select `commits`

**Should see**
- The characters `<b>bold</b> <img src=x onerror=alert(1)>` literally: no bold text, no image, no alert

### WEB-07 · A foldable description
**Steps**
1. Scan `<checkout>/fixture`; look at `commits` in the list
2. Click its `▸`
3. Click it again
4. Look at `release-checklist`, and at a skill with a long first sentence
   (scan `https://github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85`: `add-java-code-snippets-in-docs`)

**Should see**
- Step 1: `▸ Write commit messages the way this repository does.`: there is more, so it folds
- Step 2: `▾` and the whole description, `… Use for every commit.`
- Step 3: folded again, to the first sentence
- Steps 2, 3: the selected skill does not change
- Step 4: `release-checklist` has no `▸` (nothing more); the long sentence is cut at **two lines** on screen and has a `▸`

### WEB-08 · A GitHub repository; its links
*Needs `GITHUB_TOKEN` in the shell that started the server.*

**Steps**
1. Scan `https://github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85`
2. Click the selected skill's link

**Should see**
- `JetBrains/koog · 2 skills`: `add-java-code-snippets-in-docs`, `split-jvm-nonjvm`
- The link opens the `SKILL.md` on GitHub, at commit `709079e…`

### WEB-09 · An unreachable repository
**Steps**
1. Scan `https://github.com/JetBrains/no-such-repository-qa`
2. Scan `/no/such/directory`

**Should see**
- Under the field: `Repository not found: https://github.com/JetBrains/no-such-repository-qa`, then
  `Not a GitHub URL or a readable directory: /no/such/directory`
- No skills, no selected skill; the page still works: scanning `<checkout>/fixture` next shows its skills

### WEB-10 · A scan has a link of its own
**Steps**
1. Scan `<checkout>/fixture`; copy the address bar
2. Open the copied address in a new tab

**Should see**
- Step 1: the address has `?repo=<the path>`
- Step 2: the scan runs at once, without clicking **Scan**: the same 7 skills

### WEB-11 · Suggestions: the user's repositories
*Needs `GITHUB_TOKEN` in the shell that started the server.*

**Steps**
1. Click in the empty repository field (or type the start of one of your repositories)
2. Pick one

**Should see**
- Step 1: a list of your GitHub repositories, most recently pushed first
- Step 2: the field holds `https://github.com/<owner>/<repo>`

### WEB-12 · Suggestions without a token, or with a rejected one
**Steps**
1. `unset GITHUB_TOKEN; ./skill-atlas serve`; open the page
2. Stop it; `GITHUB_TOKEN=bad ./skill-atlas serve`; open the page

**Should see**
- Step 1: no suggestions, and the hint `Set GITHUB_TOKEN to see your repositories`
- Step 2: no suggestions, and `Your repositories: GitHub rejected the token in GITHUB_TOKEN`
- Both: scanning `<checkout>/fixture` still works

### WEB-13 · Only in the Node CLI
**Steps**
1. `./skill-atlas help`

**Should see**
- `serve [--port <number>]` is listed. The browser terminal's `help`, which must *not* list it, has no page
  to open yet: covered by `npm test` only

### WEB-30 · When each skill last changed
*Step 1 needs `GITHUB_TOKEN`: without it, a GitHub skill has no day.*

**Steps**
1. Scan `https://github.com/JetBrains/koog`; hover over a skill's day
2. Select another skill
3. Scan `/tmp/qa-plain` (from CLI-19: the fixture outside git)

**Should see**
- Step 1: each skill's day, `YYYY-MM-DD`, under its name; on hover,
  `Last updated <day> <hh:mm:ss> UTC`. On the right, under the link, `updated <day>`: the same day
- Step 2: its own `updated <day>`, as `./skill-atlas scan` prints it
- Step 3: no day anywhere, no warning

## The organization

### WEB-14 · An organization: grouped by repository
*Needs `GITHUB_TOKEN` in the shell that started the server.*

**Steps**
1. Scan `https://github.com/getnao`

**Should see**
- `getnao · <s> skills`, and `<k> of <m> repositories` (forks left out)
- The skills grouped by repository: a heading per repository, `getnao/<name> · N skills`, linked to the
  repository on GitHub, its skills under it, sorted by name
- The repositories sorted by `owner/name`, ignoring case; repositories without skills have no heading
- Warnings prefixed with `getnao/<name>:` under the field

### WEB-15 · The organization's card
*Needs `GITHUB_TOKEN` in the shell that started the server.*

**Steps**
1. Scan `https://github.com/getnao`; watch the card while it scans
2. Wait for it to answer
3. Scan `https://github.com/JetBrains` (many repositories with skills)

**Should see**
- Step 1: *Scan the organization*, above the skills; `github.com/getnao` and a pill `…`; the progress bar moving
  (no percentage)
- Step 2: the pill `<m> repositories` (forks left out), the bar **full**; `<k> with skills` and the
  repositories, most skills first (a tie by name, ignoring case), each as its name without `getnao/`, in
  monospace, linked, with `N skills`; with 3 or fewer, no `among them` and no `+<n> more`
- Step 3: `<k> with skills, among them`, the **top 3**, then `+<k − 3> more`

### WEB-16 · The card's other states
**Steps**
1. Scan an organization or user whose repositories have no skills (`https://github.com/<a user with no skills>`)
2. Scan `https://github.com/no-such-org-qa-12345`
3. Scan `<checkout>/fixture`, then `https://github.com/JetBrains/koog`

**Should see**
- Step 1: the card, with `No repository with skills`
- Step 2: no card; `Organization not found: https://github.com/no-such-org-qa-12345` under the field
- Step 3: no card, for a local directory or for a repository

## The filter
On `<checkout>/fixture` unless a case says otherwise.

### WEB-17 · Narrows as you type, words in any order
**Steps**
1. Type `use before` in the filter field, one key at a time
2. Replace it with `before use`
3. Replace it with `generator plugin`

**Should see**
- The list narrows with each key, with no new scan (no progress, the warnings stay)
- Steps 1, 2: `code-style`, `reviews`, `run-tests`; the count `fixture · 3 of 7 skills`, the pill `3 of 7`
- Step 3: only `aspect-generator` (`generator` in its name, `plugin` in its whole description: `Shipped to users with the plugin.`)

### WEB-18 · Empty, or only spaces
**Steps**
1. Type `   ` (spaces only)
2. Clear the field

**Should see**
- Every skill; the count `fixture · 7 skills`, the pill `7 skills`

### WEB-19 · Highlights, case-insensitive
**Steps**
1. Type `TEST`

**Should see**
- `run-tests` listed, `test` highlighted in its name and `test` in `tests` in its description
- Every occurrence highlighted, whatever its case

### WEB-20 · A snippet of the description
**Steps**
1. Type `merging`
2. Type `lint` instead
3. Type `commits` instead

**Should see**
- Step 1: `reviews`, its description replaced by a one-line snippet around `merging` (`Use before merging.`
  from the second sentence), with `…` where it is cut
- Step 2: `lint-checks`, the snippet from the start of its description, `lint` highlighted in name and snippet
- Step 3: `commits`, highlighted in the name only: its description as without a filter (first sentence, `▸`)

### WEB-21 · No match
**Steps**
1. Type `zzz`

**Should see**
- `No skills match "zzz"`; an empty list; **no** selected skill: on the right, `Select a skill to read its SKILL.md.`

### WEB-22 · The selected skill stays while it matches
**Steps**
1. Select `reviews`
2. Type `use before`
3. Type `commit` instead

**Should see**
- Step 2: `reviews` still selected
- Step 3: `reviews` does not match; the first match, `code-style` (`committing`), is selected

### WEB-23 · A new scan keeps the filter
**Steps**
1. Type `use before`
2. Scan `<checkout>/fixture` again (or another repository)

**Should see**
- The filter field still holds `use before`; the new skills are filtered by it

### WEB-24 · A filtered view has a link of its own
**Steps**
1. Type `use before`; look at the address bar
2. Open that address in a new tab
3. Clear the filter; look at the address bar

**Should see**
- Step 1: `?repo=…&filter=use+before` (or `use%20before`), updated as you type
- Step 2: the scan and the filter at once: `3 of 7`
- Step 3: no `filter=` in the address, `repo=` stays

### WEB-25 · An organization, filtered
*Needs `GITHUB_TOKEN` in the shell that started the server.*

**Steps**
1. Scan `https://github.com/getnao`; note `<s>`
2. Type a word in one repository's skills only (one of `getnao/nao`'s skill names)

**Should see**
- Matches across repositories; a repository's heading only over a match
- The count `getnao · <n> of <s> skills`; cleared, back to the organization's count and `<k> of <m> repositories`

## API

### WEB-26 · `GET /api/scan`
**Steps**
1. `curl -s "http://127.0.0.1:4173/api/scan?repo=$PWD/fixture"`
2. `curl -s -w ' %{http_code}\n' http://127.0.0.1:4173/api/scan`
3. `curl -s -w ' %{http_code}\n' 'http://127.0.0.1:4173/api/scan?repo=/no/such/directory'`

**Should see**
- Step 1: JSON `{ repository, skills, warnings }`; each skill has `name`, `description` (on one line),
  `summary` (its first sentence), `path`, `link`, `copies`, `text` (the whole SKILL.md) and `updated`
  (the time of the latest commit to its folder or a copy's, in UTC, `YYYY-MM-DDThh:mm:ssZ`:
  `git log -1 --format=%cI -- fixture/.claude/skills/commits` for `commits`; `null` for a directory outside
  git); `reviews` has `copies: [".claude/skills/reviews/SKILL.md"]`; `warnings` has the `release-checklist` one
- Step 2: `{"error":"Enter a repository link"} 400`
- Step 3: `{"error":"Not a GitHub URL or a readable directory: /no/such/directory"} 400`

### WEB-27 · `GET /api/scan` for an organization
*Needs `GITHUB_TOKEN` in the shell that started the server.*

**Steps**
1. `curl -s 'http://127.0.0.1:4173/api/scan?repo=https://github.com/getnao'`

**Should see**
- JSON `{ organization, repositories, warnings }`; `organization` has `id` (`getnao`), `url` and `repositories`
  (the count, forks left out); `repositories` lists only those with skills, each `{ repository, skills }`

### WEB-28 · `GET /api/repositories`
**Steps**
1. With `GITHUB_TOKEN`: `curl -s http://127.0.0.1:4173/api/repositories`
2. Without (`unset GITHUB_TOKEN`, restart the server): the same
3. With `GITHUB_TOKEN=bad` (restart the server): the same, with `-w ' %{http_code}'`

**Should see**
- Step 1: `{ repositories }`, most recently pushed first, at most 300; each has `full_name`,
  `url` (`https://github.com/<owner>/<repo>`) and `description` (`""` if none)
- Step 2: `{"repositories":[],"hint":"Set GITHUB_TOKEN to see your repositories"}`
- Step 3: `{"repositories":[],"error":"GitHub rejected the token in GITHUB_TOKEN"} 200`

### WEB-29 · Nothing is stored
**Steps**
1. Scan `/tmp/qa-fixture` (from WEB-06); select `commits`
2. Edit its `SKILL.md`: change the description; scan again

**Should see**
- Step 2: the new description at once: every scan reads afresh; `git status` in the checkout is clean
