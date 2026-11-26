---
name: update-memory
description: Add a note to memory/ with what a Skill Atlas task learned, the things the next task would otherwise have to find out again. Use at the end of a task, or when asked to remember, note or save what was learned.
---

# Update memory

One task, one new note in [memory/](../../../memory/). Notes are only added, never edited,
merged or deleted, and nobody reviews them.

## Never review these notes
- Do not read the existing notes to check, correct or tidy them, and do not reread your own
  note after writing it.
- Do not ask the user to review or approve a note.
- A code review ([code-review](../code-review/SKILL.md)) skips `memory/`; addressing a review
  ([address-review](../address-review/SKILL.md)) does not change it.

If a note turns out to be wrong, write a new note that says so; leave the old one as it is.

## 1. Decide what the task learned
Only what is not written down already and would cost the next task time:
- a surprise: behaviour that differs from what the code, the spec or the docs suggest;
- a trap and its way out: a failing command, a flaky test, a tool that needs a flag;
- a decision and its reason, when the reason is not in the spec or a commit message;
- where something lives, when it was hard to find.

Leave out what [spec/](../../../spec/), [AGENTS.md](../../../AGENTS.md), the code or `git log`
already say, a summary of the diff, and anything secret (tokens, credentials). If the task
learned nothing worth keeping, write no note and say so.

## 2. Write the note
A new file `memory/<YYYY-MM-DD>-<short-kebab-slug>.md` (today's date; add `-2` if the name
is taken), in this shape:

```markdown
# <one line: what was learned>

**Task**: <the issue, PR or request, with its number or link when there is one>
**Learned**:
- <one fact per line, concrete: a path, a command, a quoted error>
**Why it matters**: <one line: what goes wrong without it>
```

Short: ten lines or so. Create `memory/` if it does not exist.

## 3. Commit
With the task's other changes when it has a branch, otherwise on its own, message like
`Memory: <the note's title>`. Tell the user the note's path in one line.
