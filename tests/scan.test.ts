// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. The edge cases of
// where skills live are in tests/find.test.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { scan } from '../src/core/scan.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, history } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      '  updated 2026-11-20',
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  // The day each skill last changed comes from this checkout's history (tests/updated.test.ts has fixed ones):
  // here, only that it is a day, last in its skill.
  const lines = fixture.stdout.split('\n');
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith('  updated ')) continue;
    assert.match(line, /^  updated \d{4}-\d{2}-\d{2}$/);
    assert.ok(i + 1 === lines.length || !lines[i + 1].startsWith('  '), 'the last line of its skill');
  }
  assert.equal(
    lines.filter((line) => !line.startsWith('  updated ')).join('\n'),
    [
      'fixture · 7 skills',
      'aspect-generator — Generate a language aspect.',
      `  ${root}/plugins/mcp-tools/resources/skills/aspect-generator/SKILL.md`,
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      'lint-checks — Write a lint check for this repository.',
      `  ${root}/agent/skills/lint-checks/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
      'reviews — Review a change the way this repository does.',
      `  ${root}/.agents/skills/reviews/SKILL.md`,
      '  also in .claude/skills/reviews/SKILL.md',
      "run-tests — Run the project's tests.",
      `  ${root}/.claude/skills/run-tests/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('a private repository: with GITHUB_TOKEN, its SKILL.md files are read with the token too', async () => {
  // What GitHub answers for a private repository: raw files are a 404 without the token.
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const recorded = replay({
    'https://api.github.com/repos/JetBrains/private': { status: 200, body: { full_name: 'JetBrains/private', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/private/commits/main': { status: 200, body: { sha: commit } },
    'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/private&per_page=100&page=1': {
      status: 200,
      body: { total_count: 1, items: [{ path: '.claude/skills/secret/SKILL.md' }] },
    },
    ...history('JetBrains/private', '.claude/skills/secret', '2026-05-04T03:02:01Z', commit),
  });
  const raw = `https://raw.githubusercontent.com/JetBrains/private/${commit}/.claude/skills/secret/SKILL.md`;
  const github = (token: string) =>
    openGitHub('https://github.com/JetBrains/private', {
      token,
      fetch: async (url, init) => {
        if (url !== raw) return recorded(url, init);
        const authorized = init?.headers?.Authorization === `Bearer ${token}`;
        return authorized ? new Response('---\nname: secret\ndescription: Private.\n---\n') : new Response('404: Not Found', { status: 404 });
      },
    });
  const result = await scan(await github('test'));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.skills.map((skill) => [skill.name, skill.description, skill.updated]), [['secret', 'Private.', '2026-05-04T03:02:01Z']]);
});
