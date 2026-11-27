# The Demo workflow rewrites the whole PR description, and a recording can hit an old server

**Task**: the 20-second overview video, PR #45 (`demo/overview/record.mjs`)
**Learned**:
- After CI, `demo.yml` runs `attach.sh`, which reads the PR body and writes it back: an edit made while it runs is lost (it was on #45). Edit the body again once the Demo run is done. A video you attach yourself also goes inside `<!-- demo:start/end -->`, which the Demo run replaces: move it out of the markers.
- A recording script that dies before `server.kill()` leaves `skill-atlas serve` on its port; the next run's server fails to bind and the page talks to the old one (no `GITHUB_TOKEN`: "Scanning…" forever). `pgrep -af "serve --port"`, kill by PID (`pkill -f` with the pattern also matches your own shell).
- Logged out, GitHub's PR page does not render inline review replies ("Fixed in <sha>"); the review summaries are there.
- `gh auth token` fails outside the checkout (`gh-wrapper: not a GitHub repo`): take it inside the repo first.
**Why it matters**: otherwise a PR description edit or a recording silently goes wrong.
