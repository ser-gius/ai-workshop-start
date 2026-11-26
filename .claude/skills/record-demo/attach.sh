#!/usr/bin/env bash
# Shows demo videos and screenshots in a pull request: `attach.sh <pr> <file.mp4|file.png>...`.
#
# GitHub has no API for PR attachments, so the files go to the orphan branch `demo-assets`
# (never the PR branch), under `pr-<n>/`. The PR description then gets a "Demo" section between
# markers, replaced on every run: an inline GIF preview of each MP4 with a link to the MP4 itself,
# and each screenshot inline. Links point at the commit, so a later run does not change them.
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: attach.sh <pr-number> <file.mp4|file.png|file.gif>..." >&2; exit 2; }
pr=$1; shift
for f in "$@"; do
  [ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }
  # Checked before anything is pushed: an unsupported file is never uploaded.
  case "$f" in
    *.mp4|*.png|*.gif|*.jpg|*.jpeg) ;;
    *) echo "not an MP4 or an image: $f" >&2; exit 1 ;;
  esac
done

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
branch=demo-assets
dir="pr-$pr"
root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'git -C "$root" worktree remove --force "$tmp/wt" >/dev/null 2>&1 || true; git -C "$root" branch -qD "$branch-new" 2>/dev/null || true; rm -rf "$tmp"' EXIT

# A worktree of demo-assets, so the current checkout is left alone.
if git -C "$root" fetch -q origin "$branch" 2>/dev/null; then
  git -C "$root" worktree add -q --detach "$tmp/wt" FETCH_HEAD
else
  git -C "$root" worktree add -q --detach "$tmp/wt"
  git -C "$tmp/wt" checkout -q --orphan "$branch-new"
  git -C "$tmp/wt" rm -rfq --ignore-unmatch . >/dev/null
fi
mkdir -p "$tmp/wt/$dir"

md=""
for f in "$@"; do
  name=$(basename "$f")
  cp "$f" "$tmp/wt/$dir/$name"
  case "$name" in
    *.mp4)
      gif="${name%.mp4}.gif"
      # 8 fps, 800 px wide, own palette: small enough to load inline, sharp enough to read.
      ffmpeg -v error -y -i "$f" \
        -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
        "$tmp/wt/$dir/$gif"
      md+="IMG:$dir/$gif:$name"$'\n'"MP4:$dir/$name"$'\n' ;;
    *.png|*.gif|*.jpg|*.jpeg)
      md+="IMG:$dir/$name:$name"$'\n' ;;
  esac
done

git -C "$tmp/wt" add "$dir"
git -C "$tmp/wt" commit -qm "Demo for #$pr" --allow-empty
sha=$(git -C "$tmp/wt" rev-parse HEAD)
git -C "$tmp/wt" push -q origin "HEAD:refs/heads/$branch"

section="<!-- demo:start -->"$'\n'"### Demo"$'\n\n'
while IFS= read -r line; do
  [ -n "$line" ] || continue
  kind=${line%%:*}; rest=${line#*:}
  case "$kind" in
    IMG) path=${rest%%:*}; alt=${rest#*:}
         section+="![$alt](https://github.com/$repo/raw/$sha/$path)"$'\n\n' ;;
    MP4) section+="[Full video: $(basename "$rest")](https://github.com/$repo/blob/$sha/$rest)"$'\n\n' ;;
  esac
done <<< "$md"
section+="<!-- demo:end -->"

body=$(gh pr view "$pr" --json body -q .body)
if [[ "$body" == *"<!-- demo:start -->"*"<!-- demo:end -->"* ]]; then
  before=${body%%<!-- demo:start -->*}; after=${body#*<!-- demo:end -->}
  body="$before$section$after"
else
  body="$body"$'\n\n'"$section"
fi
printf '%s\n' "$body" > "$tmp/body.md"
gh pr edit "$pr" --body-file "$tmp/body.md" >/dev/null
echo "Attached to $(gh pr view "$pr" --json url -q .url) (demo-assets@${sha:0:7})"
