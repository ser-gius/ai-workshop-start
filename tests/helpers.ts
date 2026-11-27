// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, openOrganization, parseGitHubOwnerUrl, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** A folder's history up to the commit, one commit a page, as GitHub is asked for it. */
export const historyUrl = (id: string, folder: string, commit = EXAMPLE_COMMIT) =>
  `https://api.github.com/repos/${id}/commits?sha=${commit}&path=${folder}&per_page=1`;

/** What GitHub answers for a folder's history: its latest commit, committed at `date`; none if undefined. */
export function history(id: string, folder: string, date: string | undefined, commit = EXAMPLE_COMMIT): Recording {
  const commits = date === undefined ? [] : [{ sha: 'c0ffee', commit: { committer: { date }, author: { date: '2000-01-01T00:00:00Z' } } }];
  return { [historyUrl(id, folder, commit)]: { status: 200, body: commits } };
}

/** When JetBrains/example's skill last changed. */
export const EXAMPLE_UPDATED = '2026-11-20T09:14:03Z';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  ...history('JetBrains/example', '.claude/skills/commits', EXAMPLE_UPDATED),
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

/** Opens a GitHub URL as the CLI does, with GitHub answering from EXAMPLE and ORGANIZATION, or a local directory. */
// With a token, through code search, as EXAMPLE and ORGANIZATION answer it.
export const open = (input: string) => {
  // Defined below: read when a test opens a URL, after the module has loaded.
  const github = replay({ ...EXAMPLE, ...ORGANIZATION });
  if (parseGitHubUrl(input)) return openGitHub(input, { fetch: github, token: 'test' });
  if (parseGitHubOwnerUrl(input)) return openOrganization(input, { fetch: github, token: 'test' });
  return openDirectory(input);
};

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** What GitHub answers, through code search, for a repository with these SKILL.md files at EXAMPLE_COMMIT, each folder last changed at EXAMPLE_UPDATED. */
export function recordRepository(id: string, files: Record<string, string>): Recording {
  const recording: Recording = {
    [`https://api.github.com/repos/${id}`]: { status: 200, body: { full_name: id, default_branch: 'main' } },
    [`https://api.github.com/repos/${id}/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`https://api.github.com/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=1`]: {
      status: 200,
      body: { total_count: Object.keys(files).length, items: Object.keys(files).map((path) => ({ path })) },
    },
  };
  for (const [path, body] of Object.entries(files)) {
    recording[`https://raw.githubusercontent.com/${id}/${EXAMPLE_COMMIT}/${path}`] = { status: 200, body };
    Object.assign(recording, history(id, path.slice(0, path.lastIndexOf('/')), EXAMPLE_UPDATED));
  }
  return recording;
}

/** A page of the token's user's repositories, most recently pushed first, as GitHub is asked for it. */
export const userReposUrl = (page: number) => `https://api.github.com/user/repos?sort=pushed&per_page=100&page=${page}`;

/** What GitHub answers for the token's user: a full first page of 100 repositories, then one more. */
export const USER_REPOSITORIES: Recording = {
  [userReposUrl(1)]: {
    status: 200,
    body: [
      { full_name: 'JetBrains/example', description: 'A small repository with one skill' },
      ...Array.from({ length: 99 }, (_, i) => ({ full_name: `octocat/repo-${i + 1}`, description: null })),
    ],
  },
  [userReposUrl(2)]: { status: 200, body: [{ full_name: 'octocat/last', description: 'The 101st' }] },
};

/** `skill-atlas scan <url>`, with GitHub answering from the recording; with a token unless `{ token: undefined }`. */
export async function atlasOn(recording: Recording, url: string, { token }: { token?: string } = { token: 'test' }) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const options = { fetch: replay(recording), token };
  const code = await run(['scan', url], {
    open: (input) => (parseGitHubOwnerUrl(input) ? openOrganization(input, options) : openGitHub(input, options)),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

const skillMd = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n`;
const listed = (name: string, extra: { fork?: boolean; default_branch?: string } = {}) => ({
  full_name: name,
  default_branch: extra.default_branch ?? 'main',
  fork: extra.fork ?? false,
});
const raw = (id: string, path: string) => `https://raw.githubusercontent.com/${id}/${EXAMPLE_COMMIT}/${path}`;
const commitOf = (id: string, branch = 'main') => `https://api.github.com/repos/${id}/commits/${branch}`;

/** The org-wide code search, as GitHub is asked for it. */
export const searchUrl = (qualifier: string, page: number) =>
  `https://api.github.com/search/code?q=filename:SKILL.md+${qualifier}&per_page=100&page=${page}`;

/**
 * What GitHub answers, with a token, for an organization, octo-org: 102 repositories on two pages.
 * - `agents`: two skills, one with a copy, changed after its linked folder, and test data
 * - `Docs`: malformed front matter
 * - `tools`: its default branch is `trunk`
 * - `broken`: its commit is not found
 * - `fork`: a fork, with a SKILL.md; never asked for
 * - 97 others: no SKILL.md, so never asked for
 * And `no-such-org`, which GitHub does not know.
 */
export const ORGANIZATION: Recording = {
  // Two pages of public repositories, asked for at once.
  'https://api.github.com/users/octo-org': { status: 200, body: { login: 'octo-org', type: 'Organization', public_repos: 102 } },
  'https://api.github.com/users/no-such-org': { status: 404, body: { message: 'Not Found' } },
  'https://api.github.com/orgs/octo-org/repos?per_page=100&page=1': {
    status: 200,
    body: [
      listed('octo-org/agents'),
      listed('octo-org/Docs'),
      listed('octo-org/fork', { fork: true }),
      ...Array.from({ length: 97 }, (_, i) => listed(`octo-org/repo-${i + 1}`)),
    ],
  },
  'https://api.github.com/orgs/octo-org/repos?per_page=100&page=2': {
    status: 200,
    body: [listed('octo-org/broken'), listed('octo-org/tools', { default_branch: 'trunk' })],
  },
  [searchUrl('org:octo-org', 1)]: {
    status: 200,
    body: {
      total_count: 7,
      items: [
        ['octo-org/agents', '.claude/skills/commits/SKILL.md'],
        ['octo-org/agents', '.agents/skills/reviews/SKILL.md'],
        ['octo-org/agents', '.claude/skills/reviews/SKILL.md'],
        ['octo-org/agents', 'tests/skills/fake/SKILL.md'],
        ['octo-org/Docs', '.github/skills/style/SKILL.md'],
        ['octo-org/fork', '.claude/skills/forked/SKILL.md'],
        ['octo-org/broken', '.claude/skills/lost/SKILL.md'],
        ['octo-org/tools', 'agent/skills/lint/SKILL.md'],
      ].map(([full_name, path]) => ({ path, repository: { full_name } })),
    },
  },
  [commitOf('octo-org/agents')]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
  [raw('octo-org/agents', '.claude/skills/commits/SKILL.md')]: {
    status: 200,
    body: skillMd('commits', 'Write commit messages the way this organization does. Use for every commit.'),
  },
  [raw('octo-org/agents', '.agents/skills/reviews/SKILL.md')]: { status: 200, body: skillMd('reviews', 'Review a change.') },
  ...history('octo-org/agents', '.claude/skills/commits', '2026-10-01T12:00:00Z'),
  ...history('octo-org/agents', '.agents/skills/reviews', '2026-09-01T08:00:00Z'),
  ...history('octo-org/agents', '.claude/skills/reviews', '2026-09-15T23:30:00Z'),
  ...history('octo-org/Docs', '.github/skills/style', '2026-08-05T10:00:00Z'),
  ...history('octo-org/tools', 'agent/skills/lint', '2026-07-04T00:00:00Z'),
  [commitOf('octo-org/Docs')]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
  [raw('octo-org/Docs', '.github/skills/style/SKILL.md')]: { status: 200, body: '---\nname: style\ndescription: a: b: c\n---\n' },
  [commitOf('octo-org/broken')]: { status: 422, body: { message: 'No commit found for SHA: main' } },
  [commitOf('octo-org/tools', 'trunk')]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
  [raw('octo-org/tools', 'agent/skills/lint/SKILL.md')]: { status: 200, body: skillMd('lint', 'Write a lint check.') },
};

/**
 * What GitHub answers, without a token, for a user's account, octocat: each repository through its tree.
 * - `hello`: one skill
 * - `empty`: no commit yet
 * - `spoon-knife`: a fork; never asked for
 */
export const USER: Recording = {
  'https://api.github.com/users/octocat': { status: 200, body: { login: 'octocat', type: 'User' } },
  'https://api.github.com/users/octocat/repos?per_page=100&page=1': {
    status: 200,
    body: [listed('octocat/hello'), listed('octocat/empty'), listed('octocat/spoon-knife', { fork: true })],
  },
  [commitOf('octocat/hello')]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
  [`https://api.github.com/repos/octocat/hello/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
    status: 200,
    body: {
      truncated: false,
      tree: [
        { path: 'README.md', mode: '100644', type: 'blob', sha: 'r' },
        { path: '.claude/skills/greet/SKILL.md', mode: '100644', type: 'blob', sha: 'g' },
      ],
    },
  },
  [raw('octocat/hello', '.claude/skills/greet/SKILL.md')]: { status: 200, body: skillMd('greet', 'Greet the user. Use it first.') },
  ...history('octocat/hello', '.claude/skills/greet', '2026-06-30T23:59:59Z'),
  'https://api.github.com/repos/octocat/empty': { status: 200, body: { full_name: 'octocat/empty', default_branch: 'main' } },
  [commitOf('octocat/empty')]: { status: 409, body: { message: 'Git Repository is empty.' } },
};

/**
 * A `claude` of the test's own, in a directory of its own: it saves its arguments and stdin next to it,
 * then runs `body` (sh). Returns its path and what it was asked.
 */
export function stubClaude(t: Pick<TestContext, 'after'>, body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-atlas-claude-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const command = join(dir, 'claude');
  writeFileSync(command, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/args"\ncat > "${dir}/stdin"\n${body}\n`);
  chmodSync(command, 0o755);
  const read = (name: string) => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return undefined;
    }
  };
  return { dir, command, args: () => read('args')?.trim().split('\n'), stdin: () => read('stdin') };
}

/** A stub's body that answers this JSON. */
export const claudeAnswering = (answer: unknown) => `cat <<'EOF'\n${JSON.stringify(answer)}\nEOF`;
