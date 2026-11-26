import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { AtlasError } from './core/errors.ts';
import { limiter } from './core/github.ts';
import { utc } from './core/model.ts';
import type { Source } from './core/scan.ts';

/** Never part of a repository's own files. */
const SKIPPED = new Set(['.git', 'node_modules']);

/** A local checkout as a repository: named after its directory, linked with file:// URLs. */
export async function openDirectory(input: string): Promise<Source> {
  const root = resolve(input);
  const name = basename(root);
  let paths: string[];
  try {
    paths = await walk(root, '');
  } catch {
    throw new AtlasError(`Not a GitHub URL or a readable directory: ${input}`);
  }
  const limit = limiter(8); // a git process per skill, a few at a time
  return {
    repository: { id: name, organization: 'local', name, url: pathToFileURL(root).href, commit: '' },
    paths,
    warnings: [],
    read: (path) => readFile(join(root, path)).then((bytes) => new Uint8Array(bytes), () => undefined),
    updated: (folders) => limit(() => lastCommit(root, folders)),
  };
}

/**
 * The time of the latest commit that touched one of the folders, from the git repository the
 * directory is in. Undefined outside a git repository, without git, or when no commit touched them.
 */
async function lastCommit(root: string, folders: string[]): Promise<string | undefined> {
  try {
    // Literal paths: a folder named `:x` or `*` is that folder, not a pattern.
    const { stdout } = await promisify(execFile)(
      'git',
      ['--literal-pathspecs', '-C', root, 'log', '-1', '--format=%cI', '--', ...folders],
      { env: gitEnv() },
    );
    return utc(stdout.trim());
  } catch {
    return undefined;
  }
}

/** Every regular file under the directory, as a path relative to the root. */
async function walk(root: string, directory: string, paths: string[] = []): Promise<string[]> {
  // One list for the whole walk: a large repository has more files than a spread can pass.
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !SKIPPED.has(entry.name)) await walk(root, path, paths);
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

/** The environment, without what would point git at another repository than the directory's own. */
function gitEnv(): NodeJS.ProcessEnv {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  return { ...env, LC_ALL: 'C' };
}
