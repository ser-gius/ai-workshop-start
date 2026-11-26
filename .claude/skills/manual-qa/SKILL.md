---
name: manual-qa
description: Follow the manual QA scripts in qa/ (CLI, organization, web view) in a recorded headless Chrome, case by case, and report each case's pass or fail with its video. Use when asked to run manual QA, the QA scripts or a QA case (CLI-07, WEB-15, …), or to check a change against qa/ before a release or a pull request.
---

# Manual QA: follow the scripts, record them, report

`qa.mjs` reads the scripts in [qa/](../../../qa/README.md) and, for each case, follows its steps in a
1280×800 headless Chrome and records them, **one MP4 per case**. Terminal steps play in a terminal pane,
web steps in the page, each against its own `./skill-atlas serve`. On screen: the case, the script's
current step (its own words, read from `qa/*.md`) and each point of *Should see* as it is checked, ✓ or ✗.
Then a report: pass, fail or blocked per case, with its video.

```bash
.claude/skills/record-demo/setup.sh                      # once per machine: ffmpeg, Chrome, Playwright
node .claude/skills/manual-qa/qa.mjs --list              # every case; `!` = in qa/, not automated
GITHUB_TOKEN=$(gh auth token) node .claude/skills/manual-qa/qa.mjs --all
node .claude/skills/manual-qa/qa.mjs WEB CLI-07 ORG-01   # a script (CLI, ORG, WEB) or single cases
```

Results go to `--out <dir>`, by default `$AIR_ARTIFACTS_DIR/manual-qa/<time>/` (so they are kept as session
artifacts): `<ID>.mp4` per case, `<ID>-error.png` when a case breaks off, `report.md`, `report.html`
(the videos inline) and `results.json`. The exit code is 1 when a case fails. `--all` takes about
15 minutes, mostly GitHub scans (the JetBrains organization twice).

| Result | Means |
| --- | --- |
| pass | every check of the case held |
| fail | a check did not hold (its detail says what was seen instead), or a step broke off |
| blocked | it cannot run here: no `GITHUB_TOKEN`, or a setup the script asks of the tester (below) |
| not automated | in `qa/*.md`, but not in `cases.mjs` yet: add it |

Cases that need a setup of your own are *blocked* until it is given in the environment:
`QA_EMPTY_REPO` (CLI-15: an empty repository's URL), `QA_PRIVATE_REPO` (CLI-16: a private repository with
a skill), `QA_USER` (ORG-05: a user with skills), `QA_USER_NO_SKILLS` (WEB-16 step 1).
"Disconnect from the network" is played with Node's fetch through a closed proxy port; "another machine"
(WEB-03 step 4) with this machine's own non-loopback address. The overlay says so in the video.

## Follow it through

1. Run the cases asked for (`--all` when none are named). Use `GITHUB_TOKEN=$(gh auth token)`.
2. **Every fail**: watch its video, or take a contact sheet, and read its detail. Decide which it is:
   - *the product* is wrong: the spec and the script agree, the app does not. A bug to report.
   - *the script* is out of date: the spec changed and `qa/*.md` did not. Fix the script, with the spec.
   - *the automation* is wrong (`cases.mjs`: a selector, a timing, a check stricter than the script).
     Fix it and run the case again. Never loosen a check past what the script says to make it pass.
3. **Look at the passes too**, a contact sheet per video: a check can hold while the screen is wrong (an
   empty page, the wrong repository). Fold arrows, highlights and the card are easiest to judge by eye.
4. Report to the user: the summary line, a table of each case with its result and its video, and for
   each fail what was expected, what was seen, and which of the three it is. Link the videos
   (`$AIR_ARTIFACTS_DIR/manual-qa/<time>/<ID>.mp4`) and `report.html`; say which cases were blocked and why.

```bash
ffmpeg -v error -i WEB-15.mp4 -vf fps=1/3,scale=640:-1 /tmp/f%02d.png && ffmpeg -v error -y -i /tmp/f%02d.png -vf tile=4x4 /tmp/sheet.png
```

For a pull request, link the artifact; GitHub has no API for attachments (see record-demo). Do not commit
the videos or the report.

## A case, in cases.mjs

A case changes with its script: a new case in `qa/*.md` shows as `not automated` until it is written here,
and a step of the script that a run never shows is a *warning* in the report.

```js
async 'WEB-21'(t) {
  const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);   // the case's setup
  await t.step(1); await t.filter('zzz');                                     // step 1, in the script's words
  await t.see('`No skills match "zzz"`', async () => same(await t.text('#no-match'), 'No skills match "zzz"'));
},
```

- `t.step(n, note?)`: shows step *n* of the script. Each step of the script, in order
- `t.see(text, ok)`: one point of *Should see*. `ok` is a boolean or a function returning one, or
  `{ ok, detail }`; `detail` is what was seen instead, for the report. `same`, `has`, `matches`, `exit` build it
- `t.sh(command, { env, offline, timeout })`: a command, as typed in the script, in the terminal pane;
  resolves with `{ stdout, stderr, all, code, ms, lines }`. `env: { GITHUB_TOKEN: undefined }` unsets
- `t.serve({ env, port, offline })`: a server for this case, stopped at its end: `{ url, printed, stop }`
- `t.open(url)`, `t.api(url)` (`{ status, json, text }`), `t.scan(link)`, `t.filter(words)`, `t.click(name)`,
  `t.names()` (the skills on screen), `t.selected()`, `t.item(name)`, `t.text(selector)`, `t.p` (Playwright)
- `t.needToken()`, `t.needs(ENV, what)`, `t.blocked(why)`: the case cannot run; `t.skip(text, why)`: one point cannot
- Selectors come from the page in `src/web.ts`: `#repo`, `#scan`, `#status`, `#warnings`, `#suggestions`,
  `#filter`, `#count`, `#skills li[role="option"]`, `.name`, `.snippet`, `#skill`, `#organization`, `#org-*`

## Troubleshooting

- Setup problems (`Executable doesn't exist`, Chrome): see record-demo's troubleshooting.
- WEB-01 and WEB-03 need port 4173 free: stop any `./skill-atlas serve` first.
- A GitHub case fails with `rate limit`: a token is missing, or spent; wait and run that case again.
