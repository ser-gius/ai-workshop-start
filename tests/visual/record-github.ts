// Records what GitHub answers for the demo's scans into github.json, so the visual tests replay the
// same data on every run: `GITHUB_TOKEN=$(gh auth token) node tests/visual/record-github.ts`.
// Only the fields Skill Atlas reads are kept. Run it again only to move the data on; the baselines change with it.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { openGitHub, openOrganization, type Fetch } from '../../src/core/github.ts';
import type { Recording } from '../../src/core/replay.ts';
import { scan, scanOrganization } from '../../src/core/scan.ts';
import { DEMO_ORGANIZATION, DEMO_REPOSITORY, RECORDING } from './data.ts';

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('set GITHUB_TOKEN: the demo scans an organization through code search');

const KEPT = new Set(['full_name', 'default_branch', 'fork', 'login', 'type', 'public_repos', 'sha', 'total_count', 'items',
  'path', 'repository', 'truncated', 'tree', 'mode', 'message']);
const trim = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(trim)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([key]) => KEPT.has(key)).map(([key, inner]) => [key, trim(inner)]))
      : value;

// The token may see private and internal repositories: GitHub answers here as if they did not exist,
// so nothing of theirs is recorded (this repository is public).
type Listed = { private?: boolean; repository?: { private?: boolean } };
const isPublic = (item: Listed) => !(item.private ?? item.repository?.private ?? true);
const SEARCH = /^(.*&per_page=100&page=)(\d+)$/;
const searches = new Map<string, Promise<{ total_count: number; items: Listed[] }>>();
/** Every public result of a code search, all its pages at once; then paged again, 100 a page. */
function searched(url: string, init?: Parameters<Fetch>[1]) {
  const [, prefix, page] = SEARCH.exec(url)!;
  if (!searches.has(prefix)) {
    searches.set(prefix, (async () => {
      const items: Listed[] = [];
      for (let n = 1; n <= 10; n++) {
        const result = await (await fetch(`${prefix}${n}`, init)).json();
        if (!Array.isArray(result.items)) throw new Error(`code search failed: ${JSON.stringify(result)}`);
        items.push(...result.items.filter(isPublic));
        if (result.items.length < 100 || n * 100 >= result.total_count) break;
      }
      return { total_count: items.length, items };
    })());
  }
  return searches.get(prefix)!.then(({ total_count, items }) => ({ total_count, items: items.slice((Number(page) - 1) * 100, Number(page) * 100) }));
}

const recording: Recording = {};
const recorded: Fetch = async (url, init) => {
  let status: number;
  let body: unknown;
  if (url.includes('/search/code?')) {
    [status, body] = [200, await searched(url, init)];
  } else {
    const response = await fetch(url, init);
    const text = await response.text();
    status = response.status;
    body = response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
    if (/\/(orgs|users)\/[^/]+\/repos\?/.test(url) && Array.isArray(body)) body = body.filter(isPublic);
  }
  if (typeof body === 'object' && body !== null) body = trim(body);
  recording[url] = { status, body };
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};

await scan(await openGitHub(DEMO_REPOSITORY, { fetch: recorded, token }));
await scanOrganization(await openOrganization(DEMO_ORGANIZATION, { fetch: recorded, token }));
const sorted = Object.fromEntries(Object.entries(recording).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(RECORDING, gzipSync(JSON.stringify(sorted, null, 1)));
console.log(`${Object.keys(sorted).length} answers in ${RECORDING}`);
