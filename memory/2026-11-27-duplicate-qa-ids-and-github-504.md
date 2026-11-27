# Duplicate case IDs in qa/*.md make a case vanish; github.com pages can 504 while the API works

**Task**: code review + manual QA of PR #41 (https://github.com/ser-gius/ai-workshop-start/pull/41)
**Learned**:
- `qa/web.md` had two `WEB-30` and two `WEB-32`; in `qa.mjs` / `cases.mjs` the later one silently replaces the earlier, with no warning. Renamed to WEB-33 (keyboard) and WEB-34 (last changed). Check `grep -o '### [A-Z]*-[0-9]*' qa/*.md | sort | uniq -d` when adding a case.
- WEB-33 step 4: End scrolls the last skill into view (bottom of an 800 px window), so measure the scroll just around Space, after scrolling back to the top.
- CLI-07 / WEB-08 fail with HTTP 504 when github.com blob/tree pages are down for the runner while github.com/ and api.github.com answer 200: environment, not the product.
**Why it matters**: a duplicated ID looks like a passing run while one case never ran.
