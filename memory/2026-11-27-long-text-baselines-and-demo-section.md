# Which visual baselines a CSS change moves, before the cloud tells you; and where a custom demo survives

**Task**: issue #31, long texts out of their cards (PR #41)
**Learned**:
- To see which demo screenshots a change moves, without Docker: stash the change, `CHROME=/usr/bin/google-chrome npx playwright test tests/visual/demo.spec.ts --update-snapshots=all`, unstash, run it again without the flag, then `git checkout tests/visual/demo.spec.ts-snapshots`. Same local fonts on both sides, so only real changes differ.
- JetBrains/kotlin's skill names are long (up to 64 chars): any cap on the name column changes `scan`, `filter`, `org`, `link` baselines.
- `demo.yml` rewrites the `<!-- demo:start -->…<!-- demo:end -->` section after every CI run, so a recording added by `attach.sh` is lost: put it in its own section after `demo:end`, linking the pinned `demo-assets` commit.
- Layout checks without baselines: a Playwright spec comparing `getBoundingClientRect()` with the card's (`tests/visual/long-text.spec.ts`), answers stubbed with `page.route('**/api/scan?*', …)`.
- `ss` is not installed; stop a server with `pgrep -f "serve --port N"`, skipping `$$` (`pkill -f` kills the agent's shell).
**Why it matters**: otherwise baselines changes surprise you on CI, and the PR's own demo silently disappears.
