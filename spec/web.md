# Web view
`./skill-atlas serve [--port <number>]` — a **local** page, on `127.0.0.1`, port *4173* by default
Prints `Skill Atlas at <URL>`; a wrong argument → usage, exit code 1
- Only in the Node CLI: the browser terminal's `help` does not list it
- A request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>` → 403 (no DNS rebinding)
## Page
- A **field** for a repository link: a GitHub URL, or a local directory
- The repository and its skill count, then **every skill**: name and description, sorted by name
- A description is **trimmed** to its first sentence, on one line (at most two lines on screen);
  when there is more, it is **foldable**: a click unfolds the whole description, another folds it.
  Folding does not change the selected skill
- A selected skill (the first one at first): its name, link, `also in <paths>`, and its **SKILL.md** as it is
- **Suggestions** in the field: the user's GitHub repositories; picking one fills in its URL
  - Without `GITHUB_TOKEN`: none, and a hint to set it; a GitHub failure → its *clear message*, the page still works
- Warnings under the field; an unreachable repository → its *clear message*, no skills
- `?repo=<link>` scans at once, so a scan has a link of its own
- A SKILL.md is shown as **text**, never as HTML
## API
`GET /api/scan?repo=<link>` → JSON `{ repository, skills, warnings }`; a skill has `name`,
`description` (on one line), `summary` (its first sentence), `path`, `link`, `copies` and `text`, the SKILL.md
- No link, or an unreachable repository → 400 `{ error }`

`GET /api/repositories` → JSON `{ repositories }`: the `GITHUB_TOKEN` user's repositories (GitHub's
`/user/repos`), most recently pushed first, 100 a page, at most 3 pages; a repository has `full_name`,
`url` (`https://github.com/<owner>/<repo>`) and `description` (`''` if none)
- Without `GITHUB_TOKEN` → `{ repositories: [], hint: 'Set GITHUB_TOKEN to see your repositories' }`
- A GitHub failure (a rejected token, the rate limit, unreachable) → `{ repositories: [], error }`, still 200
- *Nothing is stored*: every request scans afresh
