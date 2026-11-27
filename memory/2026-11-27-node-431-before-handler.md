# A request over 16 KB never reaches `createWebServer`'s handler: answer it in `clientError`

**Task**: issue #35, a very long link showed `Unexpected end of JSON input` on the page
**Learned**:
- Node rejects a request whose line and headers pass `http.maxHeaderSize` (16 KB) itself: 431, empty body, no handler call. Only `server.on('clientError')` sees it (`error.code === 'HPE_HEADER_OVERFLOW'`).
- Adding a `clientError` listener turns off Node's own answers (400, 408, 413, 431) for every rejected request: the listener in `src/web.ts` writes them again.
- Don't guard it with `socket.bytesWritten > 0`: the page's fetch reuses a keep-alive socket that already served `/`, so nothing was answered. Node's own guard is `socket._httpMessage?._headerSent`.
- In `qa.mjs`, `t.scan()` types the link at 8 ms a character; for a 17000-character link use `t.p.fill('#repo', …)`.
- `t.api()` opens the URL with `page.goto`, which throws `ERR_HTTP_RESPONSE_CODE_FAILURE` on an empty 4xx body.
**Why it matters**: a fix in the request handler alone never runs, and the obvious socket check drops the answer on reused connections.
