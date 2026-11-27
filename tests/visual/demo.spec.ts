// The demo's cases (.claude/skills/record-demo/record.mjs), as tests: each key moment a screenshot,
// compared with its baseline. GitHub answers from the recording (tests/visual/github.json.gz), so the
// data never moves; every run is recorded as a video (playwright.config.ts).
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ORGANIZATION, DEMO_REPOSITORY, FIXTURE_COPY } from './data.ts';

/** Types a link into the field and scans it, as a user does. */
async function scan(page: Page, link: string) {
  await page.locator('#repo').fill('');
  await page.locator('#repo').pressSequentially(link, { delay: 20 });
  await page.locator('#scan').click();
}
const skills = (page: Page) => page.locator('#skills li[role="option"]:visible');
/** Types the words into the filter, after what is there if `append`. */
async function filter(page: Page, words: string, { append = false } = {}) {
  if (!append) await page.locator('#filter').fill('');
  await page.locator('#filter').click();
  await page.locator('#filter').pressSequentially(words, { delay: 40 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The suggestions are loaded: the page is in its first state.
  await expect(page.locator('#repositories option')).toHaveCount(2);
});

test('the fonts are the pinned image\'s, as in the baselines', async ({ page }) => {
  // A screenshot from other fonts differs everywhere; this says why. Run in the image: npm run test:visual:docker.
  await scan(page, FIXTURE_COPY);
  await expect(skills(page).first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const font = async (selector: string) => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => f.familyName);
  };
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  expect(await font('h1')).toEqual(['Liberation Sans']);
  expect(await font('#skills .name')).toEqual(['Liberation Mono']);
});

test('fixture: the local directory, then the filter `use before`', async ({ page }) => {
  await scan(page, FIXTURE_COPY);
  await expect(page.locator('#count')).toHaveText('7 skills');
  // A copy outside git: no skill has a day.
  await expect(page.locator('#skills .updated')).toHaveCount(0);
  await expect(page).toHaveScreenshot('fixture.png');

  await filter(page, 'use before');
  await expect(page.locator('#count')).toHaveText('3 of 7');
  await expect(skills(page).locator('.name')).toHaveText(['code-style', 'reviews', 'run-tests']);
  await expect(page).toHaveScreenshot('fixture-use-before.png');
});

test('scan: a repository, picking a skill, unfolding a description', async ({ page }) => {
  await scan(page, DEMO_REPOSITORY);
  await expect(skills(page)).toHaveCount(7);
  // Each skill's day under its name, and the selected one's under its link.
  await expect(skills(page).locator('.updated')).toHaveCount(7);
  await expect(skills(page).first().locator('.updated')).toHaveText('2026-04-02');
  await expect(page.locator('#skill .updated')).toHaveText('updated 2026-04-02');
  await expect(page).toHaveScreenshot('scan.png');

  await skills(page).nth(2).click();
  await expect(skills(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveScreenshot('scan-picked.png');

  const fold = page.locator('#skills details.description').first();
  await fold.locator('summary').click();
  await expect(fold).toHaveAttribute('open', '');
  await expect(skills(page).nth(2)).toHaveAttribute('aria-selected', 'true'); // folding keeps the selection
  await expect(page).toHaveScreenshot('scan-unfolded.png');
});

test('filter: `gradle`, then `gradle version`', async ({ page }) => {
  await scan(page, DEMO_REPOSITORY);
  await expect(skills(page)).toHaveCount(7);

  await filter(page, 'gradle');
  await expect(page.locator('#count')).toHaveText(/^\d+ of 7$/);
  await expect(page).toHaveScreenshot('filter-gradle.png');

  await filter(page, ' version', { append: true });
  await expect(page.locator('#filter')).toHaveValue('gradle version');
  await expect(page).toHaveScreenshot('filter-gradle-version.png');
  await expect(page).toHaveURL(/[?&]filter=gradle(\+|%20)version/);
});

test('org: scanning, the card and the grouped skills, then the filter `review` across them', async ({ page }) => {
  // The scan answers only once the screenshot of it running is taken.
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/api/scan?*', async (route) => {
    await answered;
    await route.continue();
  });
  await scan(page, DEMO_ORGANIZATION);
  await expect(page.locator('#org-label')).toHaveText('Scanning…');
  await expect(page.locator('#org-count')).toHaveText('…');
  await expect(page).toHaveScreenshot('org-scanning.png');

  answer();
  await expect(page.locator('#org-top li')).toHaveCount(3);
  await expect(page.locator('#org-count')).toHaveText(/^\d+ repositories$/);
  await expect(page).toHaveScreenshot('org.png');
  await expect(page).toHaveScreenshot('org-whole.png', { fullPage: true });

  await filter(page, 'review');
  await expect(page.locator('#count')).toHaveText(/^\d+ of \d+$/);
  await expect(page).toHaveScreenshot('org-review.png');

  // The list scrolls to the focused skill: End reaches the last one, off screen until then.
  await page.locator('#filter').fill('');
  const last = skills(page).last();
  await expect(last).not.toBeInViewport();
  await skills(page).first().locator('.name').click(); // the focus on the first skill
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
});

test('link: `?repo=…&filter=gradle` opens the filtered view at once', async ({ page }) => {
  await page.goto(`/?repo=${encodeURIComponent(DEMO_REPOSITORY)}&filter=gradle`);
  await expect(page.locator('#filter')).toHaveValue('gradle');
  await expect(page.locator('#count')).toHaveText(/^\d+ of 7$/);
  await expect(page).toHaveScreenshot('link.png');
});

test('keyboard: Tab into the skills, the arrow keys, Enter selects; a fold too', async ({ page }) => {
  await scan(page, FIXTURE_COPY);
  await expect(page.locator('#count')).toHaveText('7 skills');
  const focused = page.locator('#skills li[role="option"]:focus');

  await page.locator('#filter').focus();
  await page.keyboard.press('Tab');
  await expect(focused.locator('.name')).toHaveText('aspect-generator'); // one Tab stop: the selected skill
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown', { delay: 150 });
  await expect(focused.locator('.name')).toHaveText('release-checklist'); // no fold, still reached
  await expect(page.locator('#skill h2')).toHaveText('aspect-generator'); // the focus alone selects nothing
  await expect(page).toHaveScreenshot('keyboard-focused.png');

  await page.keyboard.press('Enter');
  await expect(skills(page).nth(4)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#skill h2')).toHaveText('release-checklist');
  await expect(page).toHaveScreenshot('keyboard-selected.png');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab'); // reviews' fold
  await page.keyboard.press('Enter');
  await expect(skills(page).nth(5).locator('details.description')).toHaveAttribute('open', '');
  await expect(page.locator('#skill h2')).toHaveText('release-checklist'); // unfolding keeps the selection
  await expect(page).toHaveScreenshot('keyboard-unfolded.png');

  // The folds above the selected skill are no Tab stops: one Tab from the filter reaches it.
  await skills(page).nth(6).locator('.name').click();
  await page.locator('#filter').focus();
  await page.keyboard.press('Tab');
  await expect(focused.locator('.name')).toHaveText('run-tests');
});
