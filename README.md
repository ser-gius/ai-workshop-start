# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description, link and the day it last changed.

```console
$ npm ci
$ GITHUB_TOKEN=$(gh auth token) ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
  updated 2026-08-25
…
```

`./skill-atlas serve` opens a local web view at http://127.0.0.1:4173/: a field for a repository
link (or a local directory), its skills, and each one's SKILL.md.

`github.com/<owner>/<repo>/tree/<commit>` scans the repository at that commit. Set `GITHUB_TOKEN` for a
higher GitHub rate limit, and for the day each skill last changed. `npm test` runs the tests; `npm run test:e2e` runs them on real repositories;
`npm run test:visual:docker` runs the demo as screenshot tests, on recorded GitHub answers (Docker).

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
- [tests/visual/](tests/visual/README.md): the demo as visual tests, their baselines made on CI.
- [qa/](qa/README.md): manual test scripts, each case with its steps and what a tester should see.
