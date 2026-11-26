# A demo linked as a session artifact is invisible to PR reviewers

**Task**: request after PR #16 showed no screenshots or video
**Learned**:
- A link to an Air session artifact, plus "drag it in yourself", left PR #16 with nothing to watch.
- `gh` cannot upload PR attachments; `.claude/skills/record-demo/attach.sh <pr> <files>` pushes them to the orphan branch `demo-assets` and posts a GIF preview in the PR description.
- GitHub renders a GIF from `github.com/<repo>/raw/<sha>/…` inline (the repo is public); an MP4 link only opens the blob page.
- In an empty orphan worktree, `git rm -rf .` fails with `pathspec '.' did not match`; add `--ignore-unmatch`.
**Why it matters**: without it, the "demo attached to the PR" item in the definition of done is never actually met.
- CI posts the demo itself: `.github/workflows/demo.yml` runs on `workflow_run` after CI and turns the `visual-tests` artifact's `test-results/demo-<case>-*/video.webm` into GIFs in the PR description. `workflow_run` uses the workflow file from `main`, so it only works once merged; older PRs need `gh run rerun`.
