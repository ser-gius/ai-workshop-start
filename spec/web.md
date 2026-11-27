# Web view
`./skill-atlas serve [--port <number>]` — a **local** page, on `127.0.0.1`, port *4173* by default
Prints `Skill Atlas at <URL>`; a wrong argument → usage, exit code 1
- Only in the Node CLI: the browser terminal's `help` does not list it
- A request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>` → 403 (no DNS rebinding)
## Page
- A **field** for a repository link: a GitHub URL, a GitHub organization URL, or a local directory
- The **header** on one row: `Skill Atlas`, the field and its *Scan* button, then what was scanned (`JetBrains/kotlin · 6 skills`)
- A **narrow screen** (a phone, 375 px wide): the header fits the window, the header causes no sideways
  scroll; the field shrinks, *Scan* inside the card, and a long name of what was scanned wraps inside the card
  (`JetBrains/intellij-community-plugins · 128 skills`, on two lines). Wider than 860 px it stays on one line.
  Still open: a long skill name in the list (mono, on one line) widens the page
  (`JetBrains/kotlin` at 375 px: 665 px wide); PR #23 restyles that list
- The skills and their **filter** show only *once a scan has answered*: before a scan, while it runs, and on
  a failure, only the header (and the organization's card while it scans)
- No skill selected (no match, or no skills) → the SKILL.md view says `Select a skill to read its SKILL.md.`
- The repository and its skill count, then **every skill**: name, description and the **day** it last changed
  ([analysis](analysis.md#when-a-skill-last-changed)), sorted by name
  - A skill is a **stacked row**: its name, in *bold*, and its day beside it on the same line; its description
    under them, the list's whole width. A thin line between two skills shown one after the other
  - No line above the first skill shown, nor under a repository's heading, with a filter too (the skills
    it hides do not count: `?filter=use before` on the fixture → none above `code-style`)
  - No line next to the hovered or the selected skill, above it or under it
  - The day, `2026-11-20` (UTC), a small muted **chip**; its whole time on hover
    (`Last updated 2026-11-20 09:14:03 UTC`). No date → no chip
- A description is **trimmed** to its first sentence, on one line, at most *two lines* on screen
  (a long sentence too); when there is more (a second sentence, or a sentence cut at two lines), it is
  **foldable**: `▸` shows it, a click unfolds the whole description (`▾`), another folds it.
  Folding does not change the selected skill
  - A sentence is **measured again** when the window's width changes (a resize, a zoom) and when a filter
    shows its row: narrower, a sentence cut at two lines gets its `▸`; wider, one that fits again loses it.
    An unfolded one stays open; one still cut stays the same fold, so a focused `▸` keeps the keyboard focus
- A selected skill (the first one at first): its name, link, `also in <paths>`, `updated <day>`, and its **SKILL.md** as it is
- The **keyboard** reaches every skill, as a `listbox` does: the list is *one* Tab stop, on the selected skill;
  the arrows move the focus, not the Tab stop, so Tab back into the list returns to the selected skill
  - `↓` / `↑` move the focus to the next / previous skill shown, `Home` / `End` to the first / last;
    across an organization's repositories, past their headings; no wrap at the ends
  - `Enter` or `Space` selects the focused skill, as a click does; the focus alone selects nothing
  - A fold `▸` inside a skill is a Tab stop of its own: `Enter` on it unfolds, and keeps the selected skill
    - Only the fold of the *focused* skill (focus out of the list: the selected one) is a Tab stop; the
      others' are not: click `run-tests` in `fixture`, Tab from the filter → `run-tests`, not the 5 folds above it
  - The focused skill shows a ring; the list scrolls to it
  - `release-checklist`, with no description and so no fold, is reached like any other
- **Suggestions** in the field: the user's GitHub repositories; picking one fills in its URL
  - Without `GITHUB_TOKEN`: none, and a hint to set it; a GitHub failure → its *clear message*, the page still works
- Warnings under the field; an unreachable repository → its *clear message*, no skills
  - A link too long for a request (over Node's 16 KB, `https://github.com/` and 17000 `a`) → `The link is too long`
    - Its link too (reloaded or shared): the page, with that message, not the API's JSON
  - An answer that is not JSON → what the server answered, `The server answered 502 Bad Gateway`, never a parser's error
- `?repo=<link>` scans at once, so a scan has a link of its own
- The **history**: each new scan's link is an entry of its own, like any link opened; *Back* scans the
  link before, with its filter, *Forward* the next one (afresh: nothing is stored)
  - The same link scanned again, or typing in the filter → no new entry: the link is replaced
    (`?repo=` with spaces around it is the same link: ` <link> ` → replaced by `<link>`)
  - Back to the page before any scan (no `?repo=`) → the empty page: only the header, the field empty
  - Back while a scan runs → that link's scan; the late answer is dropped
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
- A skill's **name**, on its own line in its stacked row, wraps (at a `-`, else anywhere) when longer than the row;
  its description stays under it
  `a-very-long-skill-name-without-any-spaces-that-goes-on-and-on-and-on-forever-and-ever` → on a few lines, its description under it
- **Wrapped**: `No skills match "<filter>"`, a word in a description, a repository's heading, a warning,
  `also in <paths>`, the selected skill's name and link, an error in the header
- **Cut with `…`**, on one line, the whole text on hover: what was scanned in the header
  (`Scanning /tmp/deep/deep/deep/…`, `JetBrains/kotlin · 6 skills`), beside the field, in at most 40%
  of the row, so the header stays one row (on a narrow screen it wraps instead, see *Page*); and an organization's
  name and top repositories in its card
## Topics
Above the skill list, a **card per topic** ([analysis](analysis.md#topics)), in the topics' order:
```
Testing and test infrastructure      testing  writing-tests  driver-ui-tests  +5
Builds, modules and dependencies     build-bump-gradle-version  module-dependencies  +5
```
- Its **title** in bold; under it, on one row, the first *3* skill names as monospace **chips**, in the list's
  order, then `+<n>` for the rest. A name twice (two repositories) → one chip. Every skill's name on hover
- `./skill-atlas serve` asks the model; a server started without one (the visual tests) uses the heuristic
- An organization: one set of cards across its repositories
- No skills → no cards; a new scan replaces them; the filter does not change them
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
  - A letter whose lower case is longer does not shift it: after `İİİİ` (Turkish capital dotted I, `i̇` in lower case),
    `capitals` highlights `capitals`, not `tals fir`; the snippet starts where it should too.
    A match in part of such a letter highlights the whole letter (`i` in `İstanbul` → `[İ]stanbul`)
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
- `topics`: `[{ title, skills }]`, each skill by its `id`, every skill in exactly one; `topicsBy`: `model` or
  `heuristic`. An organization's are across its repositories
- No link, or an unreachable repository → 400 `{ error }`
- A link too long for a request (its line and headers over 16 KB: Node rejects it before the server sees it)
  → 431 `{ error: 'The link is too long' }`; the page's own link (`/?repo=`, not `/api/`) that long → 431 with the page
  - Any other request Node rejects → its usual answer, no body (400, 408, 413)
- An organization → `{ organization, repositories, warnings }`: `organization` has `id`, `url` and `repositories`
  (how many, forks left out); `repositories` lists those with skills, each `{ repository, skills }` as above

`GET /api/repositories` → JSON `{ repositories }`: the `GITHUB_TOKEN` user's repositories (GitHub's
`/user/repos`), most recently pushed first, 100 a page, at most 3 pages; a repository has `full_name`,
`url` (`https://github.com/<owner>/<repo>`) and `description` (`''` if none)
- Without `GITHUB_TOKEN` → `{ repositories: [], hint: 'Set GITHUB_TOKEN to see your repositories' }`
- A GitHub failure (a rejected token, the rate limit, unreachable) → `{ repositories: [], error }`, still 200
- *Nothing is stored*: every request scans afresh
