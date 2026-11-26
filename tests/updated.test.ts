// spec/analysis.md, "When a skill last changed", and spec/cli.md's `updated <day>`: on recorded GitHub
// answers (tests/helpers.ts), and on local git repositories made here, with fixed commit dates.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { openGitHub, type Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { atlas, atlasOn, EXAMPLE_COMMIT, FIXTURE, history, historyUrl, recordRepository } from './helpers.ts';

const skillMd = (name: string) => `---\nname: ${name}\ndescription: Does ${name}.\n---\n`;
const blob = (id: string, path: string) => `  https://github.com/${id}/blob/${EXAMPLE_COMMIT}/${path}`;

test("GitHub: the day of the latest commit that touched the skill's folder, by its committer date, in UTC", async () => {
  const id = 'octo/dates';
  const recording: Recording = {
    ...recordRepository(id, { '.claude/skills/late/SKILL.md': skillMd('late') }),
    // Committed at 01:00 at UTC+2: the day before, in UTC. Its author date (2000) is not the one.
    ...history(id, '.claude/skills/late', '2026-03-01T01:00:00+02:00'),
  };
  const { code, stdout, stderr } = await atlasOn(recording, `https://github.com/${id}`);
  assert.equal(code, 0, stderr);
  assert.equal(stdout, ['octo/dates · 1 skill', 'late — Does late.', blob(id, '.claude/skills/late/SKILL.md'), '  updated 2026-02-28'].join('\n'));
  const { skills } = await scan(await openGitHub(`https://github.com/${id}`, { fetch: replay(recording), token: 'test' }));
  assert.equal(skills[0].updated, '2026-02-28T23:00:00Z');
});

test('GitHub: a skill with copies → the latest of its folder and its copies’ folders, each asked at the scanned commit', async () => {
  const id = 'octo/copies';
  const asked: string[] = [];
  const recording: Recording = {
    ...recordRepository(id, {
      '.agents/skills/actions/SKILL.md': skillMd('actions'),
      '.claude/skills/actions/SKILL.md': skillMd('actions'),
    }),
    ...history(id, '.agents/skills/actions', '2026-04-14T17:22:41Z'),
    ...history(id, '.claude/skills/actions', '2026-05-21T13:17:22Z'),
  };
  const recorded = replay(recording);
  const { skills } = await scan(
    await openGitHub(`https://github.com/${id}`, { fetch: (url, init) => (asked.push(url), recorded(url, init)), token: 'test' }),
  );
  assert.deepEqual(
    skills.map((skill) => [skill.path, skill.copies, skill.updated]),
    [['.agents/skills/actions/SKILL.md', ['.claude/skills/actions/SKILL.md'], '2026-05-21T13:17:22Z']],
  );
  assert.deepEqual(asked.filter((url) => url.includes('/commits?')).sort(), [
    historyUrl(id, '.agents/skills/actions'),
    historyUrl(id, '.claude/skills/actions'),
  ]);
});

test('GitHub: no commit touched the folder → no day, no warning', async () => {
  const id = 'octo/none';
  const recording = { ...recordRepository(id, { '.claude/skills/x/SKILL.md': skillMd('x') }), ...history(id, '.claude/skills/x', undefined) };
  const { code, stdout, stderr } = await atlasOn(recording, `https://github.com/${id}`);
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, ['octo/none · 1 skill', 'x — Does x.', blob(id, '.claude/skills/x/SKILL.md')].join('\n'));
});

test("GitHub: a folder's history that fails → a warning, the skill without a day; the scan goes on", async () => {
  const id = 'octo/failing';
  const recording: Recording = {
    ...recordRepository(id, { '.claude/skills/x/SKILL.md': skillMd('x'), '.claude/skills/y/SKILL.md': skillMd('y') }),
    [historyUrl(id, '.claude/skills/x')]: { status: 500, body: { message: 'Server Error' } },
  };
  const { code, stdout, stderr } = await atlasOn(recording, `https://github.com/${id}`);
  assert.equal(code, 0, stderr);
  assert.equal(
    stdout,
    ['octo/failing · 2 skills', 'x — Does x.', blob(id, '.claude/skills/x/SKILL.md'), 'y — Does y.', blob(id, '.claude/skills/y/SKILL.md'), '  updated 2026-11-20'].join('\n'),
  );
  assert.equal(
    stderr,
    `warning: .claude/skills/x/SKILL.md: last update unknown: GitHub answered 500 for ${historyUrl(id, '.claude/skills/x')}: Server Error`,
  );
});

test("GitHub: the rate limit on a folder's history stops the scan, as anywhere else", async () => {
  const id = 'octo/limited';
  const recording: Recording = {
    ...recordRepository(id, { '.claude/skills/x/SKILL.md': skillMd('x') }),
    [historyUrl(id, '.claude/skills/x')]: { status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } },
  };
  assert.deepEqual(await atlasOn(recording, `https://github.com/${id}`), {
    code: 1,
    stdout: '',
    stderr: 'GitHub rate limit reached; try again in a minute',
  });
});

test("GitHub: a rejected token on a folder's history stops the scan, as anywhere else", async () => {
  const id = 'octo/rejected';
  const recording: Recording = {
    ...recordRepository(id, { '.claude/skills/x/SKILL.md': skillMd('x') }),
    [historyUrl(id, '.claude/skills/x')]: { status: 401, body: { message: 'Bad credentials' } },
  };
  assert.deepEqual(await atlasOn(recording, `https://github.com/${id}`), {
    code: 1,
    stdout: '',
    stderr: 'GitHub rejected the token in GITHUB_TOKEN',
  });
});

test("GitHub unreachable for a folder's history stops the scan, as anywhere else", async () => {
  const id = 'octo/unreachable';
  // The history left out of the recording: asking for it fails as a network error does.
  const recording = recordRepository(id, { '.claude/skills/x/SKILL.md': skillMd('x') });
  delete recording[historyUrl(id, '.claude/skills/x')];
  assert.deepEqual(await atlasOn(recording, `https://github.com/${id}`), {
    code: 1,
    stdout: '',
    stderr: `Cannot reach GitHub: not recorded: ${historyUrl(id, '.claude/skills/x')}`,
  });
});

test('GitHub without a token (the browser terminal too): no history is asked, no day, no warning', async () => {
  const id = 'octo/tokenless';
  const tree = `https://api.github.com/repos/${id}/git/trees/${EXAMPLE_COMMIT}?recursive=1`;
  const recording: Recording = {
    ...recordRepository(id, { '.claude/skills/x/SKILL.md': skillMd('x') }),
    [tree]: { status: 200, body: { truncated: false, tree: [{ path: '.claude/skills/x/SKILL.md', type: 'blob' }] } },
  };
  const asked: string[] = [];
  const recorded = replay(recording);
  const fetch: Fetch = (url, init) => (asked.push(url), recorded(url, init));
  const expected = ['octo/tokenless · 1 skill', 'x — Does x.', blob(id, '.claude/skills/x/SKILL.md')].join('\n');
  assert.deepEqual(await atlasOn(recording, `https://github.com/${id}`, { token: undefined }), { code: 0, stdout: expected, stderr: '' });
  assert.equal(await createBrowserBackend({ fetch }).run(`skill-atlas scan https://github.com/${id}`), expected);
  assert.deepEqual(asked.filter((url) => url.includes('/commits?')), []);
});

/** A git repository of its own in a temporary directory; removed after the test. */
function repository(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-git-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Nothing from the machine's own git configuration, or from a hook's environment.
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const git = (args: string[], dates: Record<string, string> = {}) => {
    const done = spawnSync('git', ['-c', 'user.name=Atlas', '-c', 'user.email=atlas@example.com', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      env: { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...dates },
      encoding: 'utf8',
    });
    assert.equal(done.status, 0, done.stderr);
  };
  git(['init', '-q']);
  return {
    root,
    write(path: string, text: string) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    /** Commits everything, committed at `date`, authored long before. */
    commit(date: string) {
      git(['add', '-A']);
      git(['commit', '-q', '-m', `at ${date}`], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z' });
    },
  };
}

test("a local directory in git: the day of the latest commit that touched the skill's folder or a copy's, in UTC", async (t) => {
  const repo = repository(t);
  repo.write('.claude/skills/commits/SKILL.md', skillMd('commits'));
  repo.write('.agents/skills/reviews/SKILL.md', skillMd('reviews'));
  repo.write('.claude/skills/reviews/SKILL.md', skillMd('reviews'));
  repo.commit('2026-03-01T01:00:00+02:00');
  // Only the copy changes; then a file next to SKILL.md, in the skill's folder.
  repo.write('.claude/skills/reviews/SKILL.md', `${skillMd('reviews')}\nMore.\n`);
  repo.commit('2026-04-10T12:00:00Z');
  repo.write('.claude/skills/commits/examples.md', 'An example.\n');
  repo.commit('2026-05-20T08:30:00Z');
  // Changes not committed yet: the day stays the last commit's.
  repo.write('.claude/skills/commits/SKILL.md', `${skillMd('commits')}\nChanged.\n`);

  const { skills, warnings } = await scan(await openDirectory(repo.root));
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    skills.map((skill) => [skill.name, skill.updated]),
    [
      ['commits', '2026-05-20T08:30:00Z'],
      ['reviews', '2026-04-10T12:00:00Z'],
    ],
  );
  const { code, stdout } = await atlas(['scan', repo.root]);
  assert.equal(code, 0);
  assert.deepEqual(
    stdout.split('\n').filter((line) => !line.startsWith('  file://')),
    [
      `${basename(repo.root)} · 2 skills`,
      'commits — Does commits.',
      '  updated 2026-05-20',
      'reviews — Does reviews.',
      '  also in .claude/skills/reviews/SKILL.md',
      '  updated 2026-04-10',
    ],
  );
});

test('a local directory in git: a skill not committed yet has no day', async (t) => {
  const repo = repository(t);
  repo.write('.claude/skills/old/SKILL.md', skillMd('old'));
  repo.commit('2026-01-02T03:04:05Z');
  repo.write('.claude/skills/new/SKILL.md', skillMd('new'));
  const { skills, warnings } = await scan(await openDirectory(repo.root));
  assert.deepEqual(warnings, []);
  assert.deepEqual(skills.map((skill) => [skill.name, skill.updated]), [['new', undefined], ['old', '2026-01-02T03:04:05Z']]);
});

test('a local directory in git, below its root: paths are its own, the history the repository’s', async (t) => {
  const repo = repository(t);
  repo.write('packages/app/.claude/skills/build/SKILL.md', skillMd('build'));
  repo.commit('2026-02-03T04:05:06Z');
  const { skills } = await scan(await openDirectory(join(repo.root, 'packages/app')));
  assert.deepEqual(skills.map((skill) => [skill.path, skill.updated]), [['.claude/skills/build/SKILL.md', '2026-02-03T04:05:06Z']]);
});

test('a shallow clone: where its history stops is no change of the skill; a later commit is', async (t) => {
  const repo = repository(t);
  repo.write('.claude/skills/old/SKILL.md', skillMd('old'));
  repo.write('.claude/skills/new/SKILL.md', skillMd('new'));
  repo.commit('2026-01-02T03:04:05Z');
  repo.write('README.md', 'Unrelated.\n');
  repo.commit('2026-02-03T04:05:06Z');
  repo.write('.claude/skills/new/SKILL.md', `${skillMd('new')}\nChanged.\n`);
  repo.commit('2026-03-04T05:06:07Z');
  const clone = mkdtempSync(join(tmpdir(), 'skill-atlas-shallow-'));
  t.after(() => rmSync(clone, { recursive: true, force: true }));
  // Its history: the last two commits; the first, which made `old`, is not in it.
  const done = spawnSync('git', ['clone', '-q', '--depth', '2', pathToFileURL(repo.root).href, clone], { encoding: 'utf8' });
  assert.equal(done.status, 0, done.stderr);
  const { skills, warnings } = await scan(await openDirectory(clone));
  assert.deepEqual(warnings, []);
  assert.deepEqual(skills.map((skill) => [skill.name, skill.updated]), [['new', '2026-03-04T05:06:07Z'], ['old', undefined]]);
  // The full repository knows both.
  assert.deepEqual(
    (await scan(await openDirectory(repo.root))).skills.map((skill) => [skill.name, skill.updated]),
    [['new', '2026-03-04T05:06:07Z'], ['old', '2026-01-02T03:04:05Z']],
  );
});

test("a local directory whose git history fails → a warning for each skill, no day; the scan goes on", async (t) => {
  const repo = repository(t);
  repo.write('.claude/skills/x/SKILL.md', skillMd('x'));
  repo.commit('2026-01-02T03:04:05Z');
  // The commit's tree is gone: git finds the repository, but cannot read its history.
  const tree = spawnSync('git', ['-C', repo.root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).stdout.trim();
  rmSync(join(repo.root, '.git/objects', tree.slice(0, 2), tree.slice(2)));
  const { code, stdout, stderr } = await atlas(['scan', repo.root]);
  assert.equal(code, 0, stderr);
  assert.deepEqual(stdout.split('\n').filter((line) => !line.startsWith('  file://')), [`${basename(repo.root)} · 1 skill`, 'x — Does x.']);
  assert.match(stderr, /^warning: \.claude\/skills\/x\/SKILL\.md: last update unknown: git log failed: .+$/);
  assert.match(stderr, new RegExp(tree));
});

test('a local directory outside git: no day, no warning', async (t) => {
  const copy = mkdtempSync(join(tmpdir(), 'skill-atlas-plain-'));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  cpSync(FIXTURE, copy, { recursive: true });
  const { code, stdout, stderr } = await atlas(['scan', copy]);
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /updated/);
  assert.doesNotMatch(stderr, /last update/);
  assert.match(stdout, / · 7 skills\n/);
});
