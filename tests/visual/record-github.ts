// Records what GitHub answers for the demo's scans into github.json.gz, so the visual tests replay the
// same data on every run: `GITHUB_TOKEN=$(gh auth token) node tests/visual/record-github.ts`.
// Only the fields Skill Atlas reads are kept. Run it again only to move the data on; the baselines change with it.
// `--missing` keeps what is recorded and asks GitHub only for what the scans now ask and it lacks: the same
// data, a few more answers.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { openGitHub, openOrganization, type Fetch } from '../../src/core/github.ts';
import type { Recording } from '../../src/core/replay.ts';
import { scan, scanOrganization } from '../../src/core/scan.ts';
import { DEMO_ORGANIZATION, DEMO_REPOSITORY, RECORDING, recording as recordedBefore } from './data.ts';

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('set GITHUB_TOKEN: the demo scans an organization through code search');

const KEPT = new Set(['full_name', 'default_branch', 'fork', 'login', 'type', 'public_repos', 'sha', 'total_count', 'items',
  'path', 'repository', 'truncated', 'tree', 'mode', 'message']);
const trim = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(trim)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([key]) => KEPT.has(key)).map(([key, inner]) => [key, trim(inner)]))
      : value;

/** A folder's history, one commit a page (`/repos/<id>/commits?…&path=…`): only each commit's date is read. */
const HISTORY = /\/repos\/[^/]+\/[^/]+\/commits\?/;
type Commit = { commit?: { committer?: { date?: string } } };
const history = (body: unknown): unknown =>
  Array.isArray(body) ? body.map((item: Commit) => ({ commit: { committer: { date: item.commit?.committer?.date } } })) : trim(body);

// The token may see private and internal repositories: GitHub answers here as if they did not exist,
// so nothing of theirs is recorded (this repository is public).
type Listed = { private?: boolean; repository?: { private?: boolean } };
const isPublic = (item: Listed) => !(item.private ?? item.repository?.private ?? true);
const PAGED = /^(.*per_page=100&page=)(\d+)$/;
const paged = new Map<string, Promise<Listed[]>>();
/**
 * Every public item of a paged answer, all its pages at once (a page counts private ones too, so a short
 * page of public ones is not the last); then paged again, 100 a page, as GitHub pages them for the public.
 */
async function repaged(url: string, init: Parameters<Fetch>[1], all: (prefix: string) => Promise<Listed[]>) {
  const [, prefix, page] = PAGED.exec(url)!;
  if (!paged.has(prefix)) paged.set(prefix, all(prefix).then((items) => items.filter(isPublic)));
  const items = await paged.get(prefix)!;
  return { items: items.slice((Number(page) - 1) * 100, Number(page) * 100), total: items.length };
}
/** The JSON answer; a rate limit (code search's is short) is waited out, as long as GitHub says. */
async function json(url: string, init: Parameters<Fetch>[1]) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response.json();
    const text = await response.text();
    const wait = Number(response.headers.get('retry-after') ?? /try again in ([\d.]+)s/.exec(text)?.[1] ?? NaN);
    if (![403, 429].includes(response.status) || !(wait >= 0) || attempt === 10) throw new Error(`${url}: ${response.status} ${text}`);
    console.log(`rate limited, waiting ${Math.ceil(wait)} s`);
    await new Promise((resolve) => setTimeout(resolve, (Math.ceil(wait) + 1) * 1000));
  }
}
/** A code search's results: at most 10 pages. */
const searched = (init: Parameters<Fetch>[1]) => async (prefix: string) => {
  const items: Listed[] = [];
  for (let n = 1; n <= 10; n++) {
    const result = await json(`${prefix}${n}`, init);
    if (!Array.isArray(result.items)) throw new Error(`code search failed: ${JSON.stringify(result)}`);
    items.push(...result.items);
    if (result.items.length < 100 || n * 100 >= result.total_count) break;
  }
  return items;
};
/** An owner's repositories: every page, to the first short one. */
const listed = (init: Parameters<Fetch>[1]) => async (prefix: string) => {
  const items: Listed[] = [];
  for (let n = 1; ; n++) {
    const page: Listed[] = await json(`${prefix}${n}`, init);
    items.push(...page);
    if (page.length < 100) return items;
  }
};

const recording: Recording = process.argv.includes('--missing') ? recordedBefore() : {};
const recorded: Fetch = async (url, init) => {
  let status: number;
  let body: unknown;
  if (Object.hasOwn(recording, url)) {
    ({ status, body } = recording[url]);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }
  if (url.includes('/search/code?')) {
    const { items, total } = await repaged(url, init, searched(init));
    [status, body] = [200, { total_count: total, items }];
  } else if (/\/(orgs|users)\/[^/]+\/repos\?/.test(url)) {
    [status, body] = [200, (await repaged(url, init, listed(init))).items];
  } else {
    const response = await fetch(url, init);
    const text = await response.text();
    status = response.status;
    body = response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  }
  if (typeof body === 'object' && body !== null) body = HISTORY.test(url) ? history(body) : trim(body);
  recording[url] = { status, body };
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};

await scan(await openGitHub(DEMO_REPOSITORY, { fetch: recorded, token }));
await scanOrganization(await openOrganization(DEMO_ORGANIZATION, { fetch: recorded, token }));
// Answers recorded before only their dates were kept, kept the same way now.
for (const [url, answer] of Object.entries(recording)) if (HISTORY.test(url)) answer.body = history(answer.body);
const sorted = Object.fromEntries(Object.entries(recording).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(RECORDING, gzipSync(JSON.stringify(sorted, null, 1)));
console.log(`${Object.keys(sorted).length} answers in ${RECORDING}`);
