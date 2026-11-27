# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `.agents/skills/reviews`, `.claude/skills/reviews` | duplicates: one skill, a copy per agent |
| `agent/skills/lint-checks` | an unusual folder |
| `plugins/mcp-tools/resources/skills/aspect-generator` | part of the product |
| `.claude/skills/run-tests` | "test" in the name, not in the root: a skill |
| `integration-tests/src/jvmTest/resources/skills/weather-retrieval` | test data: not a skill |
| `notes/SKILL.md` | not in a `skills` folder: not a skill |
| `.claude/skills/commits/examples/SKILL.md` | below a skill: not a skill |

Made by the tests, not committed (git keeps no permissions): `locked`, a copy with a `private/` folder
no one may read (`lockedFixture` in `tests/helpers.ts`).
