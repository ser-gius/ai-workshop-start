# Air can move the checkout to its own branch mid-task; a Playwright video's clock is not the script's

**Task**: the caper cut of the overview video, PR #45 (`demo/overview/ritchie.mjs`, `ritchie.py`)
**Learned**:
- Between turns the checkout moved from `overview-video` to `air/skill-atlas-feature-and-workflow-demo-…` (same history). `git push` then went to that branch and the PR did not move. Check `git status -sb` before pushing; `git push origin <sha>:refs/heads/<pr branch>` put the commit on the PR.
- Times from `Date.now()` in the script are not the recorded WebM's times, and the WebM's length minus the script's close time gave a wrong offset (+1.2 s, the truth was −0.1 s). A red frame at a known time, found with ffmpeg + numpy, lines them up.
- A mostly white page (`slack.html`) frozen with `hue=s=0.25` looks empty on a contact sheet: check the clip's last frame before blaming the cut.
- Emoji in recorded pages show as boxes without `fonts-noto-color-emoji`.
**Why it matters**: otherwise pushes miss the PR, and cuts land on the wrong page.
