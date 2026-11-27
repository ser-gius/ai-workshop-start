# Waiting on a Slack decision from an unattended run, and the skill list's row markup

**Task**: issue #22 (ser-gius/ai-workshop-start), *Make the skill list nicer*: the answer in Slack was "A", stacked rows
**Learned**:
- `jq` is not installed on the Air runner: `sudo apt-get update && sudo apt-get install -y jq` before the issue-to-pr Slack commands.
- The bot's own question is in the thread too: count only replies with `bot_id == null`. The reply took ~35 min; foreground Bash waits (an until-loop ≤ 10 min per call) keep an unattended run alive, ending the turn ends it.
- A list row is now `li > div.head (div.name, span.updated) + description + div.snippet`; the line between rows is `li[role="option"] + li[role="option"]::before`, so group headings get none.
- `pkill -f "serve --port …"` kills the Bash tool's own shell (exit 144): `kill $(pgrep …)`, skipping `$$`.
**Why it matters**: without these, the Slack step fails silently or the run ends before the answer comes.
