---
name: red-agent
description: Try to break the Skill Atlas web view (`./skill-atlas serve`), then open one GitHub issue per bug found, with the steps to reproduce it and a video of them, labelled "Delegated to AI", and posted in the Slack channel sergius-private-channel. Use when asked to attack, break, fuzz or bug-hunt the web view, or to act as the red agent.
---

# Red agent: break the web view, report each bug

The goal is bugs, not passes: find where the page or its API does not do what
[spec/web.md](../../../spec/web.md) says, or does something no user would want (a crash, a hang,
a page that lies, HTML that runs). Each bug ends as **one issue**: steps, expected, actual, and
a video of the steps, labelled `Delegated to AI` so the [issue-to-pr](../issue-to-pr/SKILL.md)
agent can pick it up.

Do not fix anything here, and do not change `src/`, `spec/` or `tests/`.

## 1. Prepare
1. Read [spec/web.md](../../../spec/web.md), the page in [src/web.ts](../../../src/web.ts) and
   [qa/web.md](../../../qa/web.md). The QA cases are what is already checked: look *between* them.
2. `npm ci`, then `.claude/skills/record-demo/setup.sh` once per machine (ffmpeg, Chrome, Playwright),
   and `jq` for Slack (`sudo apt-get install -y jq` if `command -v jq` finds none).
3. Start a server of your own: `./skill-atlas serve --port 4400 &`. Use `GITHUB_TOKEN=$(gh auth token)`
   for GitHub links; prefer the fixed commits in [qa/README.md](../../../qa/README.md) and the local
   [fixture/](../../../fixture/README.md), so a bug reproduces the same way later.
4. Read the bugs already known, so none is filed twice:
   `gh issue list --state all --label "Delegated to AI" --limit 200` and `gh issue list --search "<words>"`.

## 2. Attack
Only the local server and your own scratch directories. No denial of service, no flooding GitHub
(mind the rate limit), nothing outside `127.0.0.1`. Try, among others:

- **The field**: empty, spaces, a very long link, `github.com/x` without `https://`, a trailing `/` or `.git`,
  `/tree/<sha>`, `/blob/…`, a user instead of an organization, a non-existent owner, `..` and `~` paths,
  a file instead of a directory, a directory without skills, unicode and emoji. Press Enter, double-click *Scan*.
- **Races**: a second scan while the first runs (a slow organization, then a fast fixture): does the
  slower answer overwrite the newer one? The card, the count and the title must belong to the last scan.
- **The filter**: regex characters (`.*`, `(`, `[`, `\`), HTML (`<b>`, `&amp;`), a word that is in the name
  and the description, overlapping words (`te tes`), very long words, typing while a scan runs.
- **Hostile SKILL.md** (in a scratch copy of `fixture/`): HTML and `<script>` in the name, the description
  and the body; a missing or broken front matter; a huge file; a very long single-line description;
  unicode names; two skills with the same name. Nothing may run as HTML, nothing may break the layout.
- **The URL**: `?repo=` and `?filter=` with odd values, encoded and not, both repeated, then
  Back and Forward and a reload: does the view follow the link?
- **Layout**: a 375 px wide window and a 2560 px one, zoom 200 %, long names and descriptions;
  folding (`▸`/`▾`) with a filter on; keyboard only (Tab, Enter, arrows in the list).
- **The API**: `curl` on `/api/scan` and `/api/repositories` with no, empty, odd or repeated parameters,
  another `Host` header (must be 403), other methods (`POST`, `HEAD`), unknown paths.

A bug is one *cause*: three inputs that fail for the same reason are one issue with the three listed.
Something the spec does not say, but that clearly hurts a user, is a bug too; say in the issue that
the spec is silent.

## 3. Confirm
For every candidate, before writing anything:
1. Reproduce it twice from a fresh page (a new tab, the server restarted when state could matter).
2. Cut the steps down to the fewest that still show it.
3. Note the spec line it breaks (`spec/web.md`, quoted), or that the spec is silent.

What does not reproduce is not reported. A failure of GitHub or of the network is not a bug in the view
unless the page handles it badly.

## 4. Record it
One short MP4 per bug, of exactly the steps in the issue. Copy the template below to a scratch
file outside the repository (`/tmp/red/<slug>.mjs`), change only `steps`, and run it:
`node /tmp/red/<slug>.mjs "$AIR_ARTIFACTS_DIR/red-agent/<slug>.mp4"`.

```js
// A video of one bug's steps, on its own `./skill-atlas serve`.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const ROOT = '/workspaces/ai-workshop-start';          // the checkout
const { chromium } = createRequire(join(homedir(), '.cache/skill-atlas-demo/package.json'))('playwright');
const out = process.argv[2];
mkdirSync(dirname(out), { recursive: true });

async function steps(p, url) {                          // the issue's steps, slow enough to follow
  await p.goto(url); await p.waitForTimeout(1000);
  await p.type('#repo', join(ROOT, 'fixture'), { delay: 40 }); await p.click('#scan');
  await p.waitForSelector('#skills li:not([hidden])');
  await p.type('#filter', '(', { delay: 150 });
  await p.waitForTimeout(3000);                         // hold on the bug
}

const port = 4500 + Math.floor(Math.random() * 400);
const server = spawn(join(ROOT, 'skill-atlas'), ['serve', '--port', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
const url = await new Promise((ok) => server.stdout.on('data', (d) => { const m = /at (\S+)/.exec(String(d)); if (m) ok(m[1]); }));
const dir = mkdtempSync(join(tmpdir(), 'red-'));
try {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
  try { await steps(await context.newPage(), url); } finally { await context.close(); await browser.close(); }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, readdirSync(dir)[0]), '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', out]);
} finally { server.kill(); }
console.log(out);
```

For an API bug, record the `curl` in a terminal instead: `asciinema` or, simpler, the page opened
on the API's URL so the JSON shows. Then take a contact sheet and check the video shows the bug:

```bash
ffmpeg -v error -i <slug>.mp4 -vf fps=1,scale=640:-1 /tmp/f%02d.png && ffmpeg -v error -y -i /tmp/f%02d.png -vf tile=4x4 /tmp/sheet.png
```

## 5. File the issue
GitHub has no API for attachments, so the video goes on the orphan branch `demo-assets`
(as in [record-demo](../../../.claude/skills/record-demo/SKILL.md)), under `bugs/<slug>/`, with an
inline GIF preview. Never on `main` or a working branch.

```bash
slug=scan-race-old-answer-wins; mp4="$AIR_ARTIFACTS_DIR/red-agent/$slug.mp4"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner); wt=$(mktemp -d)/wt
if git fetch -q origin demo-assets; then git worktree add -q --detach "$wt" FETCH_HEAD
else git worktree add -q --detach "$wt" && git -C "$wt" checkout -q --orphan demo-assets-new && git -C "$wt" rm -rfq .; fi
mkdir -p "$wt/bugs/$slug" && cp "$mp4" "$wt/bugs/$slug/"
ffmpeg -v error -y -i "$mp4" -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" "$wt/bugs/$slug/$slug.gif"
git -C "$wt" add bugs && git -C "$wt" commit -qm "Bug video: $slug" && git -C "$wt" push -q origin HEAD:refs/heads/demo-assets
sha=$(git -C "$wt" rev-parse HEAD); git worktree remove --force "$wt"; git branch -qD demo-assets-new 2>/dev/null || true
echo "https://github.com/$repo/raw/$sha/bugs/$slug/$slug.gif https://github.com/$repo/blob/$sha/bugs/$slug/$slug.mp4"
```

Then the issue, with the label (`gh label create "Delegated to AI"` if it is missing):

```bash
title="<what goes wrong, from the user's side>"
url=$(gh issue create --label "Delegated to AI" --title "$title" --body-file - <<EOF
<one sentence: the bug and where it shows>

**Steps**
1. \`./skill-atlas serve\`, open the page
2. <each step, exact: what is typed, clicked, opened>

**Expected**: <what spec/web.md says, quoted, with the line; or "the spec is silent" and what a user expects>
**Actual**: <what happens, quoted: the text on screen, the console error, the HTTP answer>

**Video**

![$slug](https://github.com/$repo/raw/$sha/bugs/$slug/$slug.gif)

[Full video: $slug.mp4](https://github.com/$repo/blob/$sha/bugs/$slug/$slug.mp4)

Found on $(git rev-parse --short HEAD), $(uname -s), Chrome $(google-chrome --version | grep -o '[0-9.]*$').
EOF
)
```

- The title says what the user sees (`A slow scan's answer replaces the newer one`), not the guessed cause.
- A guess at the cause (a file and a line) may follow *Actual*, marked as a guess.
- Open the issue afterwards and check that the GIF renders.

## 6. Post it on Slack
Every new issue, right after it is filed, goes to the private channel `sergius-private-channel`, with
`SLACK_BOT_TOKEN`: one message per issue, its title and link, so a human sees what was delegated.
Only issues this run opened; not the dropped candidates, not duplicates.

```sh
# the channel's ID (a private channel is not addressable by name); once per run
CHANNEL=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  "https://slack.com/api/conversations.list?types=private_channel&limit=1000" \
  | jq -r '.channels[] | select(.name=="sergius-private-channel") | .id')
# the message: the bug, its link, the label
jq -n --arg c "$CHANNEL" --arg t ":beetle: New bug in the web view, delegated to AI: <$url|$title>" \
  '{channel:$c, text:$t, unfurl_links:false}' \
  | curl -s -X POST -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H 'Content-Type: application/json; charset=utf-8' --data @- \
      https://slack.com/api/chat.postMessage | jq '{ok, error}'
```

Check `.ok`; if it is `false`, report the `.error` (`not_in_channel`, `missing_scope`, …) to the user,
and go on filing the other issues. Never print the token.

## 7. Report
To the user: a table of the issues opened (number, title, link, posted on Slack or the error), then the candidates dropped and why
(did not reproduce, a duplicate of #n, not a bug), and what was tried without finding anything.
Keep the videos under `$AIR_ARTIFACTS_DIR/red-agent/`. Then, as [AGENTS.md](../../../AGENTS.md) asks,
add a note with [update-memory](../update-memory/SKILL.md) if the hunt taught something.
