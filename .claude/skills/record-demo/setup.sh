#!/usr/bin/env bash
# One-time setup for record.mjs: ffmpeg, Google Chrome and Playwright, outside the project
# (Playwright is not a project dependency). Idempotent.
set -euo pipefail
DIR="${DEMO_TOOLS:-$HOME/.cache/skill-atlas-demo}"

command -v ffmpeg >/dev/null || { sudo apt-get update -qq; sudo apt-get install -y -qq ffmpeg; }

# Playwright's own browser download may be blocked; Chrome from Google's deb works.
# (apt's chromium-browser is only a snap stub.)
if ! command -v google-chrome >/dev/null; then
  tmp=$(mktemp -d)
  curl -fsSLo "$tmp/chrome.deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y -qq "$tmp/chrome.deb"
  rm -rf "$tmp"
fi

mkdir -p "$DIR"
[ -f "$DIR/package.json" ] || (cd "$DIR" && npm init -y >/dev/null)
[ -d "$DIR/node_modules/playwright" ] || (cd "$DIR" && npm i --silent playwright)

# Playwright's video recording looks for its own ffmpeg build; the system one does.
rev=$(node -p "require('$DIR/node_modules/playwright-core/browsers.json').browsers.find(b => b.name === 'ffmpeg').revision")
d="ffmpeg-$rev"
mkdir -p "$HOME/.cache/ms-playwright/$d"
ln -sf "$(command -v ffmpeg)" "$HOME/.cache/ms-playwright/$d/ffmpeg-linux"
echo "Ready: $DIR"
