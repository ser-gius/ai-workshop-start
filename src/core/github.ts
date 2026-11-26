import { AtlasError, EmptyRepositoryError, UnavailableError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { OrganizationSource, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /**
   * With a token, the default branch is searched through code search, and a fixed commit's tree
   * is listed whole; without it, both go through the tree, only the skill roots when it is large.
   */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`;
 * `…/tree/<commit>` pins a commit (or a branch or a tag).
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^\s?#]+?))?\/?$/i.exec(
    input.trim(),
  );
  if (!match) return undefined;
  return match[3] ? { owner: match[1], repo: match[2], ref: match[3] } : { owner: match[1], repo: match[2] };
}

/** `https://github.com/<owner>`, with or without the scheme or a trailing slash: an organization, or a user. */
export function parseGitHubOwnerUrl(input: string): { owner: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/?$/i.exec(input.trim());
  return match ? { owner: match[1] } : undefined;
}

/** Resolves the default branch, or the URL's commit, to a commit and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const notFound = `Repository not found: https://github.com/${name.owner}/${name.repo}`;
  // `.` and `..` are no name: the URL would resolve to another API path.
  if (/^\.+$/.test(name.owner) || /^\.+$/.test(name.repo)) throw new AtlasError(notFound);
  const github = client(options);
  const info = await github.json<{ full_name: string; default_branch: string }>(`${API}/repos/${name.owner}/${name.repo}`, notFound);
  const id = info.full_name;
  const sha = await commit(github, id, name.ref ?? info.default_branch);
  const warnings: string[] = [];
  // Code search sees only the default branch: a fixed commit is listed through its tree.
  const paths = !options.token
    ? await treePaths(github, id, sha, warnings)
    : name.ref
      ? await wholeTree(github, id, sha)
      : await searchPaths(github, id);
  return source(github, id, sha, paths, warnings);
}

/** A repository as GitHub lists it among its owner's. */
type ListedRepository = { full_name: string; default_branch: string; fork: boolean };

/** Up to this many repositories, an organization is listed through each one's tree; above, through one code search. */
export const SEARCH_ABOVE = 20;

/**
 * Every repository of an organization (or a user), forks left out, at its default branch. A large
 * organization, with a token: one code search over the whole organization finds the SKILL.md files,
 * and only the repositories it finds are read. A small one, or without a token: each repository is
 * listed through its tree, as a fixed commit is; code search has a tight limit of its own.
 */
export async function openOrganization(input: string, options: GitHubOptions): Promise<OrganizationSource> {
  const name = parseGitHubOwnerUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub organization URL: ${input}`);
  const notFound = `Organization not found: https://github.com/${name.owner}`;
  // `.` and `..` are no owner: `/users/..` is the API's root, which answers without a login.
  if (/^\.+$/.test(name.owner)) throw new AtlasError(notFound);
  const github = client(options);
  const owner = await github.json<{ login?: string; type: string; public_repos?: number }>(`${API}/users/${name.owner}`, notFound);
  if (typeof owner.login !== 'string') throw new AtlasError(notFound);
  const organization = owner.type === 'Organization';
  const warnings: string[] = [];
  const listed = await listRepositories(github, `${API}/${organization ? 'orgs' : 'users'}/${owner.login}/repos`, owner.public_repos ?? 0);
  const repositories = listed.filter((repository) => !repository.fork);
  const found =
    options.token && repositories.length > SEARCH_ABOVE
      ? await searchOwner(github, `${organization ? 'org' : 'user'}:${owner.login}`, warnings)
      : undefined;
  return {
    organization: { id: owner.login, url: `https://github.com/${owner.login}` },
    repositories: repositories.length,
    sources: repositories
      .filter((repository) => !found || found.has(repository.full_name))
      .map(({ full_name: id, default_branch: branch }) => ({
        id,
        open: async () => {
          const sha = await commit(github, id, branch);
          const repositoryWarnings: string[] = [];
          // With a token, the whole tree, a directory at a time if need be; without, the skill roots of a large one.
          const paths =
            found?.get(id) ?? (options.token ? await wholeTree(github, id, sha) : await treePaths(github, id, sha, repositoryWarnings));
          return source(github, id, sha, paths, repositoryWarnings);
        },
      })),
    warnings,
  };
}

/**
 * The owner's repositories, 100 a page: the pages its public repositories need, at once; then, while a
 * page is full (private repositories the token sees), the next one.
 */
async function listRepositories(github: Client, url: string, expected: number): Promise<ListedRepository[]> {
  const page = (n: number) => github.json<ListedRepository[]>(`${url}?per_page=100&page=${n}`);
  const pages = await Promise.all(Array.from({ length: Math.max(1, Math.ceil(expected / 100)) }, (_, i) => page(i + 1)));
  while (pages.at(-1)!.length === 100) pages.push(await page(pages.length + 1));
  return pages.flat();
}

/** The ref's commit; an empty repository has none. */
async function commit(github: Client, id: string, ref: string): Promise<string> {
  const { sha } = await github.json<{ sha: string }>(
    `${API}/repos/${id}/commits/${encodePath(ref)}`,
    `Commit not found: https://github.com/${id}/tree/${ref}`,
  );
  return sha;
}

/** The repository at the commit: these files, read from there. */
function source(github: Client, id: string, sha: string, paths: string[], warnings: string[]): Source {
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/** One of the user's repositories, as the web view suggests it. */
export type UserRepository = { full_name: string; url: string; description: string };

/** The user's repositories and, without a token, a hint instead. */
export type UserRepositories = { repositories: UserRepository[]; hint?: string };

/** At most this many pages of 100: enough to suggest, few requests. */
const REPOSITORY_PAGES = 3;

/**
 * The token's user's repositories, most recently pushed first, 100 a page. Without a token there
 * is no user: no repositories, and a hint. A GitHub failure is an AtlasError, as elsewhere.
 */
export async function userRepositories(options: GitHubOptions): Promise<UserRepositories> {
  if (!options.token) return { repositories: [], hint: 'Set GITHUB_TOKEN to see your repositories' };
  const github = client(options);
  const repositories: UserRepository[] = [];
  for (let page = 1; page <= REPOSITORY_PAGES; page++) {
    const items = await github.json<{ full_name: string; description: string | null }[]>(
      `${API}/user/repos?sort=pushed&per_page=100&page=${page}`,
    );
    for (const item of items) {
      repositories.push({ full_name: item.full_name, url: `https://github.com/${item.full_name}`, description: item.description ?? '' });
    }
    if (items.length < 100) break;
  }
  return { repositories };
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

/** GitHub returns at most 1000 code search results: ten pages of 100. */
const SEARCH_LIMIT = 1000;

/** One code search over every repository of the owner (`org:<owner>` or `user:<owner>`): SKILL.md paths by repository. */
async function searchOwner(github: Client, qualifier: string, warnings: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, Set<string>>(); // pages can repeat a result
  for (let page = 1; page * 100 <= SEARCH_LIMIT; page++) {
    const result = await github.json<{ total_count: number; items: { path: string; repository: { full_name: string } }[] }>(
      `${API}/search/code?q=filename:SKILL.md+${qualifier}&per_page=100&page=${page}`,
    );
    for (const item of result.items) {
      const id = item.repository.full_name;
      found.set(id, (found.get(id) ?? new Set()).add(item.path));
    }
    if (page === 1 && result.total_count > SEARCH_LIMIT) {
      warnings.push(`code search lists at most ${SEARCH_LIMIT} SKILL.md files, and there are ${result.total_count}: some skills may be missing`);
    }
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return new Map([...found].map(([id, paths]) => [id, [...paths]]));
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[]): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (GITHUB_TOKEN searches everywhere)`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Every file in the tree: at once, or one directory at a time when it is too large for one answer. */
async function wholeTree(github: Client, id: string, sha: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  const top = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}`);
  const directories = top.tree.filter((item) => item.type === 'tree');
  const below = await Promise.all(
    directories.map(async (item) => (await wholeTree(github, id, item.sha)).map((path) => `${item.path}/${path}`)),
  );
  return [...files(top), ...below.flat()];
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root
  // GitHub turns away too many API requests at once (a secondary rate limit): a few at a time.
  const limit = limiter(20);
  // Once GitHub turns the scan away, every later request would be turned away too: none is sent.
  let stopped: UnavailableError | undefined;
  const stop = (message: string) => {
    stopped ??= new UnavailableError(message);
    return stopped;
  };

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    if (stopped) throw stopped;
    try {
      return await fetch(url, init);
    } catch (error) {
      throw stop(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string, attempt = 1): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    // An unknown commit, branch or tag is a 422, not a 404.
    if (response.status === 404 || (response.status === 422 && /no commit found/i.test(text))) throw new AtlasError(notFound);
    if (response.status === 409 && /repository is empty/i.test(text)) {
      const id = /\/repos\/([^/]+\/[^/]+)\//.exec(url)?.[1];
      throw new EmptyRepositoryError(`Repository is empty: https://github.com/${id}`);
    }
    if (response.status === 429 || (response.status === 403 && (/rate limit/i.test(text) || response.headers.has('retry-after')))) {
      // A short wait, as GitHub asks for it, is worth it: code search allows only 10 requests a minute.
      const wait = retryAfter(response, text);
      if (wait !== undefined && wait <= RETRY_WAIT && attempt < RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, wait + RETRY_MARGIN));
        return request(url, notFound, attempt + 1);
      }
      // How long, when GitHub says and it is longer than a minute: GitHub's wait, without the margin.
      const later = wait !== undefined && wait > RETRY_WAIT ? `${Math.ceil(wait / 60_000)} minutes` : 'a minute';
      // Which of GitHub's limits (core, search, …), when it says: a CI log then tells them apart.
      const resource = response.headers.get('x-ratelimit-resource');
      const which = resource && /^[\w-]+$/.test(resource) ? ` (the ${resource} limit)` : '';
      throw stop(`GitHub rate limit reached${which}; ${token ? `try again in ${later}` : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw stop('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, limit(() => request(url, notFound)));
      return answers.get(url) as Promise<T>;
    },
    /**
     * A file's bytes at the scanned commit, or undefined if it is not there. With the token: a private
     * repository's files are a 404 without it, though code search, with it, lists them.
     */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

/** A rate limit that lifts within this many milliseconds is waited for; a longer one stops the scan. */
const RETRY_WAIT = 60_000;
/** Each request at most this many times: the first, and two after a wait. */
const RETRY_ATTEMPTS = 3;
/** A little more than GitHub asks to wait, so that the limit has lifted when asked again. */
const RETRY_MARGIN = 500;

/**
 * How long GitHub asks to wait, in milliseconds: its `Retry-After`, the "try again in 13.7s" of a
 * code search, or until the reset of a used-up limit. Undefined if it does not say.
 */
function retryAfter(response: Response, text: string): number | undefined {
  const header = response.headers.get('retry-after');
  if (header && /^\d+$/.test(header)) return Number(header) * 1000;
  const said = /try again in ([\d.]+)\s*s/i.exec(text);
  if (said) return Number(said[1]) * 1000;
  const reset = response.headers.get('x-ratelimit-reset');
  if (response.headers.get('x-ratelimit-remaining') === '0' && reset && /^\d+$/.test(reset)) {
    return Math.max(0, Number(reset) * 1000 - Date.now());
  }
  return undefined;
}

/** Runs at most `size` tasks at a time; the rest wait their turn. */
function limiter(size: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    // A finished task hands its turn straight to the next one waiting.
    if (running < size) running++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
