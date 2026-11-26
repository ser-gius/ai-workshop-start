# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally
- The edge cases in the spec are covered, with tests for them
- The CI build is green
- A demo video attached to the PR, when applicable (a change to what the web view shows): see the
  [record-demo](.claude/skills/record-demo/SKILL.md) skill

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests, offline
- `npm run test:e2e`: end-to-end tests on real GitHub repositories at fixed commits; needs `GITHUB_TOKEN`
  (locally: `GITHUB_TOKEN=$(gh auth token) npm run test:e2e`)
