// Records the Skill Atlas web view as an MP4: `node record.mjs <case>... [--out <file.mp4>]`.
// Starts its own `./skill-atlas serve` on a spare port; run setup.sh once first.
// The cases run one after another in one video; `--list` lists them.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TOOLS = process.env.DEMO_TOOLS ?? join(homedir(), '.cache/skill-atlas-demo');
const { chromium } = createRequire(join(TOOLS, 'package.json'))('playwright');

// Each case: what it shows, and the steps on a page `p` with helpers `h`.
const CASES = {
  fixture: {
    about: 'Offline: the local fixture, then the filter `use before` (spec: code-style, reviews, run-tests)',
    async run(p, h) {
      await h.scan(join(ROOT, 'fixture'));
      await h.skills();
      await h.pause(1500);
      await h.filter('use before');
      await h.pause(2500);
      await h.clearFilter();
    },
  },
  scan: {
    about: 'A repository: its skills, picking one, unfolding a description',
    async run(p, h) {
      await h.scan('https://github.com/JetBrains/kotlin');
      await h.skills();
      await h.pause(1500);
      await p.locator('#skills li').nth(2).click();
      await h.pause(1500);
      const fold = p.locator('#skills details.description summary').first();
      if (await fold.count()) { await fold.click(); await h.pause(2000); await p.locator('#skills details[open] .whole').first().click(); }
      await h.pause(1000);
    },
  },
  filter: {
    about: 'The skill filter on one repository: `gradle`, then `gradle version`',
    async run(p, h) {
      await h.scan('https://github.com/JetBrains/kotlin');
      await h.skills();
      await h.pause(1500);
      await h.filter('gradle');
      await h.pause(2000);
      await h.filter(' version', { append: true });
      await h.pause(2500);
      await h.clearFilter();
    },
  },
  org: {
    about: 'An organization (JetBrains, ~16 s to scan): its card, the grouped skills, then the filter `review` across it',
    async run(p, h) {
      await h.scan('https://github.com/JetBrains');
      await p.waitForSelector('#organization:not([hidden])', { timeout: 60_000 });
      await p.waitForSelector('#org-top li', { timeout: 120_000 });
      await h.pause(3000);
      await h.scroll(500, 1500);
      await h.filter('review');
      await h.pause(2500);
      await h.scroll(500, 2000);
      await h.clearFilter();
    },
  },
  keyboard: {
    about: 'Offline: the keyboard in the fixture\'s skills: Tab in, the arrow keys, Enter selects, Enter on a fold',
    async run(p, h) {
      await h.scan(join(ROOT, 'fixture'));
      await h.skills();
      await h.pause(1000);
      await p.focus('#filter');
      await p.keyboard.press('Tab');
      await h.pause(1000);
      for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowDown'); await h.pause(600); }
      await p.keyboard.press('Enter');
      await h.pause(1500);
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Tab');
      await h.pause(600);
      await p.keyboard.press('Enter');
      await h.pause(2000);
    },
  },
  link: {
    about: 'A link of its own: `?repo=…&filter=…` opens the filtered view at once',
    async run(p, h) {
      await p.goto(`${h.url}?repo=${encodeURIComponent('https://github.com/JetBrains/kotlin')}&filter=gradle`);
      await h.skills();
      await h.pause(3000);
    },
  },
  history: {
    about: 'Offline: two scans, then Back to the first one, Forward to the second, Back to the empty page',
    async run(p, h) {
      // A page before Skill Atlas in the tab, as a user has one.
      await p.goto('data:text/html,<h1 style="font-family:sans-serif">The page before Skill Atlas</h1>');
      await h.pause(1000);
      await p.goto(h.url);
      await h.pause(800);
      const status = async (expected) => {
        await p.waitForFunction((text) => document.getElementById('status').textContent === text, expected, { timeout: 30_000 });
      };
      await h.scan(join(ROOT, 'fixture'));
      await status('fixture · 7 skills');
      await h.pause(1500);
      await h.scan(join(ROOT, 'fixture', 'agent'));
      await status('agent · 1 skill');
      await h.pause(1500);
      await p.goBack();
      await status('fixture · 7 skills');
      await h.pause(2000);
      await p.goForward();
      await status('agent · 1 skill');
      await h.pause(2000);
      await p.goBack();
      await status('fixture · 7 skills');
      await h.pause(1000);
      await p.goBack();
      await status('');
      if (new URL(p.url()).search !== '' || !(await p.isHidden('#results'))) throw new Error('Back before any scan: not the empty page');
      await h.pause(1500);
    },
  },
};

const args = process.argv.slice(2);
if (args.includes('--list') || !args.length) {
  for (const [name, c] of Object.entries(CASES)) console.log(`${name.padEnd(8)} ${c.about}`);
  process.exit(args.length ? 0 : 1);
}
const outAt = args.indexOf('--out');
if (outAt >= 0 && (!args[outAt + 1] || CASES[args[outAt + 1]] || args[outAt + 1].startsWith('--'))) {
  console.error('--out needs a file name: --out <file.mp4>');
  process.exit(1);
}
const out = resolve(outAt >= 0 ? args.splice(outAt, 2)[1] : join(process.env.AIR_ARTIFACTS_DIR ?? '.', 'demo.mp4'));
const unknown = args.filter((a) => !CASES[a]);
if (unknown.length) { console.error(`Unknown case: ${unknown.join(', ')}; --list lists them`); process.exit(1); }
// Before recording: a missing directory would only fail at the end, in ffmpeg.
mkdirSync(dirname(out), { recursive: true });

const port = 4300 + Math.floor(Math.random() * 500);
const server = spawn(join(ROOT, 'skill-atlas'), ['serve', '--port', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
const url = await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => { const m = /at (\S+)/.exec(String(d)); if (m) ok(m[1]); });
  server.on('exit', (code) => fail(new Error(`skill-atlas serve exited: ${code}`)));
});

const videos = mkdtempSync(join(tmpdir(), 'demo-'));
// The server and the WebM go once the video is converted, or when anything fails (even launching Chrome).
try {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: videos, size } });
  const p = await context.newPage();
  const h = {
    url,
    pause: (ms) => p.waitForTimeout(ms),
    async scan(link) { await p.fill('#repo', ''); await p.type('#repo', link, { delay: 40 }); await p.waitForTimeout(400); await p.click('#scan'); },
    skills: () => p.waitForSelector('#skills li:not([hidden])', { timeout: 60_000 }),
    async filter(words, { append = false } = {}) { if (!append) await p.fill('#filter', ''); await p.click('#filter'); await p.type('#filter', words, { delay: 150 }); },
    async clearFilter() { await p.fill('#filter', ''); await p.waitForTimeout(1000); },
    async scroll(dy, ms) { await p.mouse.wheel(0, dy); await p.waitForTimeout(ms); await p.mouse.wheel(0, -dy); await p.waitForTimeout(800); },
  };
  try {
    await p.goto(url);
    await h.pause(1000);
    for (const name of args) { console.log(`Recording ${name}…`); await CASES[name].run(p, h); }
  } finally {
    await context.close();
    await browser.close();
  }
  const webm = join(videos, readdirSync(videos)[0]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', out]);
} finally {
  server.kill();
  rmSync(videos, { recursive: true, force: true });
}
console.log(out);
