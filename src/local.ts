import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { access, constants, readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { AtlasError, UnreadableError } from './core/errors.ts';
import { limiter } from './core/github.ts';
import { utc } from './core/model.ts';
import type { Source } from './core/scan.ts';

/** Never part of a repository's own files. */
const SKIPPED = new Set(['.git', 'node_modules']);

/** A local checkout as a repository: named after its directory, linked with file:// URLs. */
export async function openDirectory(input: string): Promise<Source> {
  const root = resolve(input);
  const name = basename(root);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    throw new AtlasError(`Not a GitHub URL or a readable directory: ${input}`);
  }
  const paths: string[] = [];
  const warnings: string[] = [];
  await walk(root, '', entries, paths, warnings);
  const limit = limiter(8); // a git process per skill, a few at a time
  let boundary: Promise<string[]> | undefined;
  const shallow = () => (boundary ??= shallowCommits(root)); // read once, when the first skill asks
  return {
    repository: { id: name, organization: 'local', name, url: pathToFileURL(root).href, commit: '' },
    paths,
    warnings,
    read: (path) => readFile(join(root, path)).then((bytes) => new Uint8Array(bytes), (error) => missing(error, path)),
    updated: (folders) => limit(() => lastCommit(root, folders, shallow)),
  };
}

/** A file gone since the listing is not there: undefined. One there but not readable (`chmod 000`) says so. */
function missing(error: unknown, path: string): undefined {
  const { code } = error as { code?: unknown };
  if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
  throw new UnreadableError(`${path}: not readable; skipped`);
}

/**
 * The time of the latest commit that touched one of the folders, from the git repository the
 * directory is in. Undefined outside a git repository, without git, or when no commit touched them
 * (none at all yet, too);
 * undefined too when that commit is where a shallow clone's history stops: it adds every file, and
 * the real change is older than the clone. A history git fails to read is an AtlasError, with git's message.
 */
async function lastCommit(root: string, folders: string[], shallow: () => Promise<string[]>): Promise<string | undefined> {
  let found: string;
  try {
    found = await git(root, ['log', '-1', '--format=%H %cI', '--', ...folders]);
  } catch (error) {
    if (outsideGit(error) || noCommitYet(error)) return undefined;
    throw new AtlasError(`git log failed: ${gitMessage(error)}`);
  }
  const [hash, time] = found.split(' ');
  if (!hash || (await shallow()).includes(hash)) return undefined;
  return utc(time);
}

/** No git to run, or a directory in no git repository: there is no history, which is no failure. */
function outsideGit(error: unknown): boolean {
  const { code, stderr } = error as { code?: unknown; stderr?: unknown };
  return code === 'ENOENT' || (typeof stderr === 'string' && /not a git repository/i.test(stderr));
}

/** A repository with no commit yet (`git init` only): nothing in it is committed, so nothing has a date. */
function noCommitYet(error: unknown): boolean {
  const { stderr } = error as { stderr?: unknown };
  return typeof stderr === 'string' && /does not have any commits yet/i.test(stderr);
}

/** What git said, on one line: its first error (`detected dubious ownership in repository at '/x'`). */
function gitMessage(error: unknown): string {
  const { stderr } = error as { stderr?: unknown };
  const line = typeof stderr === 'string' ? stderr.split('\n').find((text) => /^(fatal|error):/.test(text)) : undefined;
  return line?.replace(/^(fatal|error):\s*/, '').trim() || (error instanceof Error ? error.message : String(error));
}

/** The commits where the repository's history stops, in a shallow clone (`.git/shallow`); none in a full one. */
async function shallowCommits(root: string): Promise<string[]> {
  try {
    const file = await git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'shallow']);
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Runs git in the directory; its output, trimmed. Literal paths: a folder named `:x` or `*` is that folder, not a pattern. */
async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)('git', ['--literal-pathspecs', '-C', root, ...args], { env: gitEnv() });
  return stdout.trim();
}

/**
 * Every regular file under the directory, as a path relative to the root, from its entries.
 * A folder that cannot be read (a root-owned Docker volume) is a warning, and the walk goes on;
 * so is one that can be listed but not entered (`r` without `x`): none of its files could be read.
 */
async function walk(root: string, directory: string, entries: Dirent[], paths: string[], warnings: string[]): Promise<void> {
  // One list for the whole walk: a large repository has more files than a spread can pass.
  for (const entry of entries) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !SKIPPED.has(entry.name)) {
      let inside: Dirent[];
      try {
        inside = await readdir(join(root, path), { withFileTypes: true });
        await access(join(root, path), constants.X_OK);
      } catch {
        warnings.push(`${path}: not readable; skipped`);
        continue;
      }
      await walk(root, path, inside, paths, warnings);
    } else if (entry.isFile()) paths.push(path);
  }
}

/** The environment, without what would point git at another repository than the directory's own. */
function gitEnv(): NodeJS.ProcessEnv {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  return { ...env, LC_ALL: 'C' };
}
