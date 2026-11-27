# jsdom's history.go(-1) with no earlier entry never fires popstate: a Back test must time out, not wait

**Task**: issue #28, Back after a second scan leaves Skill Atlas (PR #42)
**Learned**:
- In jsdom, `history.go(-1)` at the first entry does nothing: a test that awaits `popstate` hangs the whole `node --test` file with no output. `openPage`'s `go()` in `tests/web.test.ts` rejects after 2 s (`the page did not move: no history entry there`)
- `history.length` in jsdom counts `pushState` entries, so "typing adds no entry" can be asserted directly
- A real-Chrome check that needs no network: `record.mjs history` (record-demo) starts on a `data:` page before Skill Atlas; on the old code its first Back fails with `Cannot read properties of null (reading 'textContent')`
- A scan's answer can arrive after a newer scan (Back while scanning): `scan()` numbers each scan and drops a stale answer, and only the latest scan re-enables the button
- Four parallel automation runs used up the token's core limit again, so the local `npm run test:e2e` failed with `GitHub rate limit reached`; CI's own token ran them
**Why it matters**: without the timeout, a history test on broken code looks like a hung test run, not a failure.
