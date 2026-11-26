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

/** `./skill-atlas scan github.com/<id>/tree/<commit>`; the three run at the same time. */
function scan(id: string, commit: string) {
  if (!token) return Promise.reject(new Error('set GITHUB_TOKEN: a fixed commit of a large repository is listed through the API'));
  return promisify(execFile)(ATLAS, ['scan', `github.com/${id}/tree/${commit}`], { env: { ...process.env, GITHUB_TOKEN: token } });
}
const scans = { mps: scan('JetBrains/MPS', MPS), android: scan('JetBrains/android', ANDROID), koog: scan('JetBrains/koog', KOOG) };
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
      'android-studio-diagnostics-analysis — Analyzes Android Studio diagnostic logs and thread dumps to identify UI freezes, lock contention, and system configuration issues.',
      link('android-studio-diagnostics-analysis'),
      'jewel-swing-interop — Integrate Jewel Compose UI with Swing in IntelliJ Platform plugins or desktop apps.',
      link('jewel-swing-interop'),
      'jewel-ui — Build or modify Compose Desktop UI using JetBrains Jewel components, theming, and icon loading.',
      link('jewel-ui'),
      // Named in its front matter, not after its directory.
      'write-evals — Expertise in building new AI agent evaluations (evals) for Android Studio.',
      link('android-studio-evals'),
      'writing-lint-checks — Helps to write a new lint check under `/tools/base/lint/libs/lint-checks`.',
      link('writing-lint-checks'),
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
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
      blob('JetBrains/koog', KOOG, '.claude/skills/split-jvm-nonjvm/SKILL.md'),
      '',
    ].join('\n'),
  );
});
