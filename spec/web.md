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
- Warnings under the field; an unreachable repository → its *clear message*, no skills
- `?repo=<link>` scans at once, so a scan has a link of its own
- A SKILL.md is shown as **text**, never as HTML
## API
`GET /api/scan?repo=<link>` → JSON `{ repository, skills, warnings }`; a skill has `name`,
`description` (on one line), `summary` (its first sentence), `path`, `link`, `copies` and `text`, the SKILL.md
- No link, or an unreachable repository → 400 `{ error }`
- *Nothing is stored*: every request scans afresh
