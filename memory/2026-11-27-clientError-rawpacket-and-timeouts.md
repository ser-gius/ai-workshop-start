# In `clientError`, `error.rawPacket` holds the rejected request's line; Node's timeouts can be shortened after `createServer`

**Task**: review of PR #38 (a very long link), the reload of a too long `/?repo=` link
**Learned**:
- On `HPE_HEADER_OVERFLOW`, `error.rawPacket` is the chunk Node rejected: for a browser's or curl's request it starts with `GET /?repo=…` or `GET /api/scan?…`, so the page and the API can be told apart. Only the current chunk: if the headers came in several, the line may be missing (then answer JSON).
- A 408 test without waiting 30 s: `Object.assign(server, { headersTimeout: 300, requestTimeout: 600, connectionsCheckingInterval: 50 })` before `listen` works; `connectionsCheckingInterval` is not in `Server`'s types, so plain assignment fails `tsc`.
- A 413 test: a chunked `GET /api/scan?repo=<fixture>` (its handler awaits, so nothing is sent yet) with `1;<20000 a>\r\n` gives `HPE_CHUNK_EXTENSIONS_OVERFLOW`. With a handler that answers synchronously (`/`, a 405) the headers are already sent and the socket is just destroyed.
- `qa.mjs` needs the Playwright install in `~/.cache/skill-atlas-demo`; without it it dies on `MODULE_NOT_FOUND`.
- CI's e2e job shares a rate-limited token: `GitHub rate limit reached (the core limit)` there is not the change.
**Why it matters**: the obvious 408/413 tests either hang for 30 s or never reach the code under test.
