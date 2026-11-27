# Web view
`./skill-atlas serve [--port <number>]` — a **local** page, on `127.0.0.1`, port *4173* by default
Prints `Skill Atlas at <URL>`; a wrong argument → usage, exit code 1
- Only in the Node CLI: the browser terminal's `help` does not list it
- A request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>` → 403 (no DNS rebinding)
## Page
- A **field** for a repository link: a GitHub URL, a GitHub organization URL, or a local directory
- The **header** on one row: `Skill Atlas`, the field and its *Scan* button, then what was scanned (`JetBrains/kotlin · 6 skills`)
- The skills and their **filter** show only *once a scan has answered*: before a scan, while it runs, and on
  a failure, only the header (and the organization's card while it scans)
- No skill selected (no match, or no skills) → the SKILL.md view says `Select a skill to read its SKILL.md.`
- The repository and its skill count, then **every skill**: name, description and the **day** it last changed
  ([analysis](analysis.md#when-a-skill-last-changed)), sorted by name
  - The day, `2026-11-20` (UTC), under the name; its whole time on hover
    (`Last updated 2026-11-20 09:14:03 UTC`). No date → nothing there
- A description is **trimmed** to its first sentence, on one line, at most *two lines* on screen
  (a long sentence too); when there is more (a second sentence, or a sentence cut at two lines), it is
  **foldable**: `▸` shows it, a click unfolds the whole description (`▾`), another folds it.
  Folding does not change the selected skill
- A selected skill (the first one at first): its name, link, `also in <paths>`, `updated <day>`, and its **SKILL.md** as it is
- **Suggestions** in the field: the user's GitHub repositories; picking one fills in its URL
  - Without `GITHUB_TOKEN`: none, and a hint to set it; a GitHub failure → its *clear message*, the page still works
- Warnings under the field; an unreachable repository → its *clear message*, no skills
- `?repo=<link>` scans at once, so a scan has a link of its own
- A SKILL.md is shown as **text**, never as HTML
- An **organization**: its name, skill count and `<n> of <m> repositories`, then the skills *grouped by
  repository*: a heading per repository (`owner/name · N skills`, linked), its skills under it, as above
- An organization's **card**, *Scan the organization*, above the skills (only for an organization):
  - `github.com/<owner>` and a pill with its repository count (`865 repositories`, forks left out; `…` while scanning)
  - A **progress bar**: moving while the scan runs (one request, so no percentage), full once it has answered
  - `<n> with skills, among them`, then the **top 3** repositories by skill count, most first, a tie by name
    ignoring case: the name without the owner, in monospace, linked, and `N skills`; then `+<n> more`
    when there are more. With 3 or fewer: `<n> with skills`, no `+<n> more`; with none: `No repository with skills`
  - Hidden for a repository or a local directory, and on a failure (its message shows instead)
## Long texts
Every text stays **inside its card**, even a long one with no spaces; the page never scrolls sideways
- A skill's **name** takes at most *half* its row, wrapped (at a `-`, else anywhere) when longer:
  the description keeps the other half
  `a-very-long-skill-name-without-any-spaces-that-goes-on-and-on-and-on-forever-and-ever` → on a few lines, its description beside it
- **Wrapped**: `No skills match "<filter>"`, a word in a description, a repository's heading, a warning,
  `also in <paths>`, the selected skill's name and link, an error in the header
- **Cut with `…`**, on one line, the whole text on hover: what was scanned in the header
  (`Scanning /tmp/deep/deep/deep/…`, `JetBrains/kotlin · 6 skills`), so the header stays one row; and an
  organization's name and top repositories in its card
## Filter
A **filter field** above the skill list narrows it *as you type*, no new scan
- Its **words** (split on spaces) are matched against a skill's **name** and whole **description**:
  every word, *in any order*, as part of a word, case-insensitive; one in the name, another in the description is a match
  `use before` → `code-style`, `reviews`, `run-tests`; `generator plugin` → `aspect-generator`
- Empty, or only spaces → every skill
- The count shows the matches: `fixture · 3 of 7 skills`; and in the filter field, a **pill**: `3 of 7` while
  it has words, else `7 skills`
- A match is **highlighted**, in the name and in the description: every occurrence of every word,
  case-insensitive (`test` highlights `teSt` and `Test`)
- While a word is in the description, the skill shows a **snippet** of it instead, on one line: from the start of
  a word at most 30 characters before the first match, to at most 80 after it, `…` where it is cut;
  a match in the name only → the description as without a filter
- No match → `No skills match "<filter>"`, no selected skill
- The selected skill stays while it matches; else the first match is selected
- A new scan keeps the filter
- An organization: its skills are filtered *across its repositories*; a repository's heading shows only over a match;
  filtered, the count is `<owner> · 3 of 552 skills`; unfiltered, the organization's as above
- `?filter=<words>`, with `?repo=`: the filtered view has a link of its own; typing updates the link,
  an empty filter drops the parameter
## API
`GET /api/scan?repo=<link>` → JSON `{ repository, skills, warnings }`; a skill has `name`,
`description` (on one line), `summary` (its first sentence), `path`, `link`, `copies`, `text`, the SKILL.md,
and `updated`, the time it last changed (ISO 8601 in UTC, `2026-11-20T09:14:03Z`), `null` without a date
- No link, or an unreachable repository → 400 `{ error }`
- An organization → `{ organization, repositories, warnings }`: `organization` has `id`, `url` and `repositories`
  (how many, forks left out); `repositories` lists those with skills, each `{ repository, skills }` as above

`GET /api/repositories` → JSON `{ repositories }`: the `GITHUB_TOKEN` user's repositories (GitHub's
`/user/repos`), most recently pushed first, 100 a page, at most 3 pages; a repository has `full_name`,
`url` (`https://github.com/<owner>/<repo>`) and `description` (`''` if none)
- Without `GITHUB_TOKEN` → `{ repositories: [], hint: 'Set GITHUB_TOKEN to see your repositories' }`
- A GitHub failure (a rejected token, the rate limit, unreachable) → `{ repositories: [], error }`, still 200
- *Nothing is stored*: every request scans afresh
