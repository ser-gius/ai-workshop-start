# QA test scripts
Manual test scripts for Skill Atlas: each case has its **steps** and what the tester **should see**.
They follow the [spec](../spec/); a change to the spec changes them too.

| Script | Covers |
| --- | --- |
| [cli.md](cli.md) | `./skill-atlas scan` on a local directory and on a GitHub repository ([spec/cli.md](../spec/cli.md), [spec/analysis.md](../spec/analysis.md)) |
| [organization.md](organization.md) | `./skill-atlas scan github.com/<owner>` ([spec/analysis.md § An organization](../spec/analysis.md)) |
| [web.md](web.md) | `./skill-atlas serve`: the page, the filter, the organization card, the API ([spec/web.md](../spec/web.md)) |

## Before you start
1. Node 24 or later; in the checkout: `npm ci`
2. For the GitHub cases, a token: `export GITHUB_TOKEN=$(gh auth token)`
   (the cases that need it say so; the ones *without* a token say `unset GITHUB_TOKEN`)
3. Run every command from the root of the checkout

The offline cases use [fixture/](../fixture/README.md), a small repository with one folder per edge case.
The GitHub cases use repositories at **fixed commits**, so what you should see never changes:

| Repository | Commit |
| --- | --- |
| JetBrains/MPS | `1cbf7f783dbc5c74c8e5231d31f61b02829143de` |
| JetBrains/android | `6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765` |
| JetBrains/koog | `709079e4a34d6c9234583352550e6a2b88a0bb85` |

## How to read a case
- **ID**: `CLI-…`, `ORG-…`, `WEB-…`, quoted in a bug report
- **Steps**: what to do, in order; a command is typed exactly as written
- **Should see**: every point must hold, else the case fails. `exit 1` means `echo $?` right after prints `1`
- A run is recorded as *pass*, *fail* (with what was seen instead), or *blocked* (with why)

## Not in these scripts
A few cases cannot be set up by hand reliably and are covered by `npm test` only, with a fake GitHub:
the browser terminal's `help`, the rate limit (a short wait, a long wait and its `try again in <n> minutes`), more than 1000 `SKILL.md`
in a code search, and GitHub unreachable in the middle of a scan.
