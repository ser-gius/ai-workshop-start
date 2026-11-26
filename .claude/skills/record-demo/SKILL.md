---
name: record-demo
description: Record a short MP4 demo of the Skill Atlas web view (skill filter, organization scan, a repository, a local directory, a filtered link) with a headless Chrome. Use when asked for a demo video or screencast, or to attach one to a pull request that changes what the page shows.
---

# Record a demo video

`record.mjs` starts its own `./skill-atlas serve` on a spare port, drives a 1280×800 headless Chrome
through Playwright, records it and writes an MP4. Typing is slowed down so a viewer can follow it.

```bash
.claude/skills/record-demo/setup.sh            # once per machine: ffmpeg, Google Chrome, Playwright
node .claude/skills/record-demo/record.mjs --list
GITHUB_TOKEN=$(gh auth token) node .claude/skills/record-demo/record.mjs filter org \
  --out "$AIR_ARTIFACTS_DIR/filter-and-org-scan.mp4"
```

Cases play one after another in a single video, in the order you give them. `--out` defaults to
`$AIR_ARTIFACTS_DIR/demo.mp4` (or `./demo.mp4`).

| Case | Shows | Time |
| --- | --- | --- |
| `fixture` | the local `fixture/`, offline, then filtering `use before` | ~10 s |
| `scan` | `JetBrains/kotlin`: its skills, picking one, unfolding a description | ~10 s |
| `filter` | the skill filter on `JetBrains/kotlin`: `gradle`, then `gradle version` | ~12 s |
| `org` | the `JetBrains` organization: its card, grouped skills, filtering `review` across it | ~35 s |
| `link` | `?repo=…&filter=gradle` opening the filtered view at once | ~5 s |

The GitHub cases scan live repositories (not fixed commits), so counts change over time. The `org`
scan spends about 15 s on *Scanning…*. Without `GITHUB_TOKEN` it can hit the rate limit.

## A new case

The visual tests ([tests/visual/demo.spec.ts](../../../tests/visual/demo.spec.ts)) play these same cases on
recorded data and compare screenshots of their key moments: a new case, or a changed one, belongs there too.

Add an entry to `CASES` in `record.mjs`: `about`, plus `run(p, h)`, where `p` is the Playwright page.
The helpers in `h` are `scan(link)`, `skills()` (waits for a visible skill), `filter(words, { append })`,
`clearFilter()`, `scroll(dy, ms)`, `pause(ms)` and `url`. Selectors come from the page in `src/web.ts`
(`#repo`, `#scan`, `#filter`, `#skills li`, `#organization`, `#org-top li`, …). Keep a case short:
it shows one feature.

## Check it before sharing

Take a contact sheet and look at it. A wait that timed out or a wrong selector shows up there:

```bash
ffmpeg -v error -i demo.mp4 -vf fps=1/5,scale=640:-1 /tmp/f%02d.png && ffmpeg -v error -y -i /tmp/f%02d.png -vf tile=4x4 /tmp/sheet.png
```

## Attach it to a pull request

**CI does this already** for every pull request from this repository: once CI finishes, the `Demo`
workflow ([.github/workflows/demo.yml](../../../.github/workflows/demo.yml)) takes the videos the
visual tests recorded (one per case, on recorded data) and posts them with `attach.sh`. A PR opened
before that workflow existed gets its demo when you rerun its CI (`gh run rerun <run id>`). Use the
steps below for a recording CI cannot make: live data, or a case that isn't a visual test yet.

A demo is only done once a reviewer can see it in the PR itself. A link to a session artifact, or
asking the user to drag the file in, does not count. GitHub has no API for PR attachments, so
`attach.sh` hosts the files on the orphan branch `demo-assets` and posts them in the PR description:

```bash
# Optional: stills of the key moments, e.g. one frame at 8 s
ffmpeg -v error -y -ss 8 -i "$AIR_ARTIFACTS_DIR/demo.mp4" -frames:v 1 "$AIR_ARTIFACTS_DIR/demo-8s.png"
.claude/skills/record-demo/attach.sh <pr-number> "$AIR_ARTIFACTS_DIR/demo.mp4" "$AIR_ARTIFACTS_DIR/demo-8s.png"
```

- Each MP4 becomes an inline GIF preview (8 fps, 800 px wide), followed by a link to the MP4 itself.
  PNG, JPG and GIF files are shown inline as they are.
- Files go under `pr-<n>/` on `demo-assets` through a temporary worktree. The current checkout and
  the PR branch are left alone.
- The description gets a `### Demo` section between `<!-- demo:start -->` and `<!-- demo:end -->`.
  Running it again replaces that section and leaves the rest of the description as it was. Links
  point at the `demo-assets` commit, so a later run does not break an earlier one.
- Then open the PR and check that the GIF renders. Mention the demo in the description's text too,
  without the old "drag it in" note.

Keep the MP4 under `$AIR_ARTIFACTS_DIR` as well. Never commit demo files to the PR branch or `main`.

## Troubleshooting

- `Executable doesn't exist … ffmpeg-linux`: run `setup.sh` again. It links the system ffmpeg where
  Playwright looks for its own.
- `npx playwright install` failing to download is expected here. Chrome comes from Google's `.deb`
  instead (apt's `chromium-browser` is only a snap stub).
