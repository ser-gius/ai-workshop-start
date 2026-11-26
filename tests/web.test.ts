// spec/web.md: the local web view, over ./fixture and the GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { serve, type ScanAnswer } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

const { server, url } = await serve({ open, port: 0 });
test.after(() => server.close());

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
  assert.doesNotMatch(page, /innerHTML/, 'a SKILL.md is shown as text, never as HTML');
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
  assert.deepEqual(body.skills.map((skill) => skill.name), ['code-style', 'commits', 'release-checklist']);
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

test('anything else → 404; only GET', async () => {
  assert.equal((await fetch(`${url}nope`)).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
});

test('./skill-atlas serve prints its local URL and answers there', async (t) => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const printed = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('\n')) resolve(out);
    });
    child.once('exit', (code) => reject(new Error(`exited with ${code}`)));
  });
  const match = /^Skill Atlas at (http:\/\/127\.0\.0\.1:\d+\/)\n$/.exec(printed);
  assert.ok(match, printed);
  const answer = (await (await fetch(`${match[1]}api/scan?repo=${encodeURIComponent(FIXTURE)}`)).json()) as ScanAnswer;
  assert.equal(answer.skills.length, 3);
});

test('./skill-atlas serve with a wrong argument → usage, exit code 1', () => {
  const wrong = spawnSync(process.execPath, [CLI, 'serve', '--port', 'x'], { encoding: 'utf8' });
  assert.equal(wrong.status, 1);
  assert.equal(wrong.stderr, 'Usage: skill-atlas serve [--port <number>]\n');
});
