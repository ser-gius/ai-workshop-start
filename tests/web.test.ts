// spec/web.md: the local web view, over ./fixture and the GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createBrowserBackend } from '../src/browser.ts';
import { userRepositories, type Fetch } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { matchesFilter, serve, type RepositoriesAnswer, type ScanAnswer, type WebOptions } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, open, USER_REPOSITORIES, userReposUrl } from './helpers.ts';

// The token goes to GitHub with every /user/repos request.
const authorized: Fetch = (requested, init) => {
  assert.equal(init?.headers?.Authorization, 'Bearer test');
  return replay(USER_REPOSITORIES)(requested, init);
};
const { server, url } = await serve({ open, repositories: () => userRepositories({ fetch: authorized, token: 'test' }), port: 0 });
test.after(() => server.close());

/** GET /api/repositories from a server of its own with these suggestions. */
async function suggestions(repositories: WebOptions['repositories']): Promise<{ status: number; body: RepositoriesAnswer }> {
  const other = await serve({ open, repositories, port: 0 });
  try {
    const response = await fetch(`${other.url}api/repositories`);
    return { status: response.status, body: (await response.json()) as RepositoriesAnswer };
  } finally {
    other.server.close();
  }
}

const scan = async (repo: string) => {
  const response = await fetch(`${url}api/scan?repo=${encodeURIComponent(repo)}`);
  return { status: response.status, body: (await response.json()) as ScanAnswer & { error?: string } };
};

test('the page has a field for a repository link, a skill list and a SKILL.md view', async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  const page = await response.text();
  assert.match(page, /<input id="repo"[^>]*aria-label="Repository link"/);
  assert.match(page, /<ul id="skills"/);
  assert.match(page, /el\('pre', 'skill-md', skill\.text\)/);
  assert.match(page, /URLSearchParams\(location\.search\)\.get\('repo'\)/);
  assert.match(page, /<input id="repo"[^>]*list="repositories"/);
  assert.match(page, /<datalist id="repositories">/);
  assert.match(page, /fetch\('\/api\/repositories'\)/, 'the suggestions load on start');
  assert.match(page, /option\.value = repository\.url/, 'picking one fills in its URL');
  assert.doesNotMatch(page, /innerHTML/, 'a SKILL.md is shown as text, never as HTML');
});

test('descriptions are trimmed to their first sentence and foldable to the whole', async () => {
  const { body } = await scan(FIXTURE);
  const summaries = Object.fromEntries(body.skills.map((skill) => [skill.name, [skill.summary, skill.description]]));
  assert.deepEqual(summaries['run-tests'], ["Run the project's tests.", "Run the project's tests. Use before every push."]);
  assert.deepEqual(summaries['release-checklist'], ['', ''], 'malformed front matter: no description');
  for (const skill of body.skills) assert.doesNotMatch(skill.description, /\n/);

  const page = await (await fetch(url)).text();
  assert.match(page, /el\('details', 'description'\)/, 'a fold when there is more');
  assert.match(page, /el\('span', 'clamp', skill\.summary\)/, 'folded: the first sentence');
  assert.match(page, /el\('div', 'whole', text\)/, 'unfolded: the whole description');
  assert.match(page, /#skills \.description \.clamp \{[^}]*-webkit-line-clamp: 2/, 'every description, folded or not: two lines');
  assert.match(page, /scrollHeight > short\.clientHeight/, 'a sentence cut at two lines folds too');
  assert.match(page, /summary::before \{ content: '▸'; \}/, 'a marker shows that it unfolds');
  assert.match(page, /\.whole::before \{ content: '▾ '; \}/, 'and that it folds');
  assert.match(page, /event\.stopPropagation\(\)/, 'folding does not select the skill');
});

/** The fixture's skills that the filter keeps, by name. */
async function filtered(filter: string): Promise<string[]> {
  const { body } = await scan(FIXTURE);
  return body.skills.filter((skill) => matchesFilter(skill, filter)).map((skill) => skill.name);
}

test('the filter: every word, in any order, in the name or the description', async () => {
  assert.deepEqual(await filtered('use before'), ['code-style', 'reviews', 'run-tests']);
  assert.deepEqual(await filtered('before use'), ['code-style', 'reviews', 'run-tests'], 'in any order');
  assert.deepEqual(await filtered('this repository'), ['commits', 'lint-checks', 'reviews']);
  assert.deepEqual(await filtered('checklist'), ['release-checklist'], 'in the name only');
  assert.deepEqual(await filtered('kotlin'), ['code-style'], 'in the description only');
  assert.deepEqual(await filtered('generator plugin'), ['aspect-generator'], 'one in the name, another in the description');
  assert.deepEqual(await filtered('generator merging'), [], 'every word must match');
});

test('the filter: part of a word, case-insensitive', async () => {
  assert.deepEqual(await filtered('chec'), ['lint-checks', 'release-checklist'], 'as you type');
  assert.deepEqual(await filtered('REVIEW'), ['reviews']);
  assert.deepEqual(await filtered('Use Before'), ['code-style', 'reviews', 'run-tests']);
});

test('the filter: empty or only spaces → every skill; no match → none', async () => {
  const every = ['aspect-generator', 'code-style', 'commits', 'lint-checks', 'release-checklist', 'reviews', 'run-tests'];
  assert.deepEqual(await filtered(''), every);
  assert.deepEqual(await filtered('   '), every);
  assert.deepEqual(await filtered('  use   before  '), ['code-style', 'reviews', 'run-tests'], 'extra spaces');
  assert.deepEqual(await filtered('no-such-word'), []);
});

/** The served page, its own script running in a DOM, at `?<query>`, asking this server; closed after the test. */
async function openPage(t: { after(fn: () => void): void }, query: string) {
  const html = await (await fetch(url)).text();
  const scans: string[] = [];
  const dom = new JSDOM(html, {
    url: `${url}?${query}`,
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as unknown as { fetch: typeof fetch }).fetch = (path) => {
        const asked = new URL(String(path), url);
        if (asked.pathname === '/api/scan') scans.push(asked.searchParams.get('repo') ?? '');
        return fetch(asked);
      };
    },
  });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  const $ = (id: string) => document.getElementById(id) as HTMLElement & { value: string; disabled: boolean };
  const page = {
    scans,
    status: () => $('status').textContent,
    /** The skills in the list, by name. */
    shown: () => [...document.querySelectorAll('#skills li:not([hidden]) .name')].map((name) => name.textContent),
    /** The selected skill in the list, and the one in the SKILL.md view; null when none. */
    selected: () => {
      const inList = document.querySelectorAll('#skills li[aria-selected="true"] .name');
      assert.ok(inList.length <= 1, 'at most one selected skill');
      const view = document.querySelector('#skill h2')?.textContent ?? null;
      assert.equal(inList[0]?.textContent ?? null, view, 'the list and the view agree');
      return view;
    },
    noMatch: () => $('no-match').textContent,
    filter: () => $('filter').value,
    /** ?filter= in the link of this view; null when it is not there. */
    linked: () => new URL(dom.window.location.href).searchParams.get('filter'),
    linkedRepo: () => new URL(dom.window.location.href).searchParams.get('repo'),
    type(text: string) {
      $('filter').value = text;
      $('filter').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    },
    select(name: string) {
      const item = [...document.querySelectorAll('#skills li')].find((li) => li.querySelector('.name')?.textContent === name);
      assert.ok(item, name);
      (item as HTMLElement).click();
    },
    /** Waits until the scan the page started is answered and rendered. */
    async scanned() {
      for (let i = 0; i < 200 && ($('scan').disabled || !/ · /.test(page.status() ?? '')); i++) await new Promise((r) => setTimeout(r, 10));
      assert.ok(!$('scan').disabled, 'the scan finished');
    },
    async scanAgain() {
      $('scan').click();
      assert.equal($('scan').disabled, true, 'a new scan started');
      await page.scanned();
    },
  };
  await page.scanned();
  return page;
}

const fixtureQuery = (filter?: string) => new URLSearchParams(filter === undefined ? { repo: FIXTURE } : { repo: FIXTURE, filter }).toString();

test('the page has a filter field, and runs the tested filter', async () => {
  const page = await (await fetch(url)).text();
  assert.match(page, /<input id="filter"[^>]*aria-label="Filter skills"/, 'a filter field');
  assert.ok(page.includes(String(matchesFilter)), 'the page runs the tested filter');
});

test('the page without a filter: every skill, the count of all, the first selected', async (t) => {
  const page = await openPage(t, fixtureQuery());
  assert.equal(page.status(), 'fixture · 7 skills');
  assert.deepEqual(page.shown(), ['aspect-generator', 'code-style', 'commits', 'lint-checks', 'release-checklist', 'reviews', 'run-tests']);
  assert.equal(page.selected(), 'aspect-generator');
  assert.equal(page.filter(), '');
  assert.equal(page.noMatch(), '');
});

test('?filter= on load: the filtered view, its count of the matches, the first match selected', async (t) => {
  const page = await openPage(t, fixtureQuery('use before'));
  assert.equal(page.filter(), 'use before');
  assert.equal(page.status(), 'fixture · 3 of 7 skills');
  assert.deepEqual(page.shown(), ['code-style', 'reviews', 'run-tests']);
  assert.equal(page.selected(), 'code-style');
  assert.equal(page.linked(), 'use before');
});

test('the page filters as you type, with no new scan, and the link follows', async (t) => {
  const page = await openPage(t, fixtureQuery());
  assert.equal(page.scans.length, 1);
  page.type('chec');
  assert.deepEqual(page.shown(), ['lint-checks', 'release-checklist']);
  assert.equal(page.status(), 'fixture · 2 of 7 skills');
  assert.equal(page.linked(), 'chec', 'typing updates the link');
  assert.equal(page.linkedRepo(), FIXTURE, 'beside ?repo=');
  page.type('  generator   plugin ');
  assert.deepEqual(page.shown(), ['aspect-generator'], 'one word in the name, another in the description');
  assert.equal(page.status(), 'fixture · 1 of 7 skills');
  assert.equal(page.linked(), 'generator   plugin', 'the link has the words, without the spaces around them');
  assert.equal(page.scans.length, 1, 'no new scan');
});

test('the selected skill stays while it matches; else the first match is selected', async (t) => {
  const page = await openPage(t, fixtureQuery('use before'));
  page.select('reviews');
  assert.equal(page.selected(), 'reviews');
  page.type('use');
  assert.equal(page.selected(), 'reviews', 'it still matches: it stays');
  page.type('kotlin');
  assert.deepEqual(page.shown(), ['code-style']);
  assert.equal(page.selected(), 'code-style', 'it no longer matches: the first match');
});

test('no match: a message with the filter, no selected skill; empty or only spaces → every skill, no ?filter=', async (t) => {
  const page = await openPage(t, fixtureQuery('use before'));
  page.type('zzz');
  assert.deepEqual(page.shown(), []);
  assert.equal(page.status(), 'fixture · 0 of 7 skills');
  assert.equal(page.noMatch(), 'No skills match "zzz"');
  assert.equal(page.selected(), null);
  assert.equal(page.linked(), 'zzz');

  page.type('   ');
  assert.equal(page.status(), 'fixture · 7 skills');
  assert.equal(page.shown().length, 7);
  assert.equal(page.noMatch(), '');
  assert.equal(page.selected(), 'aspect-generator', 'a match again: the first one');
  assert.equal(page.linked(), null, 'an empty filter drops the parameter');
  assert.equal(page.linkedRepo(), FIXTURE);
});

test('a new scan keeps the filter', async (t) => {
  const page = await openPage(t, fixtureQuery());
  page.type('CHEC');
  await page.scanAgain();
  assert.equal(page.scans.length, 2);
  assert.equal(page.filter(), 'CHEC');
  assert.equal(page.status(), 'fixture · 2 of 7 skills');
  assert.deepEqual(page.shown(), ['lint-checks', 'release-checklist']);
  assert.equal(page.selected(), 'lint-checks');
  assert.equal(page.linked(), 'CHEC');
});

test('a GitHub repository: its skills, each with its pinned link and its SKILL.md', async () => {
  const { status, body } = await scan('https://github.com/JetBrains/example');
  assert.equal(status, 200);
  assert.deepEqual(body.repository, { id: 'JetBrains/example', url: 'https://github.com/JetBrains/example', commit: EXAMPLE_COMMIT });
  assert.deepEqual(body.skills, [
    {
      id: 'JetBrains/example:.claude/skills/commits/SKILL.md',
      name: 'commits',
      description: 'Write commit messages the way this repository does. Use for every commit.',
      summary: 'Write commit messages the way this repository does.',
      path: '.claude/skills/commits/SKILL.md',
      link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      copies: [],
      text: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
    },
  ]);
  assert.deepEqual(body.warnings, []);
});

test('a local directory: every skill sorted by name, its SKILL.md as it is, and warnings', async () => {
  const { status, body } = await scan(FIXTURE);
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'fixture');
  assert.deepEqual(
    body.skills.map((skill) => skill.name),
    ['aspect-generator', 'code-style', 'commits', 'lint-checks', 'release-checklist', 'reviews', 'run-tests'],
  );
  assert.deepEqual(body.skills.find((skill) => skill.name === 'reviews')?.copies, ['.claude/skills/reviews/SKILL.md']);
  for (const skill of body.skills) {
    assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'));
    assert.equal(skill.link, `${pathToFileURL(FIXTURE).href}/${skill.path}`);
  }
  assert.equal(body.warnings.length, 1);
  assert.match(body.warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('no link, or an unreachable repository → 400 with a clear message', async () => {
  assert.deepEqual(await scan(''), { status: 400, body: { error: 'Enter a repository link' } });
  const missing = await scan(join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.match(missing.body.error ?? '', /^Not a GitHub URL or a readable directory: .*no-such-directory$/);
  const offline = await scan('https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 400);
  assert.match(offline.body.error ?? '', /^Cannot reach GitHub: not recorded: /);
});

test("suggestions: the token's user's repositories, most recently pushed first, page after page", async () => {
  const response = await fetch(`${url}api/repositories`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as RepositoriesAnswer;
  assert.equal(body.repositories.length, 101);
  assert.deepEqual(body.repositories[0], {
    full_name: 'JetBrains/example',
    url: 'https://github.com/JetBrains/example',
    description: 'A small repository with one skill',
  });
  assert.deepEqual(body.repositories[1], { full_name: 'octocat/repo-1', url: 'https://github.com/octocat/repo-1', description: '' });
  assert.deepEqual(body.repositories[100], { full_name: 'octocat/last', url: 'https://github.com/octocat/last', description: 'The 101st' });
  assert.equal(body.hint, undefined);
  assert.equal(body.error, undefined);
});

test('suggestions: at most 3 pages of 100', async () => {
  const full = (page: number) => Array.from({ length: 100 }, (_, i) => ({ full_name: `octocat/p${page}-${i}`, description: null }));
  const recording = Object.fromEntries([1, 2, 3].map((page) => [userReposUrl(page), { status: 200, body: full(page) }]));
  // A 4th page is not recorded: asking for it would fail.
  const { body } = await suggestions(() => userRepositories({ fetch: replay(recording), token: 'test' }));
  assert.equal(body.error, undefined);
  assert.equal(body.repositories.length, 300);
});

test('suggestions without GITHUB_TOKEN: none, and a hint', async () => {
  const offline: Fetch = () => Promise.reject(new Error('GitHub is not asked without a token'));
  assert.deepEqual(await suggestions(() => userRepositories({ fetch: offline })), {
    status: 200,
    body: { repositories: [], hint: 'Set GITHUB_TOKEN to see your repositories' },
  });
});

test('suggestions: a GitHub failure → its clear message, still 200', async () => {
  const answering = (status: number, body: unknown) => () =>
    userRepositories({ fetch: replay({ [userReposUrl(1)]: { status, body } }), token: 'test' });
  assert.deepEqual(await suggestions(answering(401, { message: 'Bad credentials' })), {
    status: 200,
    body: { repositories: [], error: 'GitHub rejected the token in GITHUB_TOKEN' },
  });
  assert.deepEqual(await suggestions(answering(403, { message: 'API rate limit exceeded for user' })), {
    status: 200,
    body: { repositories: [], error: 'GitHub rate limit reached; try again in a minute' },
  });
  const unreachable = await suggestions(() => userRepositories({ fetch: replay({}), token: 'test' }));
  assert.equal(unreachable.status, 200);
  assert.deepEqual(unreachable.body.repositories, []);
  assert.match(unreachable.body.error ?? '', /^Cannot reach GitHub: not recorded: /);
});

test('anything else → 404; only GET', async () => {
  assert.equal((await fetch(`${url}nope`)).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
});

/** Starts `./skill-atlas serve <args>`; resolves with the first line it prints. */
async function startServe(t: { after(fn: () => void): void }, args: string[], env = process.env): Promise<string> {
  const child = spawn(process.execPath, [CLI, 'serve', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env });
  t.after(() => child.kill());
  return new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve(out);
    });
    child.once('exit', (code) => reject(new Error(`exited with ${code}`)));
  });
}

test('./skill-atlas serve prints its local URL and answers there', async (t) => {
  const printed = await startServe(t, ['--port', '0']);
  const match = /^Skill Atlas at (http:\/\/127\.0\.0\.1:\d+\/)\n$/.exec(printed);
  assert.ok(match, printed);
  const answer = (await (await fetch(`${match[1]}api/scan?repo=${encodeURIComponent(FIXTURE)}`)).json()) as ScanAnswer;
  assert.equal(answer.skills.length, 7);
});

test('./skill-atlas serve without GITHUB_TOKEN suggests nothing and hints at it', async (t) => {
  const { GITHUB_TOKEN: _, ...env } = process.env;
  const printed = await startServe(t, ['--port', '0'], env);
  const local = /^Skill Atlas at (\S+)\n$/.exec(printed)?.[1];
  assert.ok(local, printed);
  assert.deepEqual(await (await fetch(`${local}api/repositories`)).json(), {
    repositories: [],
    hint: 'Set GITHUB_TOKEN to see your repositories',
  });
});

test('./skill-atlas serve listens on port 4173 by default', async (t) => {
  assert.equal(await startServe(t, []), 'Skill Atlas at http://127.0.0.1:4173/\n');
});

test('a foreign Host → 403: no DNS rebinding; localhost is this machine', async () => {
  const { port } = new URL(url);
  const status = (host: string, path = `/api/scan?repo=${encodeURIComponent(FIXTURE)}`) =>
    new Promise<number>((resolve, reject) => {
      request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      })
        .on('error', reject)
        .end();
    });
  assert.equal(await status(`attacker.example:${port}`), 403);
  assert.equal(await status('127.0.0.1'), 403, 'without the port');
  assert.equal(await status(`localhost:${port}`), 200);
  assert.equal(await status(`127.0.0.1:${port}`), 200);
  assert.equal(await status(`attacker.example:${port}`, '/api/repositories'), 403, 'the suggestions too');
  assert.equal(await status(`localhost:${port}`, '/api/repositories'), 200);
});

test('serve is only in the Node CLI: its help lists it, the browser terminal does not', async () => {
  const help = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.match(help.stdout, /^  serve \[--port <number>\] +a local web view/m);
  const browser = createBrowserBackend({ fetch: () => Promise.reject(new Error('offline')) });
  assert.doesNotMatch(await browser.run('skill-atlas help'), /serve/);
  assert.doesNotMatch(await browser.run('skill-atlas serve'), /^  serve/m);
});

test('./skill-atlas serve with a wrong argument → usage, exit code 1', () => {
  const wrong = spawnSync(process.execPath, [CLI, 'serve', '--port', 'x'], { encoding: 'utf8' });
  assert.equal(wrong.status, 1);
  assert.equal(wrong.stderr, 'Usage: skill-atlas serve [--port <number>]\n');
});
