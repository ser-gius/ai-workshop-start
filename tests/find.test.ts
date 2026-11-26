// What is a project skill, and the edge cases in spec/analysis.md: on ./fixture, and on GitHub
// repositories answered from recordings shaped like the spec's examples.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { atlas, atlasOn, EXAMPLE_COMMIT, FIXTURE, recordRepository } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const root = pathToFileURL(FIXTURE).href;
const skill = (name: string, description = 'Does a thing. Use it.') => `---\nname: ${name}\ndescription: ${description}\n---\n`;
const blob = (id: string, path: string) => `https://github.com/${id}/blob/${EXAMPLE_COMMIT}/${path}`;

/** The names the scan lists, in order. */
function names(stdout: string): string[] {
  return stdout.split('\n').slice(1).filter((line) => !line.startsWith('  ')).map((line) => line.split(' — ')[0]);
}

test('a skill in each of the four roots', () => {
  assert.equal(fixture.code, 0, fixture.stderr);
  for (const path of [
    '.agents/skills/release-checklist',
    '.claude/skills/commits',
    '.github/skills/code-style',
    'agent/skills/lint-checks',
  ]) {
    assert.ok(fixture.stdout.includes(`  ${root}/${path}/SKILL.md`), path);
  }
});

test('the same <name> in two roots → one skill, linked in the first root, the other an "also in"', () => {
  const lines = fixture.stdout.split('\n');
  const at = lines.indexOf('reviews — Review a change the way this repository does.');
  assert.ok(at > 0, fixture.stdout);
  assert.deepEqual(lines.slice(at + 1, at + 3), [`  ${root}/.agents/skills/reviews/SKILL.md`, '  also in .claude/skills/reviews/SKILL.md']);
  assert.equal(names(fixture.stdout).filter((name) => name === 'reviews').length, 1);
});

test('test data → not a skill; "test" in a skill\'s own name does not matter', () => {
  assert.ok(!fixture.stdout.includes('weather-retrieval'), fixture.stdout);
  assert.ok(names(fixture.stdout).includes('run-tests'));
});

test('anything else → not a skill: outside a skills folder, or below a skill', () => {
  assert.ok(!fixture.stdout.includes('notes/SKILL.md'), fixture.stdout);
  assert.ok(!fixture.stdout.includes('commits/examples'), fixture.stdout);
  assert.deepEqual(names(fixture.stdout), [
    'aspect-generator',
    'code-style',
    'commits',
    'lint-checks',
    'release-checklist',
    'reviews',
    'run-tests',
  ]);
  assert.match(fixture.stdout, /^fixture · 7 skills\n/);
});

test('JetBrains/MPS · mps-tests: duplicates in .agents and .claude are one skill', async () => {
  const id = 'JetBrains/MPS';
  const scanned = await atlasOn(
    recordRepository(id, {
      '.claude/skills/mps-tests/SKILL.md': skill('mps-tests', 'Run the MPS tests. Use before a push.'),
      '.agents/skills/mps-tests/SKILL.md': skill('mps-tests', 'Run the MPS tests. Use before a push.'),
    }),
    `https://github.com/${id}`,
  );
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      'JetBrains/MPS · 1 skill',
      'mps-tests — Run the MPS tests.',
      `  ${blob(id, '.agents/skills/mps-tests/SKILL.md')}`,
      '  also in .claude/skills/mps-tests/SKILL.md',
    ].join('\n'),
  );
});

test('JetBrains/android · writing-lint-checks: an unusual folder, agent/skills, is a skill', async () => {
  const id = 'JetBrains/android';
  const path = 'agent/skills/writing-lint-checks/SKILL.md';
  const scanned = await atlasOn(recordRepository(id, { [path]: skill('writing-lint-checks') }), `https://github.com/${id}`);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains/android · 1 skill', 'writing-lint-checks — Does a thing.', `  ${blob(id, path)}`].join('\n'));
});

test('JetBrains/MPS · mps-aspect-generator: part of the product, in a plugin, is a skill', async () => {
  const id = 'JetBrains/MPS';
  const path = 'plugins/mcp-tools/resources/META-INF/skills/mps-aspect-generator/SKILL.md';
  const scanned = await atlasOn(recordRepository(id, { [path]: skill('mps-aspect-generator') }), `https://github.com/${id}`);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains/MPS · 1 skill', 'mps-aspect-generator — Does a thing.', `  ${blob(id, path)}`].join('\n'));
});

test('JetBrains/koog · weather-retrieval: test data is not a skill', async () => {
  const id = 'JetBrains/koog';
  const scanned = await atlasOn(
    recordRepository(id, {
      'integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md': skill('weather-retrieval'),
      'agents/src/test/resources/skills/calendar/SKILL.md': skill('calendar'),
      'examples/testData/skills/greeting/SKILL.md': skill('greeting'),
      '.claude/skills/koog-release/SKILL.md': skill('koog-release'),
    }),
    `https://github.com/${id}`,
  );
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.deepEqual(names(scanned.stdout), ['koog-release']);
  assert.match(scanned.stdout, /^JetBrains\/koog · 1 skill\n/);
});
