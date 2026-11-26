// The visual tests' recording (tests/visual/github.json.gz) answers as GitHub does for the public:
// a listing with private repositories filtered out of each page, but not paged again, stops early.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openOrganization } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { scanOrganization } from '../src/core/scan.ts';
import { DEMO_ORGANIZATION, recording } from './visual/data.ts';

const API = 'https://api.github.com';
type Repository = { full_name: string; fork?: boolean };
const listing = (answers: ReturnType<typeof recording>) =>
  Object.entries(answers)
    .filter(([url]) => url.startsWith(`${API}/orgs/JetBrains/repos?`))
    .sort(([a], [b]) => Number(/&page=(\d+)/.exec(a)![1]) - Number(/&page=(\d+)/.exec(b)![1]))
    .map(([, { body }]) => body as Repository[]);

test('the recorded listing has every public repository: full pages, as many as public_repos', () => {
  const answers = recording();
  const pages = listing(answers);
  const { public_repos } = answers[`${API}/users/JetBrains`].body as { public_repos: number };
  assert.deepEqual(pages.slice(0, -1).map((page) => page.length), Array(pages.length - 1).fill(100));
  assert.equal(pages.flat().length, public_repos);
});

test('every repository the recorded code search finds is in the recorded listing, and opened by the scan', () => {
  const answers = recording();
  const listed = new Map(listing(answers).flat().map((repository) => [repository.full_name, repository]));
  const searched = new Set(
    Object.entries(answers)
      .filter(([url]) => url.startsWith(`${API}/search/code?`) && url.includes('+org:JetBrains&'))
      .flatMap(([, { body }]) => (body as { items: { repository: Repository }[] }).items.map((item) => item.repository.full_name)),
  );
  assert.ok(searched.size > 0);
  assert.deepEqual([...searched].filter((name) => !listed.has(name)), []);
  // Opened: its commit asked for. Forks are left out of the scan.
  const opened = (name: string) => Object.keys(answers).some((url) => url.startsWith(`${API}/repos/${name}/commits/`));
  assert.deepEqual([...searched].filter((name) => !listed.get(name)!.fork && !opened(name)), []);
});

test('the recorded organization scans, without a request it did not record', async () => {
  // A request that is not recorded fails the scan: it rejects.
  const organization = await scanOrganization(await openOrganization(DEMO_ORGANIZATION, { fetch: replay(recording()), token: 'replayed' }));
  assert.ok(organization.results.length > 0);
  assert.deepEqual(organization.warnings.filter((warning) => /not recorded|reach GitHub/.test(warning)), []);
});
