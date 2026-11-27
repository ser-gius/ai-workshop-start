// spec/web.md, "Long texts": a long text with no spaces stays inside its card, wrapped or cut with …,
// and the page never scrolls sideways. Measured in the browser (jsdom has no layout); no screenshots,
// so no baselines: the boxes themselves are compared.
import { expect, test, type Page } from '@playwright/test';
import type { OrganizationAnswer, ScanAnswer, TopicsAnswer } from '../../src/web.ts';
import { FIXTURE_COPY } from './data.ts';

const LONG_NAME = 'a-very-long-skill-name-without-any-spaces-that-goes-on-and-on-and-on-forever-and-ever';
const LONG_WORD = 'x'.repeat(250);
const DEEP = '/tmp/long/' + 'deep/'.repeat(60);

function skill(name: string, description: string): ScanAnswer['skills'][number] {
  return {
    id: name, name, description, summary: description.split('. ')[0], path: `.claude/skills/${name}/SKILL.md`,
    link: `https://github.com/octo/long/blob/main/.claude/skills/${name}/SKILL.md`, copies: [],
    text: `---\nname: ${name}\n---\nbody\n`, updated: '2026-11-20T09:14:03Z',
  };
}
// No topic cards: these tests measure the list and the header, not the cards above them.
const NO_TOPICS: TopicsAnswer = { topics: [], topicsBy: 'heuristic' };
const repository = (id: string): ScanAnswer['repository'] =>
  ({ id, url: `https://github.com/${id}`, commit: 'c0ffee' });

/** Every scan answers `answer`, with `status`. */
async function answering(page: Page, answer: unknown, status = 200) {
  await page.route('**/api/scan?*', (route) => route.fulfill({ status, json: answer }));
}
async function scan(page: Page, link: string) {
  await page.locator('#repo').fill(link);
  await page.locator('#scan').click();
}

/** `#status` sits on the field's row, beside it, not on a row of its own under it, at any width above 860 px. */
async function besideTheField(page: Page) {
  const size = page.viewportSize()!;
  for (const width of [861, 900, 937, size.width]) {
    await page.setViewportSize({ width, height: size.height });
    const [form, status] = await Promise.all([page.locator('#form'), page.locator('#status')].map((l) => l.boundingBox()));
    expect(status!.y, `what was scanned at ${width} px: on the field's row`).toBeLessThan(form!.y + form!.height);
    expect(status!.x, `what was scanned at ${width} px: beside the field`).toBeGreaterThanOrEqual(form!.x + form!.width);
  }
}
/** The page is no wider than the window: nothing makes it scroll sideways. */
async function noSidewaysScroll(page: Page) {
  const { scroll, window } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, window: innerWidth }));
  expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(window);
}
/** Every box of `selector` is inside the box of `card`, the closest one around it. */
async function inside(page: Page, selector: string, card: string) {
  const boxes = await page.locator(selector).evaluateAll((nodes, card) => nodes.map((node) => {
    const own = node.getBoundingClientRect();
    const around = node.closest(card)!.getBoundingClientRect();
    return { selector: node.className || node.id, left: own.left, right: own.right, cardLeft: around.left, cardRight: around.right };
  }), card);
  expect(boxes.length, `${selector} is on the page`).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.left, `${box.selector} starts inside ${card}`).toBeGreaterThanOrEqual(box.cardLeft);
    expect(box.right, `${box.selector} ends inside ${card}`).toBeLessThanOrEqual(box.cardRight);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#repositories option')).toHaveCount(2);
});

test('a long skill name wraps on its own line; its description stays under it', async ({ page }) => {
  const long = { ...skill(LONG_NAME, 'Its description stays under the name.'), copies: [DEEP + 'SKILL.md'],
    link: 'https://github.com/octo/long/blob/main' + DEEP + 'SKILL.md' };
  await answering(page, { repository: repository('octo/long'), warnings: [], ...NO_TOPICS,
    skills: [long, skill('commits', 'Write commit messages.')] } satisfies ScanAnswer);
  await scan(page, 'https://github.com/octo/long');
  await expect(page.locator('#count')).toHaveText('2 skills');

  await inside(page, '#skills .name', '#list');
  await inside(page, '#skills .description', '#list');
  const row = page.locator('#skills li[role="option"]').first();
  const [rowBox, nameBox, descriptionBox] = await Promise.all([row, row.locator('.name'), row.locator('.description')].map((l) => l.boundingBox()));
  expect(nameBox!.height, 'the long name wraps onto a few lines').toBeGreaterThan(30);
  expect(nameBox!.x + nameBox!.width, 'the name: inside its row').toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
  expect(descriptionBox!.y, 'the description: under the name').toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height - 1);
  await expect(row.locator('.description')).toBeVisible();
  // A short name keeps its own width, on one line.
  const short = page.locator('#skills li[role="option"]').nth(1).locator('.name');
  expect((await short.boundingBox())!.height).toBeLessThan(30);
  // The selected skill's card: its name, its link and `also in <paths>` wrap too.
  await inside(page, '#skill h2', '#skill');
  await expect(page.locator('#skill .copies')).toContainText(DEEP);
  await inside(page, '#skill .copies', '#skill');
  await expect(page.locator('#skill a').first()).toHaveAttribute('href', long.link);
  await inside(page, '#skill a', '#skill');
  await noSidewaysScroll(page);
});

test('a long skill name on a narrow window: still inside its card', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await answering(page, { repository: repository('octo/long'), warnings: [], ...NO_TOPICS, skills: [skill(LONG_NAME, 'Short.')] } satisfies ScanAnswer);
  await scan(page, 'https://github.com/octo/long');
  await expect(page.locator('#count')).toHaveText('1 skill');
  await inside(page, '#skills .name', '#list');
  await inside(page, '#skill h2', '#skill');
  await noSidewaysScroll(page);
});

test('a long word in a description wraps inside the list', async ({ page }) => {
  await answering(page, { repository: repository('octo/long'), warnings: [], ...NO_TOPICS, skills: [skill('words', 'See ' + LONG_WORD + ' here')] } satisfies ScanAnswer);
  await scan(page, 'https://github.com/octo/long');
  await expect(page.locator('#count')).toHaveText('1 skill');
  await inside(page, '#skills .description', '#list');
  // Wrapped, not clipped sideways by its two-line clamp.
  const clipped = await page.locator('#skills .description, #skills .description *').evaluateAll((nodes) =>
    nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length);
  expect(clipped, 'a part of the description is cut sideways').toBe(0);
  await noSidewaysScroll(page);
});

test('`No skills match` a long filter: it wraps inside the card', async ({ page }) => {
  await scan(page, FIXTURE_COPY);
  await expect(page.locator('#count')).toHaveText('7 skills');
  await page.locator('#filter').fill(LONG_WORD);
  await expect(page.locator('#no-match')).toHaveText(`No skills match "${LONG_WORD}"`);
  await inside(page, '#no-match', '#list');
  await noSidewaysScroll(page);
});

test('`Scanning <a long link>…`: cut with … in the header, the whole of it on hover', async ({ page }) => {
  await page.route('**/api/scan?*', () => {}); // never answers: the page stays scanning
  await scan(page, DEEP);
  const status = page.locator('#status');
  await expect(status).toHaveText(`Scanning ${DEEP}…`);
  await expect(status).toHaveAttribute('title', `Scanning ${DEEP}…`);
  await inside(page, '#status', 'header');
  expect(await status.evaluate((node) => node.scrollWidth > node.clientWidth), 'cut, on one line').toBe(true);
  expect(await status.evaluate((node) => getComputedStyle(node).textOverflow)).toBe('ellipsis');
  await besideTheField(page);
  await noSidewaysScroll(page);
});

test('an error with a long link wraps inside the header', async ({ page }) => {
  await answering(page, { error: `No such directory: ${DEEP}` }, 400);
  await scan(page, DEEP);
  await expect(page.locator('#status')).toHaveClass('error');
  await expect(page.locator('#status')).toHaveText(`No such directory: ${DEEP}`);
  await inside(page, '#status', 'header');
  await noSidewaysScroll(page);
});

test('an organization: a long repository heading and a long warning stay inside their cards', async ({ page }) => {
  const name = 'octo/' + 'a-repository-with-a-very-long-name'.repeat(4);
  await answering(page, {
    organization: { id: 'octo', url: 'https://github.com/octo', repositories: 1 },
    repositories: [{ repository: repository(name), skills: [skill(LONG_NAME, 'Short.')] }],
    warnings: [`Skipped ${DEEP}SKILL.md: no front matter`],
    ...NO_TOPICS,
  } satisfies OrganizationAnswer);
  await scan(page, 'https://github.com/octo');
  await expect(page.locator('#org-top li')).toHaveCount(1);
  await inside(page, '#skills li.group a', '#list');
  await inside(page, '#skills .name', '#list');
  await inside(page, '#org-top a', '#organization');
  await expect(page.locator('#org-top a')).toHaveAttribute('title', name);
  await expect(page.locator('#org-name')).toHaveAttribute('title', 'github.com/octo');
  await inside(page, '#warnings li', 'header');
  // What was scanned, `<a long repository> · 1 skill`: cut beside the field, on its row.
  await inside(page, '#status', 'header');
  await besideTheField(page);
  await noSidewaysScroll(page);
});
