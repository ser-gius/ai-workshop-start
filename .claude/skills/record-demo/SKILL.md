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

GitHub has no API for PR attachments, so `gh` cannot upload a video. Two ways to do it:
- Write the MP4 under `$AIR_ARTIFACTS_DIR`, then link the session artifact in the PR description, or
- Ask the user to drag the MP4 into the PR description on github.com (10 MB at most on the free plan).

Do not commit the video to the repository.

## Troubleshooting

- `Executable doesn't exist … ffmpeg-linux`: run `setup.sh` again. It links the system ffmpeg where
  Playwright looks for its own.
- `npx playwright install` failing to download is expected here. Chrome comes from Google's `.deb`
  instead (apt's `chromium-browser` is only a snap stub).
