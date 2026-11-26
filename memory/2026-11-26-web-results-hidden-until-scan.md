# The page's skills and filter live in `<main id="results">`, hidden until a scan answers

**Task**: hide "Filter the skills" until a repository is scanned, header on one row (mockup)
**Learned**:
- `npm test` fails every file with `'test failed'` and no detail when `node_modules` is missing: run `npm ci` first.
- `npx playwright install chromium` fails here (`Download failure, code=1`); `.claude/skills/record-demo/setup.sh` installs `/usr/bin/google-chrome`, pass it as `executablePath`.
- The core has no `owner/repo` shorthand (`parseGitHubUrl` wants `github.com/`), and a bare `owner/repo` is also a relative directory: the field's placeholder must not promise it.
- Tests wait on `#status` containing ` · `; keep that text when restyling the header.
**Why it matters**: a layout change that moves `#status` or `#filter` out of the DOM breaks the jsdom tests' waits.
