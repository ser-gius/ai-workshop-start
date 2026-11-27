# Visual tests

The demo ([record-demo](../../.claude/skills/record-demo/SKILL.md)) as Playwright tests: the same cases
(`fixture`, `scan`, `filter`, `org`, `link`), plus `narrow`, the header on a phone; a screenshot at each key moment, compared with a baseline
pixel for pixel. Every run is recorded: a video per test, in `test-results/` (an artifact on CI).

What keeps them deterministic:
- **Data**: GitHub answers from [github.json.gz](github.json.gz), recorded once by
  [record-github.ts](record-github.ts) for `JetBrains/kotlin` and the `JetBrains` organization, public
  repositories only, paged again as GitHub pages them for the public; a request it did not record fails the scan.
  `npm test` checks it is complete ([visual-recording.test.ts](../visual-recording.test.ts)). The fixture is copied to a fixed path,
  `/tmp/skill-atlas-visual/fixture`, since a local directory shows its path. The suggestions are fixed.
  [server.ts](server.ts) serves the page with them.
- **Browser and fonts**: the Playwright image, pinned by digest (Liberation Sans and Mono, which the page's
  font stacks name; a test checks them). Elsewhere the same fonts still render a few pixels apart.
- **Viewport**: 1280×800, as the demo (the `narrow` test: 375×667, a phone), scale 1, `en-US`, UTC, light; animations and the caret off.
- **The organization's scan** is held until *Scanning…* is on screen, then answered.

```bash
npm run test:visual:docker                 # compare, in the image; needs Docker
CHROME=/usr/bin/google-chrome npm run test:visual   # outside the image: Chrome from record-demo/setup.sh; expect diffs
GITHUB_TOKEN=$(gh auth token) node tests/visual/record-github.ts   # new data: new baselines too
```

## Baselines

Made in the cloud, on Linux, in the same image as CI's `visual` job, by
[visual-baselines.yml](../../.github/workflows/visual-baselines.yml): label the pull request
`update-baselines`, or `gh workflow run visual-baselines.yml --ref <branch>`. It commits the screenshots that
changed to the branch (`demo.spec.ts-snapshots/<name>-linux.png`) and runs CI again; look at them in the
pull request's diff before merging. On CI a missing or different screenshot fails; the artifact
`visual-tests` has the actual one, the expected one and the diff, and the video.
