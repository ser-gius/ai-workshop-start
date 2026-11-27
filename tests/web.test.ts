// spec/web.md: the local web view, over ./fixture and the GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { createBrowserBackend } from '../src/browser.ts';
import { userRepositories, type Fetch } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { filterCount, filterSnippet, highlightRanges, matchesFilter, serve, type OrganizationAnswer, type RepositoriesAnswer, type ScanAnswer, type WebOptions } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, EXAMPLE_UPDATED, FIXTURE, open, USER_REPOSITORIES, userReposUrl } from './helpers.ts';

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
    document,
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
    /** The SKILL.md view's hint while no skill is selected; null when one is. */
    placeholder: () => document.querySelector('#skill .placeholder')?.textContent ?? null,
    /** The pill in the filter field. */
    count: () => $('count').textContent,
    /** Each shown skill's name and its snippet, or its folded description, the highlights in [brackets]. */
    rows: () =>
      [...document.querySelectorAll('#skills li:not([hidden])')].map((li) => {
        const text = (node: Element | null) =>
          node ? [...node.childNodes].map((child) => (child.nodeName === 'MARK' ? `[${child.textContent}]` : child.textContent)).join('') : '';
        const visible = [...li.querySelectorAll('.description, .snippet')].filter((node) => !(node as HTMLElement).hidden);
        assert.ok(visible.length <= 1, 'the description or the snippet, not both');
        return [text(li.querySelector('.name')), visible[0]?.matches('.snippet') ? text(visible[0]) : text(visible[0]?.querySelector('.clamp') ?? null)];
      }),
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
  for (const tested of [matchesFilter, highlightRanges, filterSnippet, filterCount]) {
    assert.ok(page.includes(String(tested)), `the page runs the tested ${tested.name}`);
  }
});

/** The text with the ranges in [brackets]. */
const bracketed = (text: string, filter: string) => {
  let out = '';
  let at = 0;
  for (const [start, end] of highlightRanges(text, filter)) {
    out += text.slice(at, start) + '[' + text.slice(start, end) + ']';
    at = end;
  }
  return out + text.slice(at);
};

test('the highlight: every occurrence of every word, case-insensitive', () => {
  assert.equal(bracketed('WhenConcreteStatement: tests, JUnit Test', 'test'), 'WhenConcre[teSt]atement: [test]s, JUnit [Test]');
  assert.equal(bracketed('mps-tests', 'TEST'), 'mps-[test]s');
  assert.equal(bracketed('use before every push', 'before use'), '[use] [before] every push', 'every word, in any order');
  assert.equal(bracketed('checklist', 'check list'), '[checklist]', 'touching matches: one highlight');
  assert.equal(bracketed('checklist', 'checkl eckli'), '[checkli]st', 'overlapping matches: one highlight');
  assert.equal(bracketed('aaa', 'aa'), '[aaa]', 'overlapping occurrences of one word');
  assert.deepEqual(highlightRanges('anything', '   '), [], 'no words: nothing');
  assert.deepEqual(highlightRanges('anything', 'zzz'), []);
});

test('the snippet: around the first match, from the start of a word, cut with …', () => {
  const long =
    'Generates the typesystem aspect of a language: inference rules, checking rules and the WhenConcreteStatement block, then runs the generated tests against every module of the project.';
  // The first match, teSt, is 24 characters after the start of 'rules'; 'checking' starts 33 before it.
  assert.equal(
    filterSnippet(long, 'test'),
    '…rules and the WhenConcreteStatement block, then runs the generated tests against every module of the project…',
  );
  assert.equal(filterSnippet(long, 'zzz'), null, 'no word in the description');
  assert.equal(filterSnippet(long, ''), null, 'no words');
  assert.equal(filterSnippet("Run the project's tests.", 'TESTS'), "Run the project's tests.", 'short: whole, no …');
  assert.equal(filterSnippet(long, 'generates'), 'Generates the typesystem aspect of a language: inference rules, checking rules and the Wh…', 'at the start: no … before');
  assert.equal(filterSnippet(long, 'project'), '…against every module of the project.', 'at the end: no … after');
  assert.equal(filterSnippet('x'.repeat(40) + 'match', 'match'), '…match', 'no word start within reach: the match itself');
});

test('the count in the filter field: the matches while it has words, else every skill', () => {
  assert.equal(filterCount(3, 7, 'use before'), '3 of 7');
  assert.equal(filterCount(0, 7, 'zzz'), '0 of 7');
  assert.equal(filterCount(7, 7, 'e'), '7 of 7', 'every skill matches: still the matches');
  assert.equal(filterCount(7, 7, ''), '7 skills');
  assert.equal(filterCount(7, 7, '   '), '7 skills');
  assert.equal(filterCount(1, 1, ''), '1 skill');
});

test('the page without a filter: every skill, the count of all, the first selected', async (t) => {
  const page = await openPage(t, fixtureQuery());
  assert.equal(page.status(), 'fixture · 7 skills');
  assert.equal(page.count(), '7 skills');
  assert.equal(page.rows().flat().join('').split('[').length - 1, 0, 'nothing highlighted');
  assert.deepEqual(page.shown(), ['aspect-generator', 'code-style', 'commits', 'lint-checks', 'release-checklist', 'reviews', 'run-tests']);
  assert.equal(page.selected(), 'aspect-generator');
  assert.equal(page.filter(), '');
  assert.equal(page.noMatch(), '');
});

test('?filter= on load: the filtered view, its count of the matches, the first match selected', async (t) => {
  const page = await openPage(t, fixtureQuery('use before'));
  assert.equal(page.filter(), 'use before');
  assert.equal(page.status(), 'fixture · 3 of 7 skills');
  assert.equal(page.count(), '3 of 7');
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
  assert.equal(page.count(), '0 of 7');
  assert.equal(page.noMatch(), 'No skills match "zzz"');
  assert.equal(page.selected(), null);
  assert.equal(page.linked(), 'zzz');

  page.type('   ');
  assert.equal(page.status(), 'fixture · 7 skills');
  assert.equal(page.count(), '7 skills');
  assert.equal(page.shown().length, 7);
  assert.equal(page.noMatch(), '');
  assert.equal(page.selected(), 'aspect-generator', 'a match again: the first one');
  assert.equal(page.linked(), null, 'an empty filter drops the parameter');
  assert.equal(page.linkedRepo(), FIXTURE);
});

test('the page highlights the matches in the name and the snippet, case-insensitive', async (t) => {
  const page = await openPage(t, fixtureQuery('CHEC'));
  assert.deepEqual(page.rows(), [
    ['lint-[chec]ks', 'Write a lint [chec]k for this repository. Use when adding an inspection.'],
    ['release-[chec]klist', ''],
  ]);
  page.type('use');
  assert.deepEqual(page.rows(), [
    ['aspect-generator', '…a language aspect. Shipped to [use]rs with the plugin.'],
    ['code-style', "…the project's code style. [Use] before committing Kotlin or Java changes."],
    ['commits', '…the way this repository does. [Use] for every commit.'],
    ['lint-checks', '…check for this repository. [Use] when adding an inspection.'],
    ['reviews', '…the way this repository does. [Use] before merging.'],
    ['run-tests', "Run the project's tests. [Use] before every push."],
  ], 'a snippet around the first match, cut with … before it');
  page.type('generator');
  assert.deepEqual(page.rows(), [['aspect-[generator]', 'Generate a language aspect.']], 'in the name only: the description as without a filter');
  page.type('re view');
  assert.deepEqual(page.rows().find(([name]) => name.includes('view')), ['[review]s', '[Review] a change the way this [re]pository does. Use befo[re] merging.'], 'every word; touching: one highlight');
  page.type('');
  assert.deepEqual(page.rows().find(([name]) => name === 'lint-checks'), ['lint-checks', 'Write a lint check for this repository.'], 'no filter: the description again, nothing highlighted');
});

test('a new scan keeps the filter', async (t) => {
  const page = await openPage(t, fixtureQuery());
  page.type('CHEC');
  await page.scanAgain();
  assert.equal(page.scans.length, 2);
  assert.equal(page.filter(), 'CHEC');
  assert.equal(page.status(), 'fixture · 2 of 7 skills');
  assert.equal(page.count(), '2 of 7');
  assert.deepEqual(page.shown(), ['lint-checks', 'release-checklist']);
  assert.deepEqual(page.rows()[1], ['release-[chec]klist', ''], 'highlighted after the new scan');
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
      updated: EXAMPLE_UPDATED,
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

test('an organization: its repositories with skills, grouped, each skill with its link and SKILL.md, and warnings', async () => {
  const response = await fetch(`${url}api/scan?repo=${encodeURIComponent('https://github.com/octo-org')}`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as OrganizationAnswer;
  assert.deepEqual(body.organization, { id: 'octo-org', url: 'https://github.com/octo-org', repositories: 101 });
  assert.deepEqual(
    body.repositories.map(({ repository, skills }) => [repository.id, skills.map((skill) => skill.name)]),
    [
      ['octo-org/agents', ['commits', 'reviews']],
      ['octo-org/Docs', ['style']],
      ['octo-org/tools', ['lint']],
    ],
  );
  const [agents] = body.repositories;
  assert.deepEqual(agents.repository, { id: 'octo-org/agents', url: 'https://github.com/octo-org/agents', commit: EXAMPLE_COMMIT });
  assert.deepEqual(agents.skills[0], {
    id: 'octo-org/agents:.claude/skills/commits/SKILL.md',
    name: 'commits',
    description: 'Write commit messages the way this organization does. Use for every commit.',
    summary: 'Write commit messages the way this organization does.',
    path: '.claude/skills/commits/SKILL.md',
    link: `https://github.com/octo-org/agents/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    copies: [],
    text: '---\nname: commits\ndescription: Write commit messages the way this organization does. Use for every commit.\n---\n',
    updated: '2026-10-01T12:00:00Z',
  });
  assert.deepEqual(agents.skills[1].copies, ['.claude/skills/reviews/SKILL.md']);
  assert.equal(agents.skills[1].updated, '2026-09-15T23:30:00Z', 'its copy changed last');
  assert.equal(body.warnings.length, 2);
  assert.match(body.warnings[0], /^octo-org\/broken: Commit not found: /);
  assert.match(body.warnings[1], /^octo-org\/Docs: \.github\/skills\/style\/SKILL\.md: malformed front matter: /);

  const page = await (await fetch(url)).text();
  assert.match(page, /if \(answer\.organization\)/, 'the page tells an organization from a repository');
  assert.match(page, /' of ' \+ count\(total, 'repository', 'repositories'\)/, 'its skill count, in <n> of <m> repositories');
  assert.match(page, /el\('li', 'group'\)/, 'a heading per repository');
  assert.match(page, /el\('a', '', group\.repository\.id \+ ' · ' \+ count\(group\.skills\.length, 'skill'\)\)/, 'owner/name · N skills');
  assert.match(page, /link\.href = group\.repository\.url/, 'linked to the repository');
  assert.match(page, /list\(group\.skills, heading\)/, 'its skills under it');
});

/**
 * The page in jsdom, at `?repo=<repo>`: it scans at once. Its requests go to the test server, or to
 * `answer` for /api/scan when given; `release` lets a held answer through.
 */
function pageAt(t: TestContext, repo: string, answer?: () => Promise<Response>, layout?: (window: JSDOM['window']) => void) {
  return (async () => {
    const html = await (await fetch(url)).text();
    const dom = new JSDOM(html, {
      url: `${url}?repo=${encodeURIComponent(repo)}`,
      runScripts: 'dangerously',
      beforeParse(window) {
        (window as unknown as { fetch: typeof fetch }).fetch = (path) => {
          const asked = new URL(String(path), url);
          return asked.pathname === '/api/scan' && answer ? answer() : fetch(asked);
        };
        layout?.(window);
      },
    });
    t.after(() => dom.window.close());
    const { document } = dom.window;
    const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
    return {
      document,
      card: () => {
        const card = document.getElementById('organization')!;
        const progress = document.getElementById('org-progress')!;
        return {
          hidden: card.hidden,
          title: text('#organization h2'),
          name: text('#org-name'),
          count: text('#org-count'),
          progress: { running: progress.classList.contains('running'), value: progress.getAttribute('aria-valuenow') },
          label: text('#org-label'),
          top: [...document.querySelectorAll('#org-top li')].map((item) => [
            item.querySelector('a')!.textContent,
            item.querySelector('a')!.getAttribute('href'),
            item.querySelector('.skills')!.textContent,
          ]),
          more: text('#org-more'),
        };
      },
      /** Until the scan has answered: the field's button is enabled again. */
      scanned: async () => {
        const button = document.getElementById('scan') as HTMLButtonElement;
        for (let i = 0; i < 200 && (button.disabled || /^Scanning /.test(text('#status') ?? '')); i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
    };
  })();
}

/** An organization's answer with these repositories, by name and skill count. */
function organizationAnswer(owner: string, total: number, repositories: [string, number][]): OrganizationAnswer {
  return {
    organization: { id: owner, url: `https://github.com/${owner}`, repositories: total },
    repositories: repositories.map(([name, skills]) => ({
      repository: { id: `${owner}/${name}`, url: `https://github.com/${owner}/${name}`, commit: EXAMPLE_COMMIT },
      skills: Array.from({ length: skills }, (_, i) => ({
        id: `${owner}/${name}:skills/s${i}/SKILL.md`,
        name: `s${i}`,
        description: '',
        summary: '',
        path: `skills/s${i}/SKILL.md`,
        link: `https://github.com/${owner}/${name}/blob/${EXAMPLE_COMMIT}/skills/s${i}/SKILL.md`,
        copies: [],
        text: '',
        updated: null,
      })),
    })),
    warnings: [],
  };
}

test("each skill's day: next to it in the list, `updated <day>` in the selected skill; none when unknown", async (t) => {
  const skill = (name: string, updated: string | null) => ({
    id: `octo/dates:.claude/skills/${name}/SKILL.md`,
    name,
    description: `Does ${name}.`,
    summary: `Does ${name}.`,
    path: `.claude/skills/${name}/SKILL.md`,
    link: `https://github.com/octo/dates/blob/${EXAMPLE_COMMIT}/.claude/skills/${name}/SKILL.md`,
    copies: [],
    text: '',
    updated,
  });
  const answer: ScanAnswer = {
    repository: { id: 'octo/dates', url: 'https://github.com/octo/dates', commit: EXAMPLE_COMMIT },
    skills: [skill('dated', '2026-09-15T23:30:00Z'), skill('undated', null)],
    warnings: [],
  };
  const page = await pageAt(t, 'https://github.com/octo/dates', async () => Response.json(answer));
  await page.scanned();
  const { document } = page;
  const rows = [...document.querySelectorAll('#skills li[role="option"]')].map((li) => {
    const time = li.querySelector('.updated time') as HTMLTimeElement | null;
    return [li.querySelector('.name')!.textContent, time && [time.textContent, time.dateTime, time.title]];
  });
  assert.deepEqual(rows, [
    ['dated', ['2026-09-15', '2026-09-15T23:30:00Z', 'Last updated 2026-09-15 23:30:00 UTC']],
    ['undated', null],
  ]);
  // The first one is selected: its day under its link.
  assert.equal(document.querySelector('#skill .updated')!.textContent, 'updated 2026-09-15');
  (document.querySelectorAll('#skills li[role="option"]')[1] as HTMLElement).click();
  assert.equal(document.querySelector('#skill h2')!.textContent, 'undated');
  assert.equal(document.querySelector('#skill .updated'), null);
});

test('the API: a skill whose day is unknown (a directory outside git) has `updated: null`', async (t) => {
  const copy = mkdtempSync(join(tmpdir(), 'skill-atlas-plain-'));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  cpSync(FIXTURE, copy, { recursive: true });
  const { status, body } = await scan(copy);
  assert.equal(status, 200);
  assert.equal(body.skills.length, 7);
  for (const skill of body.skills) assert.equal(skill.updated, null, skill.name);
});

test("the organization's card: its link, its repositories, the bar full, the top repositories by skill count", async (t) => {
  const page = await pageAt(t, 'https://github.com/octo-org');
  await page.scanned();
  assert.deepEqual(page.card(), {
    hidden: false,
    title: 'Scan the organization',
    name: 'github.com/octo-org',
    count: '101 repositories',
    progress: { running: false, value: '100' },
    label: '3 with skills',
    // Most skills first; a tie by name, ignoring case. The name without the owner, linked.
    top: [
      ['agents', 'https://github.com/octo-org/agents', '2 skills'],
      ['Docs', 'https://github.com/octo-org/Docs', '1 skill'],
      ['tools', 'https://github.com/octo-org/tools', '1 skill'],
    ],
    more: '',
  });
  // The grouped list stays under the card, as before.
  assert.equal(page.document.querySelectorAll('#skills li.group').length, 3);
  assert.equal(page.document.getElementById('status')!.textContent, 'octo-org · 4 skills in 3 of 101 repositories');
});

test('an organization filtered: the matches across its repositories, a heading only over a match, the count', async (t) => {
  const page = await pageAt(t, 'https://github.com/octo-org');
  await page.scanned();
  const { document } = page;
  const filter = document.getElementById('filter') as HTMLInputElement;
  const headings = () =>
    [...document.querySelectorAll('#skills li.group:not([hidden])')].map((heading) => heading.textContent);
  const names = () => [...document.querySelectorAll('#skills li[role="option"]:not([hidden]) .name')].map((name) => name.textContent);
  const all = names();
  assert.equal(all.length, 4);
  assert.equal(headings().length, 3);

  // One skill's name: only it, under its own repository's heading.
  filter.value = all[0]!;
  filter.dispatchEvent(new document.defaultView!.Event('input'));
  assert.ok(names().length >= 1 && names().every((name) => name!.includes(all[0]!)));
  assert.ok(headings().length >= 1 && headings().length < 3, 'a heading only over its matches');
  assert.equal(document.getElementById('count')!.textContent, `${names().length} of 4`);
  assert.equal(document.getElementById('status')!.textContent, `octo-org · ${names().length} of 4 skills`);
  assert.equal(document.querySelector('#skill h2')!.textContent, names()[0]);

  // No match: no heading, no skill.
  filter.value = 'zzz-nothing';
  filter.dispatchEvent(new document.defaultView!.Event('input'));
  assert.deepEqual(headings(), []);
  assert.equal(document.getElementById('no-match')!.textContent, 'No skills match "zzz-nothing"');

  // Cleared: every heading and skill, the organization's count again.
  filter.value = '';
  filter.dispatchEvent(new document.defaultView!.Event('input'));
  assert.equal(headings().length, 3);
  assert.equal(names().length, 4);
  assert.equal(document.getElementById('status')!.textContent, 'octo-org · 4 skills in 3 of 101 repositories');
});

test("the organization's card: while scanning the bar moves; then the top 3, and +N more", async (t) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const answer = organizationAnswer('JetBrains', 865, [
    ['kotlin', 6],
    ['intellij-community', 38],
    ['koog', 2],
    ['MPS', 41],
    ['aspire-plugin', 3],
  ]);
  const page = await pageAt(t, 'github.com/JetBrains', async () => (await held, Response.json(answer)));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(page.card(), {
    hidden: false,
    title: 'Scan the organization',
    name: 'github.com/JetBrains',
    count: '…',
    progress: { running: true, value: null },
    label: 'Scanning…',
    top: [],
    more: '',
  });
  release();
  await page.scanned();
  const card = page.card();
  assert.equal(card.count, '865 repositories');
  assert.deepEqual(card.progress, { running: false, value: '100' });
  assert.equal(card.label, '5 with skills, among them');
  assert.deepEqual(
    card.top.map(([name, , skills]) => `${name} ${skills}`),
    ['MPS 41 skills', 'intellij-community 38 skills', 'kotlin 6 skills'],
  );
  assert.equal(card.more, '+2 more');
});

test("the organization's card: no repository with skills; hidden for a repository and on a failure", async (t) => {
  const none = await pageAt(t, 'github.com/empty-org', async () => Response.json(organizationAnswer('empty-org', 4, [])));
  await none.scanned();
  assert.deepEqual(
    (({ hidden, count, label, top, more }) => ({ hidden, count, label, top, more }))(none.card()),
    { hidden: false, count: '4 repositories', label: 'No repository with skills', top: [], more: '' },
  );
  const repository = await pageAt(t, FIXTURE);
  await repository.scanned();
  assert.equal(repository.card().hidden, true, 'a repository has no organization card');
  const unknown = await pageAt(t, 'https://github.com/no-such-org');
  await unknown.scanned();
  assert.equal(unknown.card().hidden, true, 'an unknown organization: only its message');
  assert.equal(unknown.document.getElementById('status')!.textContent, 'Organization not found: https://github.com/no-such-org');
});

test('an unknown organization → 400 with a clear message', async () => {
  const response = await fetch(`${url}api/scan?repo=${encodeURIComponent('github.com/no-such-org')}`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Organization not found: https://github.com/no-such-org' });
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

test('the filter and the skills show only once a scan has answered: not before, not while scanning, not on a failure', async (t) => {
  const results = (document: Document) => (document.getElementById('results') as HTMLElement).hidden;
  const blank = await pageAt(t, '');
  assert.equal(results(blank.document), true, 'no scan yet: only the field');

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const scanning = await pageAt(t, FIXTURE, async () => {
    await held;
    return fetch(`${url}api/scan?repo=${encodeURIComponent(FIXTURE)}`);
  });
  assert.equal(results(scanning.document), true, 'while scanning: hidden');
  release();
  await scanning.scanned();
  assert.equal(results(scanning.document), false, 'scanned: the filter and the skills');
  assert.equal(scanning.document.getElementById('status')!.textContent, 'fixture · 7 skills');

  const failed = await pageAt(t, 'https://github.com/no-such-org');
  await failed.scanned();
  assert.equal(results(failed.document), true, 'a failure: only its message');
  assert.equal(failed.document.getElementById('status')!.textContent, 'Organization not found: https://github.com/no-such-org');
});

test('no skill selected: the SKILL.md view says how to read one', async (t) => {
  const page = await openPage(t, fixtureQuery('zzz'));
  assert.equal(page.selected(), null);
  assert.equal(page.placeholder(), 'Select a skill to read its SKILL.md.');
  page.type('');
  assert.equal(page.selected(), 'aspect-generator');
  assert.equal(page.placeholder(), null, 'a skill selected: its SKILL.md instead');
});

test('a sentence cut at two lines folds: the skills are on screen when it is measured', async (t) => {
  // jsdom has no layout: a description's clamp is three lines high while on screen, nothing while hidden.
  const layout = (window: JSDOM['window']) => {
    const offScreen = (node: Element) => !!node.closest('[hidden]');
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { get(this: Element) { return offScreen(this) ? 0 : 60; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get(this: Element) { return offScreen(this) ? 0 : 40; } });
  };
  const sentence = 'One long sentence that runs on past the two lines of the list without a single stop.';
  const answer = organizationAnswer('octo', 1, [['long', 1]]);
  Object.assign(answer.repositories[0].skills[0], { description: sentence, summary: sentence });
  const page = await pageAt(t, 'github.com/octo', async () => Response.json(answer), layout);
  await page.scanned();
  const item = page.document.querySelector('#skills li[role="option"]')!;
  assert.ok(item.querySelector('details.description'), 'one sentence, cut at two lines: a fold');
  assert.equal(item.querySelector('details.description .whole')!.textContent, sentence);
});

test('no skills: the SKILL.md view says how to read one', async (t) => {
  const page = await pageAt(t, 'github.com/empty-org', async () => Response.json(organizationAnswer('empty-org', 4, [])));
  await page.scanned();
  assert.equal(page.document.querySelector('#skills li[role="option"]'), null);
  assert.equal(page.document.querySelector('#skill .placeholder')?.textContent, 'Select a skill to read its SKILL.md.');
});

test("an organization: its card shows while it scans, the filter and the skills only once it has answered", async (t) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const answer = organizationAnswer('JetBrains', 865, [['kotlin', 6]]);
  const page = await pageAt(t, 'github.com/JetBrains', async () => (await held, Response.json(answer)));
  const results = () => (page.document.getElementById('results') as HTMLElement).hidden;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(page.card().hidden, false, 'scanning: the card');
  assert.equal(results(), true, 'scanning: no filter, no skills');
  release();
  await page.scanned();
  assert.equal(page.card().hidden, false);
  assert.equal(results(), false, 'answered: the filter and the skills');
});

/** The keyboard in a page's skill list: keys pressed where the focus is, as a user does. */
function keyboard(document: Document) {
  const window = document.defaultView!;
  const nameOf = (node: Element | null) => node?.closest('li[role="option"]')?.querySelector('.name')?.textContent ?? null;
  const option = (name: string) => {
    const item = [...document.querySelectorAll('#skills li[role="option"]')].find((li) => li.querySelector('.name')?.textContent === name);
    assert.ok(item, name);
    return item as HTMLElement;
  };
  return {
    option,
    /** The skill that has the focus; null when the focus is not on a skill. */
    focused: () => (document.activeElement?.matches('#skills li[role="option"]') ? nameOf(document.activeElement) : null),
    /** The skills that Tab stops on, by name. */
    tabStops: () => [...document.querySelectorAll('#skills li[role="option"]')].filter((li) => (li as HTMLElement).tabIndex === 0).map(nameOf),
    /** Presses a key where the focus is; true when the page took it (its default prevented). */
    press(key: string, target: Element = document.activeElement!) {
      const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    /** The skills whose fold `▸` Tab stops on, by name. */
    foldStops: () => [...document.querySelectorAll('#skills details.description summary')].filter((summary) => (summary as HTMLElement).tabIndex === 0).map(nameOf),
    /** Tab into the list: the focus goes to its one Tab stop. */
    tabIn() {
      const [stop, ...more] = [...document.querySelectorAll('#skills li[role="option"]')].filter((li) => (li as HTMLElement).tabIndex === 0);
      assert.equal(more.length, 0, 'one Tab stop');
      (stop as HTMLElement).focus();
    },
  };
}

test('the keyboard: the list is one Tab stop, on the selected skill; it follows the selection', async (t) => {
  const page = await openPage(t, fixtureQuery());
  const keys = keyboard(page.document);
  assert.deepEqual(keys.tabStops(), ['aspect-generator'], 'at first: the first skill, selected');
  for (const item of page.document.querySelectorAll('#skills li[role="option"]')) {
    assert.ok((item as HTMLElement).tabIndex >= -1 && item.hasAttribute('tabindex'), 'every skill is focusable');
  }
  page.select('reviews');
  assert.deepEqual(keys.tabStops(), ['reviews'], 'a click moves it');
  page.type('kotlin');
  assert.equal(page.selected(), 'code-style');
  assert.deepEqual(keys.tabStops(), ['code-style'], 'filtered out: the first match');
  page.type('zzz');
  assert.deepEqual(keys.tabStops(), [], 'no match: no skill to stop on');
  page.type('');
  assert.deepEqual(keys.tabStops(), ['aspect-generator']);
});

test('the keyboard: ↓ ↑ Home End move the focus between the skills, no wrap; the focus alone selects nothing', async (t) => {
  const page = await openPage(t, fixtureQuery());
  const keys = keyboard(page.document);
  keys.tabIn();
  assert.equal(keys.focused(), 'aspect-generator');
  assert.equal(keys.press('ArrowDown'), true, 'the page takes the key: the page does not scroll');
  assert.equal(keys.focused(), 'code-style');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 'commits');
  assert.equal(page.selected(), 'aspect-generator', 'the focus alone selects nothing');
  keys.press('ArrowUp');
  assert.equal(keys.focused(), 'code-style');
  keys.press('End');
  assert.equal(keys.focused(), 'run-tests');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 'run-tests', 'no wrap at the end');
  keys.press('Home');
  assert.equal(keys.focused(), 'aspect-generator');
  keys.press('ArrowUp');
  assert.equal(keys.focused(), 'aspect-generator', 'no wrap at the start');
  assert.equal(page.selected(), 'aspect-generator');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 'code-style');
  assert.deepEqual(keys.tabStops(), ['aspect-generator'], 'the Tab stop stays on the selected skill, not the focused one');
});

test('the keyboard: Enter or Space selects the focused skill, as a click; release-checklist, with no fold, too', async (t) => {
  const page = await openPage(t, fixtureQuery());
  const keys = keyboard(page.document);
  keys.tabIn();
  keys.press('End');
  keys.press('ArrowUp');
  keys.press('ArrowUp');
  assert.equal(keys.focused(), 'release-checklist');
  assert.equal(keys.option('release-checklist').querySelector('details'), null, 'no description: no fold');
  assert.equal(keys.press('Enter'), true);
  assert.equal(page.selected(), 'release-checklist', 'Enter selects it');
  assert.equal(page.placeholder(), null, 'its SKILL.md shows');
  keys.press('ArrowDown');
  assert.equal(keys.press(' '), true, 'Space does not scroll the page');
  assert.equal(page.selected(), 'reviews', 'Space selects it');
  assert.equal(keys.focused(), 'reviews', 'the focus stays on it');
  assert.equal(keys.press('a'), false, 'any other key: the browser\'s');
  assert.equal(page.selected(), 'reviews');
});

test('the keyboard: the shown skills only, while filtered', async (t) => {
  const page = await openPage(t, fixtureQuery('use before'));
  const keys = keyboard(page.document);
  keys.tabIn();
  assert.equal(keys.focused(), 'code-style');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 'reviews', 'past the hidden commits and lint-checks');
  keys.press('End');
  assert.equal(keys.focused(), 'run-tests');
  keys.press('Home');
  assert.equal(keys.focused(), 'code-style');
});

test('the keyboard: a fold is a Tab stop of its own; Enter on it keeps the selected skill', async (t) => {
  const page = await openPage(t, fixtureQuery());
  const keys = keyboard(page.document);
  const summary = keys.option('code-style').querySelector('details.description summary') as HTMLElement;
  assert.ok(summary, 'code-style has more than one sentence: a fold');
  summary.focus();
  assert.equal(keys.press('Enter'), false, 'the browser unfolds it');
  assert.equal(keys.press(' '), false);
  assert.equal(page.selected(), 'aspect-generator', 'unfolding keeps the selected skill');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 'commits', 'from inside a skill, ↓ goes to the next one');
});

test('the keyboard: only the fold of the focused skill, else the selected one, is a Tab stop', async (t) => {
  const page = await openPage(t, fixtureQuery());
  const keys = keyboard(page.document);
  assert.deepEqual(keys.foldStops(), ['aspect-generator'], 'at first: the selected skill\'s fold, no other');
  page.select('run-tests');
  assert.deepEqual(keys.foldStops(), ['run-tests'], 'Tab from the filter: run-tests, not the folds above it');
  keys.tabIn();
  keys.press('Home');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 'code-style');
  assert.deepEqual(keys.foldStops(), ['code-style'], 'the focused skill: Tab goes to its own fold');
  assert.deepEqual(keys.tabStops(), ['run-tests']);
  (page.document.querySelector('#filter') as HTMLElement).focus();
  assert.deepEqual(keys.foldStops(), ['run-tests'], 'the focus out of the list: back to the selected skill');
  page.type('zzz');
  assert.deepEqual(keys.foldStops(), [], 'no match: no fold to stop on');
});

test("the keyboard: across an organization's repositories, past their headings", async (t) => {
  const page = await pageAt(t, 'github.com/octo', async () => Response.json(organizationAnswer('octo', 3, [['one', 2], ['two', 1]])));
  await page.scanned();
  const keys = keyboard(page.document);
  /** The heading over the focused skill. */
  const repository = () => {
    let node: Element | null = page.document.activeElement?.closest('li') ?? null;
    while (node && !node.matches('.group')) node = node.previousElementSibling;
    return node?.textContent ?? null;
  };
  keys.tabIn();
  assert.equal(keys.focused(), 's0');
  assert.equal(repository(), 'octo/one · 2 skills');
  keys.press('ArrowDown');
  keys.press('ArrowDown');
  assert.equal(keys.focused(), 's0', "the next repository's first skill");
  assert.equal(repository(), 'octo/two · 1 skill');
  keys.press('ArrowUp');
  assert.equal(keys.focused(), 's1');
  keys.press('Enter');
  assert.equal(page.document.querySelector('#skill h2')?.textContent, 's1');
  assert.deepEqual(keys.tabStops(), ['s1']);
});
