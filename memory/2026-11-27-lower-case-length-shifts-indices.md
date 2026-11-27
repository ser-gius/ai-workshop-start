# Indices into `text.toLowerCase()` are not indices into `text`: `İ` lower-cases to 2 code units

**Task**: issue #30 (ser-gius/ai-workshop-start), the filter highlight shifted after `İ`
**Learned**:
- In V8, only `U+0130 İ` changes length under `toLowerCase()` (`'İ'` → `'i̇'`, 1 → 2 code units); found by looping over every code point.
- Final sigma is the one context-dependent mapping (`'ΟΔΟΣ'.toLowerCase()` ends in `ς`, per character in `σ`), but it keeps the length, so lower-casing the whole string and taking each character's lower-case *length* gives a correct index map.
- `highlightRanges` now maps each lower-case code unit back to its source character; `filterSnippet` relies on it. Anything else that searches a lower-cased copy needs the same.
- A local directory in a page test: `mkdtempSync` + `writeFileSync`, passed as `?repo=`; the test server's `open` reads it, no fixture change (which would shift every `7 skills` count).
**Why it matters**: `matchesFilter` still says "match" while the highlight and the snippet point at the wrong letters, so only a highlight test catches it.
