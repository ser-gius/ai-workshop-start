# The overview video

A 20-second video in two parts: Skill Atlas's features (the CLI, the filter, a repository, an
organization, a link of its own, a phone screen), then how the work runs (the red agent's issues
labelled `Delegated to AI`, the agent asking in Slack, the agent's PR and its Code Review, the demo
CI posts, the green checks).

```bash
.claude/skills/record-demo/setup.sh   # once per machine: ffmpeg, Google Chrome, Playwright
GITHUB_TOKEN=$(gh auth token) node demo/overview/record.mjs /tmp/skill-atlas-20s.mp4
```

- Each shot is recorded live, then only its visible part is kept: the cuts together are stretched to
  exactly 20 s (`LENGTH` in `record.mjs`). Waiting, such as the organization's ~15 s scan, is cut out.
- The GitHub pages (issues, issue #28, PR #42) are this repository's, live, logged out.
- [slack.html](slack.html) is not Slack itself (it needs a login): real messages from
  `sergius-private-channel`, the bug notice and the question on issue #33, shortened.
- The video: [skill-atlas-20s.mp4](skill-atlas-20s.mp4) (1.9 MB), committed on purpose, unlike the
  PR demos [record-demo](../../.claude/skills/record-demo/SKILL.md) keeps on `demo-assets`.

## The caper cut

The same 20 seconds, edited as a fast British crime caper: freeze frames that name each character
(*The CLI*, *The Filter*, *The Organization*, *The Red Agent*, *The Agent*, *The Reviewer*), a
*15 seconds later…* stamp over the organization's scan, punch zooms and a shaking title, a warm,
grainy grade, and a soundtrack made in code (a swung beat, a bass riff, a hit on every freeze).

```bash
sudo apt-get install -y fonts-bebas-neue fonts-noto-color-emoji python3-numpy
GITHUB_TOKEN=$(gh auth token) node demo/overview/ritchie.mjs /tmp/skill-atlas-ritchie.mp4
```

- `ritchie.mjs` records clean shots (no captions) and draws the cards as PNGs; `ritchie.py` edits them
  in ffmpeg. `KEEP_WORK=<dir>` keeps the recording, so `python3 demo/overview/ritchie.py <dir> out.mp4`
  recuts it without recording again. The timeline is the list of `card`, `clip` and `freeze` calls in
  `ritchie.py`; the end card takes what is left of the 20 s.
- The recording's clock is not the recorder's: a red frame at the start lines them up (`_flash`).
- The video: [skill-atlas-ritchie.mp4](skill-atlas-ritchie.mp4), with sound.
