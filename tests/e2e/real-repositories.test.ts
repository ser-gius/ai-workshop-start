// End to end: the real CLI on real GitHub repositories, each at a fixed commit, so the answer
// never changes. Needs the network and GITHUB_TOKEN: `npm run test:e2e`.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { promisify } from 'node:util';

const ATLAS = fileURLToPath(new URL('../../skill-atlas', import.meta.url));
const token = process.env.GITHUB_TOKEN;

const MPS = '1cbf7f783dbc5c74c8e5231d31f61b02829143de';
/** The commit before 50fda4f, "Remove bundled agent skills". */
const ANDROID = '6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765';
const KOOG = '709079e4a34d6c9234583352550e6a2b88a0bb85';

/** `./skill-atlas scan github.com/<id>/tree/<commit>`; all the scans run at the same time. */
function scan(id: string, commit: string) {
  if (!token) return Promise.reject(new Error('set GITHUB_TOKEN: a fixed commit of a large repository is listed through the API'));
  return promisify(execFile)(ATLAS, ['scan', `github.com/${id}/tree/${commit}`], { env: { ...process.env, GITHUB_TOKEN: token } });
}
/** `./skill-atlas scan github.com/<owner>`: every repository at its default branch, so not pinned. */
function scanOrganization(owner: string) {
  if (!token) return Promise.reject(new Error('set GITHUB_TOKEN: each repository of the organization is listed through the API'));
  return promisify(execFile)(ATLAS, ['scan', `github.com/${owner}`], { env: { ...process.env, GITHUB_TOKEN: token } });
}
const scans = {
  mps: scan('JetBrains/MPS', MPS),
  android: scan('JetBrains/android', ANDROID),
  koog: scan('JetBrains/koog', KOOG),
  // Small, so through each repository's tree: CI's GITHUB_TOKEN gets hardly any code search.
  getnao: scanOrganization('getnao'),
};
for (const pending of Object.values(scans)) pending.catch(() => {}); // each test reports its own failure

const blob = (id: string, commit: string, path: string) => `  https://github.com/${id}/blob/${commit}/${path}`;

test('JetBrains/MPS: duplicates in .agents and .claude, and the product copies in a plugin, are one skill each', async () => {
  const { stdout, stderr } = await scans.mps;
  assert.equal(stderr, '');
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines[0], 'JetBrains/MPS · 43 skills');
  const plugin = 'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills';
  for (const name of ['mps-tests', 'mps-aspect-generator']) {
    const at = lines.findIndex((line) => line.startsWith(`${name} — `));
    assert.ok(at > 0, `${name} is listed`);
    assert.deepEqual(lines.slice(at + 1, at + 3), [
      blob('JetBrains/MPS', MPS, `.agents/skills/${name}/SKILL.md`),
      `  also in .claude/skills/${name}/SKILL.md, ${plugin}/${name}/SKILL.md`,
    ]);
  }
  // Every skill is in .agents and .claude; 33 of them are shipped in the plugin too.
  assert.equal(lines.filter((line) => line.startsWith('  also in .claude/skills/')).length, 43);
  assert.equal(lines.filter((line) => line.includes(`, ${plugin}/`)).length, 33);
});

test("JetBrains/MPS: a skill's day is its latest folder's; actions changed in .claude after .agents", async () => {
  const { stdout } = await scans.mps;
  const lines = stdout.trimEnd().split('\n');
  // Every skill has its day, the last line of its block.
  assert.equal(lines.filter((line) => /^  updated \d{4}-\d{2}-\d{2}$/.test(line)).length, 43);
  const at = lines.findIndex((line) => line.startsWith('actions — '));
  assert.ok(at > 0, 'actions is listed');
  // .agents/skills/actions last changed on 2026-04-14, its copy in .claude/skills/actions on 2026-05-21.
  assert.deepEqual(lines.slice(at + 1, at + 4), [
    blob('JetBrains/MPS', MPS, '.agents/skills/actions/SKILL.md'),
    '  also in .claude/skills/actions/SKILL.md',
    '  updated 2026-05-21',
  ]);
});

test('JetBrains/android: an unusual folder, agent/skills; the name from the front matter, else the directory', async () => {
  const { stdout, stderr } = await scans.android;
  assert.equal(stderr, '');
  const link = (directory: string) => blob('JetBrains/android', ANDROID, `agent/skills/${directory}/SKILL.md`);
  assert.equal(
    stdout,
    [
      'JetBrains/android · 6 skills',
      'android-studio-development — Specialist in Android Studio plugin development.',
      link('android-studio-development'),
      '  updated 2026-07-15',
      'android-studio-diagnostics-analysis — Analyzes Android Studio diagnostic logs and thread dumps to identify UI freezes, lock contention, and system configuration issues.',
      link('android-studio-diagnostics-analysis'),
      '  updated 2026-09-16',
      'jewel-swing-interop — Integrate Jewel Compose UI with Swing in IntelliJ Platform plugins or desktop apps.',
      link('jewel-swing-interop'),
      '  updated 2026-09-21',
      'jewel-ui — Build or modify Compose Desktop UI using JetBrains Jewel components, theming, and icon loading.',
      link('jewel-ui'),
      '  updated 2026-09-21',
      // Named in its front matter, not after its directory.
      'write-evals — Expertise in building new AI agent evaluations (evals) for Android Studio.',
      link('android-studio-evals'),
      '  updated 2026-09-07',
      'writing-lint-checks — Helps to write a new lint check under `/tools/base/lint/libs/lint-checks`.',
      link('writing-lint-checks'),
      '  updated 2026-09-21',
      '',
    ].join('\n'),
  );
});

test('JetBrains/koog: test data, weather-retrieval and arithmetic-evaluator, is not a skill', async () => {
  const { stdout, stderr } = await scans.koog;
  assert.equal(stderr, '');
  assert.equal(
    stdout,
    [
      'JetBrains/koog · 2 skills',
      'add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).',
      blob('JetBrains/koog', KOOG, '.claude/skills/add-java-code-snippets-in-docs/SKILL.md'),
      '  updated 2026-05-18',
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
      blob('JetBrains/koog', KOOG, '.claude/skills/split-jvm-nonjvm/SKILL.md'),
      '  updated 2026-03-25',
      '',
    ].join('\n'),
  );
});

test('getnao, a small organization: forks left out, grouped and sorted, each repository as its own scan at that commit', async () => {
  // The organization changes: what holds whatever its repositories hold.
  const { stdout } = await scans.getnao;
  // GitHub's own list, asked separately: the repositories that are not forks.
  const response = await fetch('https://api.github.com/orgs/getnao/repos?per_page=100', { headers: { Authorization: `Bearer ${token}` } });
  const listed = (await response.json()) as { full_name: string; fork: boolean }[];
  const own = listed.filter((repository) => !repository.fork).map((repository) => repository.full_name);
  assert.ok(own.length < listed.length, 'getnao has forks');
  assert.ok(own.length <= 20, 'small: listed through trees, not code search');

  const [header, ...blocks] = stdout.trimEnd().split('\n\n');
  const match = /^getnao · (\d+) skills? in (\d+) of (\d+) repositor(?:y|ies)$/.exec(header);
  assert.ok(match, header);
  const [skills, withSkills, repositories] = match.slice(1).map(Number);
  assert.equal(repositories, own.length, 'forks left out');
  assert.ok(withSkills >= 1, header);
  assert.equal(blocks.length, withSkills);
  const ids: string[] = [];
  let listedSkills = 0;
  for (const block of blocks) {
    const heading = /^(getnao\/[\w.-]+) · (\d+) skills?$/.exec(block.split('\n')[0]);
    assert.ok(heading, block.split('\n')[0]);
    const [, id, count] = heading;
    assert.ok(own.includes(id), `${id} is one of its own repositories`);
    ids.push(id);
    listedSkills += Number(count);
    // The block is what scanning the repository alone, at the same commit, prints.
    const commit = new RegExp(`^  https://github\\.com/${id}/blob/([0-9a-f]{40})/`, 'm').exec(block)?.[1];
    assert.ok(commit, `${id}: links pinned to the scanned commit`);
    const alone = await scan(id, commit);
    assert.equal(alone.stdout.trimEnd(), block, id);
  }
  assert.equal(listedSkills, skills);
  const key = (id: string) => id.toLowerCase();
  assert.deepEqual(ids, [...ids].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)));
});
