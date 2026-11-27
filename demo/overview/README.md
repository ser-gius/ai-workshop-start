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
