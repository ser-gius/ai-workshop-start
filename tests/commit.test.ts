// `github.com/<owner>/<repo>/tree/<commit>`: the scan at a fixed commit, on recorded GitHub answers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGitHubUrl } from '../src/core/github.ts';
import type { Recording } from '../src/core/replay.ts';
import { atlasOn, history } from './helpers.ts';

const COMMIT = '1cbf7f783dbc5c74c8e5231d31f61b02829143de';
const API = 'https://api.github.com/repos/JetBrains/MPS';
const tree = (truncated: boolean, entries: [path: string, type: 'blob' | 'tree', sha: string][]) => ({
  status: 200,
  body: { truncated, tree: entries.map(([path, type, sha]) => ({ path, type, sha, mode: type === 'tree' ? '040000' : '100644' })) },
});

/**
 * JetBrains/MPS at COMMIT, a tree too large for one answer: listed one directory at a time.
 * No code search is recorded: it sees only the default branch.
 */
const PINNED: Recording = {
  [API]: { status: 200, body: { full_name: 'JetBrains/MPS', default_branch: 'master' } },
  [`${API}/commits/${COMMIT}`]: { status: 200, body: { sha: COMMIT } },
  [`${API}/git/trees/${COMMIT}?recursive=1`]: tree(true, [['README.md', 'blob', 'r']]),
  [`${API}/git/trees/${COMMIT}`]: tree(false, [
    ['README.md', 'blob', 'r'],
    ['.agents', 'tree', 'agents'],
    ['plugins', 'tree', 'plugins'],
  ]),
  [`${API}/git/trees/agents?recursive=1`]: tree(false, [
    ['skills', 'tree', 's'],
    ['skills/mps-tests', 'tree', 't'],
    ['skills/mps-tests/SKILL.md', 'blob', 'm'],
  ]),
  // Still too large: one level further down.
  [`${API}/git/trees/plugins?recursive=1`]: tree(true, []),
  [`${API}/git/trees/plugins`]: tree(false, [['mcp-tools', 'tree', 'mcp']]),
  [`${API}/git/trees/mcp?recursive=1`]: tree(false, [['skills/mps-tests/SKILL.md', 'blob', 'p']]),
  [`https://raw.githubusercontent.com/JetBrains/MPS/${COMMIT}/.agents/skills/mps-tests/SKILL.md`]: {
    status: 200,
    body: '---\nname: mps-tests\ndescription: Write MPS tests. Use for every test.\n---\n',
  },
  [`https://raw.githubusercontent.com/JetBrains/MPS/${COMMIT}/plugins/mcp-tools/skills/mps-tests/SKILL.md`]: {
    status: 200,
    body: '---\nname: mps-tests\ndescription: Write MPS tests. Use for every test.\n---\n',
  },
  // Each folder's history up to that commit, not the default branch's.
  ...history('JetBrains/MPS', '.agents/skills/mps-tests', '2026-04-14T17:22:41Z', COMMIT),
  ...history('JetBrains/MPS', 'plugins/mcp-tools/skills/mps-tests', '2026-03-01T10:00:00Z', COMMIT),
};

test('a GitHub URL with /tree/<commit> pins the commit', () => {
  assert.deepEqual(parseGitHubUrl(`github.com/JetBrains/MPS/tree/${COMMIT}`), { owner: 'JetBrains', repo: 'MPS', ref: COMMIT });
  assert.deepEqual(parseGitHubUrl(`https://github.com/JetBrains/MPS/tree/${COMMIT}/`), { owner: 'JetBrains', repo: 'MPS', ref: COMMIT });
  assert.deepEqual(parseGitHubUrl('https://github.com/JetBrains/MPS.git'), { owner: 'JetBrains', repo: 'MPS' });
});

test('scan at a fixed commit: the whole tree, a directory at a time when large; links pin that commit', async () => {
  const scanned = await atlasOn(PINNED, `github.com/JetBrains/MPS/tree/${COMMIT}`);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stderr, '');
  assert.equal(
    scanned.stdout,
    [
      'JetBrains/MPS · 1 skill',
      'mps-tests — Write MPS tests.',
      `  https://github.com/JetBrains/MPS/blob/${COMMIT}/.agents/skills/mps-tests/SKILL.md`,
      '  also in plugins/mcp-tools/skills/mps-tests/SKILL.md',
      '  updated 2026-04-14',
    ].join('\n'),
  );
});

test('an unknown commit → a clear message, exit code 1', async () => {
  // What GitHub answers for a commit, branch or tag that does not exist.
  const missing = await atlasOn(
    { [API]: PINNED[API], [`${API}/commits/0000000`]: { status: 422, body: { message: 'No commit found for SHA: 0000000' } } },
    'github.com/JetBrains/MPS/tree/0000000',
  );
  assert.equal(missing.code, 1);
  assert.equal(missing.stderr, 'Commit not found: https://github.com/JetBrains/MPS/tree/0000000');
});
