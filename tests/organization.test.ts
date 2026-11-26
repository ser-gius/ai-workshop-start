// spec/analysis.md and spec/cli.md, "An organization": `skill-atlas scan github.com/<owner>`, on the
// recorded GitHub answers in tests/helpers.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { openGitHub, openOrganization, parseGitHubOwnerUrl, parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { scanOrganization } from '../src/core/scan.ts';
import { atlasOn, EXAMPLE_COMMIT, history, ORGANIZATION, searchUrl, USER } from './helpers.ts';

const blob = (id: string, path: string) => `  https://github.com/${id}/blob/${EXAMPLE_COMMIT}/${path}`;

test('github.com/<owner> is an organization; github.com/<owner>/<repo> is a repository', () => {
  for (const input of ['github.com/JetBrains', 'https://github.com/JetBrains', 'https://www.github.com/JetBrains/', ' github.com/JetBrains ']) {
    assert.deepEqual(parseGitHubOwnerUrl(input), { owner: 'JetBrains' }, input);
    assert.equal(parseGitHubUrl(input), undefined, input);
  }
  for (const input of ['github.com/JetBrains/kotlin', 'github.com/JetBrains/kotlin/tree/main', 'github.com', 'gitlab.com/JetBrains', './JetBrains']) {
    assert.equal(parseGitHubOwnerUrl(input), undefined, input);
  }
});

test('an organization: its skill count, then each repository with skills, sorted ignoring case, grouped', async () => {
  const { code, stdout } = await atlasOn(ORGANIZATION, 'https://github.com/octo-org');
  assert.equal(code, 0);
  assert.equal(
    stdout,
    [
      // 101 repositories: 102 listed on two pages, less the fork.
      'octo-org · 4 skills in 3 of 101 repositories',
      '',
      'octo-org/agents · 2 skills',
      'commits — Write commit messages the way this organization does.',
      blob('octo-org/agents', '.claude/skills/commits/SKILL.md'),
      '  updated 2026-10-01',
      'reviews — Review a change.',
      blob('octo-org/agents', '.agents/skills/reviews/SKILL.md'),
      // Copies within the repository; test data is not a skill.
      '  also in .claude/skills/reviews/SKILL.md',
      // The copy changed last: the skill's day is the copy's.
      '  updated 2026-09-15',
      '',
      'octo-org/Docs · 1 skill',
      'style',
      blob('octo-org/Docs', '.github/skills/style/SKILL.md'),
      '  updated 2026-08-05',
      '',
      // At its default branch, trunk.
      'octo-org/tools · 1 skill',
      'lint — Write a lint check.',
      blob('octo-org/tools', 'agent/skills/lint/SKILL.md'),
      '  updated 2026-07-04',
    ].join('\n'),
  );
});

test("a repository's warning is prefixed with it; one that fails is skipped with a warning, the scan goes on", async () => {
  const { code, stderr } = await atlasOn(ORGANIZATION, 'github.com/octo-org');
  assert.equal(code, 0);
  assert.equal(
    stderr,
    [
      'warning: octo-org/broken: Commit not found: https://github.com/octo-org/broken/tree/main; skipped',
      'warning: octo-org/Docs: .github/skills/style/SKILL.md: malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
    ].join('\n'),
  );
});

test('its repositories: the pages its public count needs, then page after page while they are full', async () => {
  for (const public_repos of [102, 40, undefined]) {
    const recording: Recording = {
      ...ORGANIZATION,
      'https://api.github.com/users/octo-org': { status: 200, body: { login: 'octo-org', type: 'Organization', public_repos } },
    };
    const source = await openOrganization('github.com/octo-org', { fetch: replay(recording), token: 'test' });
    assert.equal(source.repositories, 101, `public_repos: ${public_repos}`);
  }
  // More pages than there are: an empty one, and nothing lost.
  const over: Recording = { ...USER, 'https://api.github.com/users/octocat': { status: 200, body: { login: 'octocat', type: 'User', public_repos: 150 } } };
  over['https://api.github.com/users/octocat/repos?per_page=100&page=2'] = { status: 200, body: [] };
  assert.equal((await openOrganization('github.com/octocat', { fetch: replay(over) })).repositories, 2);
});

test('with GITHUB_TOKEN: one code search over the organization; forks and repositories it does not find are never asked for', async () => {
  const asked: string[] = [];
  const recorded = replay(ORGANIZATION);
  const fetch: Fetch = (url, init) => {
    asked.push(url);
    return recorded(url, init);
  };
  const source = await openOrganization('github.com/octo-org', { fetch, token: 'test' });
  assert.deepEqual(source.sources.map(({ id }) => id).sort(), ['octo-org/Docs', 'octo-org/agents', 'octo-org/broken', 'octo-org/tools']);
  assert.equal(asked.filter((url) => url.includes('/search/code')).length, 1);
  assert.ok(!asked.some((url) => /octo-org\/(fork|repo-\d+)/.test(url)), asked.join('\n'));
});

test('without GITHUB_TOKEN, a user: each repository through its tree; an empty one has no skills and no warning', async () => {
  // Nothing recorded for code search: it is not asked without a token.
  const { code, stdout, stderr } = await atlasOn(USER, 'github.com/octocat', { token: undefined });
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.equal(
    stdout,
    [
      'octocat · 1 skill in 1 of 2 repositories',
      '',
      'octocat/hello · 1 skill',
      'greet — Greet the user.',
      blob('octocat/hello', '.claude/skills/greet/SKILL.md'),
      '  updated 2026-06-30',
    ].join('\n'),
  );
});

test('with GITHUB_TOKEN, a small owner (up to 20 repositories): each repository through its tree, no code search', async () => {
  const asked: string[] = [];
  const recorded = replay(USER); // no code search recorded: asking for one would fail
  const fetch: Fetch = (url, init) => {
    asked.push(url);
    return recorded(url, init);
  };
  const result = await scanOrganization(await openOrganization('github.com/octocat', { fetch, token: 'test' }));
  assert.deepEqual(result.results.map(({ repository, skills }) => [repository.id, skills.map((skill) => skill.name)]), [['octocat/hello', ['greet']]]);
  assert.deepEqual(result.warnings, []);
  assert.ok(!asked.some((url) => url.includes('/search/')), asked.join('\n'));
});

/** What GitHub answers for an owner with this many repositories, none of them a fork; `<owner>/docs` among them. */
function manyRepositories(owner: string, type: 'Organization' | 'User', count: number): Recording {
  const names = ['docs', ...Array.from({ length: count - 1 }, (_, i) => `repo-${i + 1}`)];
  return {
    [`https://api.github.com/users/${owner}`]: { status: 200, body: { login: owner, type, public_repos: count } },
    [`https://api.github.com/${type === 'User' ? 'users' : 'orgs'}/${owner}/repos?per_page=100&page=1`]: {
      status: 200,
      body: names.map((name) => ({ full_name: `${owner}/${name}`, default_branch: 'main', fork: false })),
    },
    [`https://api.github.com/repos/${owner}/docs/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
  };
}

test('with GITHUB_TOKEN, more than 20 repositories: one code search; for a user, over its repositories (`user:`)', async () => {
  const recording: Recording = {
    ...manyRepositories('many', 'User', 21),
    [searchUrl('user:many', 1)]: {
      status: 200,
      body: { total_count: 1, items: [{ path: '.claude/skills/greet/SKILL.md', repository: { full_name: 'many/docs' } }] },
    },
    [`https://raw.githubusercontent.com/many/docs/${EXAMPLE_COMMIT}/.claude/skills/greet/SKILL.md`]: {
      status: 200,
      body: '---\nname: greet\ndescription: Greet the user.\n---\n',
    },
    // No commit touched it: no day.
    ...history('many/docs', '.claude/skills/greet', undefined),
  };
  // No tree is recorded: the other 20 repositories are never asked for.
  const { code, stdout, stderr } = await atlasOn(recording, 'github.com/many');
  assert.equal(code, 0, stderr);
  assert.equal(stdout, ['many · 1 skill in 1 of 21 repositories', '', 'many/docs · 1 skill', 'greet — Greet the user.', blob('many/docs', '.claude/skills/greet/SKILL.md')].join('\n'));
});

test('an empty repository on its own → a clear message, exit code 1', async () => {
  const { code, stdout, stderr } = await atlasOn(USER, 'github.com/octocat/empty', { token: undefined });
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, 'Repository is empty: https://github.com/octocat/empty');
});

test('more than 1000 SKILL.md files → a warning, and no 11th page', async () => {
  const pages = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      searchUrl('org:big', i + 1),
      {
        status: 200,
        body: {
          total_count: 1500,
          items: Array.from({ length: 100 }, (_, j) => ({ path: `docs/${i}-${j}/SKILL.md`, repository: { full_name: 'big/docs' } })),
        },
      },
    ]),
  );
  const recording: Recording = { ...manyRepositories('big', 'Organization', 21), ...pages };
  const { code, stdout, stderr } = await atlasOn(recording, 'github.com/big');
  assert.equal(code, 0, stderr);
  assert.equal(stdout, 'big · 0 skills in 0 of 21 repositories');
  assert.equal(stderr, 'warning: code search lists at most 1000 SKILL.md files, and there are 1500: some skills may be missing');
});

test('unknown organization → a clear message, exit code 1', async () => {
  const recording: Recording = { 'https://api.github.com/users/nobody': { status: 404, body: { message: 'Not Found' } } };
  const { code, stdout, stderr } = await atlasOn(recording, 'github.com/nobody');
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, 'Organization not found: https://github.com/nobody');
});

test('`.` and `..` as the owner → unknown organization, nothing asked of GitHub; so is an answer without a login', async () => {
  const asked: string[] = [];
  const fetch: Fetch = async (url) => (asked.push(url), Response.json({ message: 'not asked' }, { status: 500 }));
  for (const owner of ['.', '..', '...']) {
    await assert.rejects(openOrganization(`github.com/${owner}/`, { fetch, token: 'test' }), {
      message: `Organization not found: https://github.com/${owner}`,
    });
  }
  assert.deepEqual(asked, []);
  // The CLI, as a user runs it: `/users/..` would be the API's root, which answers 200 without a login.
  const root: Recording = { 'https://api.github.com/users/..': { status: 200, body: { current_user_url: 'https://api.github.com/user' } } };
  assert.deepEqual(await atlasOn(root, 'github.com/..'), { code: 1, stdout: '', stderr: 'Organization not found: https://github.com/..' });
  // Whatever the owner, an answer that names no one is no organization.
  const nameless: Recording = { 'https://api.github.com/users/ghost': { status: 200, body: { type: 'Organization' } } };
  assert.deepEqual(await atlasOn(nameless, 'github.com/ghost'), { code: 1, stdout: '', stderr: 'Organization not found: https://github.com/ghost' });
});

test('`.` and `..` in a repository URL → unknown repository, nothing asked of GitHub', async () => {
  const asked: string[] = [];
  const fetch: Fetch = async (url) => (asked.push(url), Response.json({ message: 'not asked' }, { status: 500 }));
  for (const [owner, repo] of [['..', 'x'], ['JetBrains', '..'], ['.', '.']]) {
    await assert.rejects(openGitHub(`github.com/${owner}/${repo}`, { fetch, token: 'test' }), {
      message: `Repository not found: https://github.com/${owner}/${repo}`,
    });
  }
  assert.deepEqual(asked, []);
});

test('the rate limit, a rejected token or GitHub unreachable in one repository → the whole scan stops, exit code 1', async () => {
  const failing = (answer: Recording[string] | undefined): Recording => {
    const recording: Recording = { ...ORGANIZATION };
    delete recording['https://api.github.com/repos/octo-org/tools/commits/trunk'];
    if (answer) recording['https://api.github.com/repos/octo-org/tools/commits/trunk'] = answer;
    return recording;
  };
  const limited = await atlasOn(failing({ status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } }), 'github.com/octo-org');
  assert.deepEqual(limited, { code: 1, stdout: '', stderr: 'GitHub rate limit reached; try again in a minute' });
  const rejected = await atlasOn(failing({ status: 401, body: { message: 'Bad credentials' } }), 'github.com/octo-org');
  assert.deepEqual(rejected, { code: 1, stdout: '', stderr: 'GitHub rejected the token in GITHUB_TOKEN' });
  const unreachable = await atlasOn(failing(undefined), 'github.com/octo-org');
  assert.equal(unreachable.code, 1);
  assert.match(unreachable.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/octo-org\/tools\/commits\/trunk$/);
});

test("GitHub's rate limit with a short wait → waits as it asks, then asks again", async () => {
  const search = searchUrl('org:octo-org', 1);
  const recorded = replay(ORGANIZATION);
  // What GitHub answers to too many code searches in a minute, then a secondary rate limit.
  const limits = [
    () => Response.json({ message: 'try again in 0.01s' }, { status: 429 }),
    () => Response.json({ message: 'You have exceeded a secondary rate limit.' }, { status: 403, headers: { 'Retry-After': '0' } }),
  ];
  let searched = 0;
  const fetch: Fetch = async (url, init) => (url === search && searched < limits.length ? limits[searched++]() : recorded(url, init));
  const source = await openOrganization('github.com/octo-org', { fetch, token: 'test' });
  assert.equal(searched, 2);
  assert.equal(source.sources.length, 4);
});

test("GitHub's rate limit: a wait over a minute (and how long), no wait given, or still limited after two waits → the scan stops", async () => {
  const limitedWith = (answer: () => Response) => {
    let asked = 0;
    const recorded = replay(ORGANIZATION);
    const fetch: Fetch = async (url, init) => (url === searchUrl('org:octo-org', 1) ? (asked++, answer()) : recorded(url, init));
    return { scan: openOrganization('github.com/octo-org', { fetch, token: 'test' }), asked: () => asked };
  };
  const message = { message: 'GitHub rate limit reached; try again in a minute' };
  const later = limitedWith(() =>
    Response.json(
      { message: 'API rate limit exceeded for user ID 1.' },
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3030) } },
    ),
  );
  await assert.rejects(later.scan, { message: 'GitHub rate limit reached; try again in 51 minutes' }, 'how long, as GitHub says');
  assert.equal(later.asked(), 1, '50 minutes are not waited for');
  // A whole number of minutes is that many, not one more.
  const twoMinutes = limitedWith(() =>
    Response.json({ message: 'You have exceeded a secondary rate limit.' }, { status: 403, headers: { 'Retry-After': '120' } }),
  );
  await assert.rejects(twoMinutes.scan, { message: 'GitHub rate limit reached; try again in 2 minutes' });
  const anHour = limitedWith(() =>
    Response.json(
      { message: 'API rate limit exceeded for user ID 1.' },
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } },
    ),
  );
  await assert.rejects(anHour.scan, { message: 'GitHub rate limit reached; try again in 60 minutes' });
  // Which limit, when GitHub says.
  const core = limitedWith(() =>
    Response.json(
      { message: 'API rate limit exceeded for installation ID 1.' },
      {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 780),
          'x-ratelimit-resource': 'core',
        },
      },
    ),
  );
  await assert.rejects(core.scan, { message: 'GitHub rate limit reached (the core limit); try again in 13 minutes' });
  const silent = limitedWith(() => Response.json({ message: 'Too many requests' }, { status: 429 }));
  await assert.rejects(silent.scan, message);
  assert.equal(silent.asked(), 1);
  const still = limitedWith(() => Response.json({ message: 'try again in 0.01s' }, { status: 429 }));
  await assert.rejects(still.scan, message);
  assert.equal(still.asked(), 3, 'the first time and two after a wait');
});

test('once GitHub turns the scan away, no further request is sent', async () => {
  const asked: string[] = [];
  const recorded = replay({
    ...ORGANIZATION,
    'https://api.github.com/repos/octo-org/agents/commits/main': { status: 403, body: { message: 'API rate limit exceeded' } },
  });
  // The other repositories' commits answer later, after the rate limit.
  const fetch: Fetch = async (url, init) => {
    asked.push(url);
    if (/\/repos\/octo-org\/(Docs|tools)\/commits\//.test(url)) await new Promise((resolve) => setTimeout(resolve, 50));
    return recorded(url, init);
  };
  await assert.rejects(scanOrganization(await openOrganization('github.com/octo-org', { fetch, token: 'test' })), {
    message: 'GitHub rate limit reached; try again in a minute',
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(asked.filter((url) => url.startsWith('https://raw.githubusercontent.com/')), [], 'no SKILL.md is read');
});

test('the browser terminal scans an organization too, without a token', async () => {
  const browser = createBrowserBackend({ fetch: replay(USER) });
  const output = await browser.run('$ skill-atlas scan github.com/octocat');
  assert.match(output, /^octocat · 1 skill in 1 of 2 repositories\n\noctocat\/hello · 1 skill\ngreet — Greet the user\.\n/);
});

test('help lists the organization scan', async () => {
  const browser = createBrowserBackend({ fetch: () => Promise.reject(new Error('offline')) });
  assert.match(await browser.run('help'), /^  scan github\.com\/<owner> +every repository of an organization, grouped by repository$/m);
});
