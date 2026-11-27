---
name: status-update
description: Post a status update of Skill Atlas to the Slack channel sergius-private-channel, with SLACK_BOT_TOKEN - the pull requests merged and the issues resolved since a given date and time. Use when asked for a status update, a changelog, a summary of what was merged or done since a date, or to post one on Slack.
---

# Status update

One message in the private channel `sergius-private-channel`: what this repository merged and
resolved since a date and time. Facts from GitHub only, nothing guessed or summarised away.

## 1. The start
- Take the date and time from the request ("since Monday 9:00", "since 2026-11-25 14:30 CET").
  A date without a time: 00:00 of that day.
- No date at all, nor anything to take it from: the last month, from this moment one month
  ago (`SINCE=$(date -u -d '1 month ago' +%FT%TZ)`). Do not ask; the message says
  "since <that time> (the last month; no start was given)", so the default is on record.
- No time zone given: the user's own (`$TZ`, else the machine's). Say which one in the message.
- Convert it to UTC for GitHub's search; keep the original for the message:

  ```sh
  SINCE=$(date -u -d 'TZ="Europe/Berlin" 2026-11-25 09:00' +%FT%TZ)   # → 2026-11-25T08:00:00Z
  ```

  A start in the future is a mistake in the request: ask, do not post an empty update.

## 2. Collect
In the repository's checkout, for `origin` (`gh repo view --json nameWithOwner -q .nameWithOwner`):

```sh
# merged pull requests (closed without merging are not listed)
gh pr list --state merged --search "merged:>=$SINCE" --limit 500 \
  --json number,title,url,author,mergedAt > /tmp/status-prs.json
# resolved issues: closed as completed; "not planned" and duplicates are left out
gh issue list --state closed --search "closed:>=$SINCE reason:completed" --limit 500 \
  --json number,title,url,closedAt,closedByPullRequestsReferences > /tmp/status-issues.json
```

`gh issue list` does not list pull requests, so nothing is counted twice. Both are sorted by
the newest first; the message keeps that order. An issue reopened since counts only if it is
closed again now (`--state closed`).

## 3. Write the message
Build it with `node` (the runner may have no `jq`): a header, then one line per item, Slack
links `<url|text>`, and `&`, `<`, `>` in titles escaped as `&amp;`, `&lt;`, `&gt;`.

```sh
SINCE_LABEL="Wed 25 Nov 2026, 09:00 Europe/Berlin" REPO=ser-gius/ai-workshop-start \
node -e '
const fs = require("fs"), esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const prs = JSON.parse(fs.readFileSync("/tmp/status-prs.json")), issues = JSON.parse(fs.readFileSync("/tmp/status-issues.json"));
const list = (items, line) => items.length ? items.map(line).join("\n") : "_none_";
const text = [
  `:clipboard: *Status of ${process.env.REPO}* since ${process.env.SINCE_LABEL}`,
  `*Merged pull requests (${prs.length})*`,
  list(prs, p => `• <${p.url}|#${p.number} ${esc(p.title)}> by ${p.author.login}`),
  `*Resolved issues (${issues.length})*`,
  list(issues, i => `• <${i.url}|#${i.number} ${esc(i.title)}>` +
    (i.closedByPullRequestsReferences.length ? " fixed by " + i.closedByPullRequestsReferences.map(r => "#" + r.number).join(", ") : "")),
].join("\n");
fs.writeFileSync("/tmp/status-message.txt", text);
console.log(text);'
```

Show the text to the user before posting only if they asked to see it first. Nothing at all
since the start: still post it, with both lists `_none_`, so the silence is on record.

## 4. Post it
```sh
# the channel's ID (a private channel is not addressable by name)
CHANNEL=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  "https://slack.com/api/conversations.list?types=private_channel&limit=1000" \
  | node -e 'const r = JSON.parse(require("fs").readFileSync(0));
    if (!r.ok) { console.error(r.error); process.exit(1) }
    console.log((r.channels.find(c => c.name === "sergius-private-channel") || {}).id || "")')
# the message
CHANNEL=$CHANNEL node -e 'console.log(JSON.stringify({channel: process.env.CHANNEL,
    text: require("fs").readFileSync("/tmp/status-message.txt", "utf8"), unfurl_links: false}))' \
  | curl -s -X POST -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
      -H 'Content-Type: application/json; charset=utf-8' --data @- \
      https://slack.com/api/chat.postMessage \
  | node -e 'const r = JSON.parse(require("fs").readFileSync(0)); console.log(r.ok ? "posted " + r.ts : "error " + r.error)'
```

- `SLACK_BOT_TOKEN` unset, an empty `CHANNEL` (the bot is not in the channel) or an error
  (`not_in_channel`, `missing_scope`, `invalid_auth`, …): stop and tell the user, with the
  message text, so they can post it themselves. Never print the token.
- Post once. If the answer is lost, look at the channel's last messages
  (`conversations.history?channel=$CHANNEL&limit=5`) before posting again.

## 5. Report
To the user, in a few lines: the start (as given and in UTC), the counts, and posted or the error.
