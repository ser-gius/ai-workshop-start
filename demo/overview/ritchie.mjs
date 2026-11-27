// The overview video, cut in a fast caper style: `node demo/overview/ritchie.mjs [out.mp4]`.
// Records clean shots (no captions) and the cards, then ritchie.py cuts them together with freeze
// frames, speed ramps, a grade and a generated soundtrack. Needs GITHUB_TOKEN, ffmpeg, python3 with
// numpy, the Bebas Neue font (apt: fonts-bebas-neue) and record-demo's setup.sh.
// KEEP_WORK=<dir> keeps the recording, the cards and marks.json there, to recut with ritchie.py alone.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const TOOLS = process.env.DEMO_TOOLS ?? join(homedir(), '.cache/skill-atlas-demo');
const { chromium } = createRequire(join(TOOLS, 'package.json'))('playwright');
const OUT = resolve(process.argv[2] ?? join(process.env.AIR_ARTIFACTS_DIR ?? '.', 'skill-atlas-ritchie.mp4'));
mkdirSync(dirname(OUT), { recursive: true });
const WORK = resolve(process.env.KEEP_WORK ?? mkdtempSync(join(tmpdir(), 'ritchie-')));
const CARDS = join(WORK, 'cards'), RAW = join(WORK, 'raw');
mkdirSync(CARDS, { recursive: true }); rmSync(RAW, { recursive: true, force: true });
const GH = 'https://github.com/ser-gius/ai-workshop-start';
const PORT = 4300 + Math.floor(Math.random() * 500);
const url = `http://127.0.0.1:${PORT}/`;
const size = { width: 1280, height: 800 };

const server = spawn(`${ROOT}/skill-atlas`, ['serve', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  await new Promise((ok, fail) => { server.stdout.on('data', (d) => /at http/.test(String(d)) && ok()); server.on('exit', fail); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  try {
    await drawCards(b);
    await record(b);
  } finally { await b.close(); }
} finally { server.kill(); }
renameSync(join(RAW, readdirSync(RAW).find((f) => f.endsWith('.webm'))), join(WORK, 'raw.webm'));
execFileSync('python3', [join(HERE, 'ritchie.py'), WORK, OUT], { stdio: 'inherit' });
if (!process.env.KEEP_WORK) rmSync(WORK, { recursive: true, force: true });
console.log(OUT);

// The cards: full frames (title, chapter, end) and transparent overlays (a name on a freeze, stamps, tags).
async function drawCards(b) {
  const p = await b.newPage({ viewport: size });
  const BASE = `<style>body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:'Bebas Neue',sans-serif}
    .sub{font:700 26px 'DejaVu Sans Mono',monospace;letter-spacing:1px}</style>`;
  const card = async (name, html, transparent) => {
    await p.setContent(BASE + html); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: join(CARDS, `${name}.png`), omitBackground: transparent });
  };
  const full = (big, sub) => `<body style="background:#0b0b0b;color:#f4efe6;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="font-size:230px;line-height:.85;letter-spacing:6px">${big}</div><div class="sub" style="margin-top:26px;color:#e8b931">${sub}</div></body>`;
  await card('title', full('SKILL<span style="color:#e8b931">·</span>ATLAS', 'EVERY AGENT SKILL IN A REPOSITORY'), false);
  await card('chapter', `<body style="background:#e8b931;color:#0b0b0b;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div class="sub">PART TWO</div><div style="font-size:210px;line-height:.9">THE FIRM</div><div class="sub">ISSUES · AGENTS · REVIEWS · CI · SLACK</div></body>`, false);
  await card('end', full('SKILL<span style="color:#e8b931">·</span>ATLAS', 'SPEC → CODE → TESTS → REVIEW → CI → DEMO'), false);
  // A character's name on a freeze frame: a tilted bar with the name, a line under it.
  const label = (name, line) => `<body style="background:transparent">
    <div style="position:absolute;left:-30px;top:430px;transform:rotate(-4deg);background:#e8b931;color:#0b0b0b;padding:8px 60px 0 80px;box-shadow:14px 14px 0 #0b0b0b">
    <div style="font-size:150px;line-height:1">${name}</div></div>
    <div class="sub" style="position:absolute;left:80px;top:630px;color:#fff;background:#0b0b0b;padding:10px 18px">${line}</div></body>`;
  const labels = {
    cli: ['THE CLI', 'FINDS EVERY SKILL.MD. NO QUESTIONS ASKED.'],
    filter: ['THE FILTER', 'TWO WORDS. IT KNOWS WHO YOU MEAN.'],
    org: ['THE ORGANIZATION', '1,000+ REPOSITORIES. ONE REQUEST.'],
    red: ['THE RED AGENT', 'BREAKS THINGS FOR A LIVING. FILES THE PAPERWORK.'],
    agent: ['THE AGENT', "WON'T GUESS. ASKS IN SLACK."],
    reviewer: ['THE REVIEWER', 'TRUSTS NOBODY. REPRODUCES EVERYTHING.'],
  };
  for (const [k, [n, l]] of Object.entries(labels)) await card(`l-${k}`, label(n, l), true);
  const stamp = (text, px, rot) => `<body style="background:transparent;display:flex;align-items:center;justify-content:center">
    <div style="font-size:${px}px;line-height:1;color:#e8b931;border:12px solid #e8b931;padding:14px 40px 0;transform:rotate(${rot}deg);background:rgba(11,11,11,.6)">${text}</div></body>`;
  await card('s-later', stamp('15 SECONDS LATER…', 120, -3), true);
  await card('s-green', stamp('GREEN.', 260, -8), true);
  const tag = (text) => `<body style="background:transparent"><div style="position:absolute;left:40px;bottom:40px;background:#0b0b0b;color:#e8b931;font-size:68px;padding:8px 24px 0">${text}</div></body>`;
  const tags = { fold: 'FOLDS · DATES · THE SKILL.MD', phone: 'FITS IN YOUR POCKET', link: 'EVERY SCAN HAS A LINK',
    video: 'EVERY BUG COMES WITH A VIDEO', demo: 'CI POSTS THE DEMO IN THE PR' };
  for (const [k, t] of Object.entries(tags)) await card(`t-${k}`, tag(t), true);
  await p.close();
}

// The shots, one after another in one recording; marks.json says where each one is.
async function record(b) {
  const ctx = await b.newContext({ viewport: size, recordVideo: { dir: RAW, size } });
  const p = await ctx.newPage();
  const t0 = Date.now(), marks = {};
  const now = () => (Date.now() - t0) / 1000;
  const pause = (ms) => p.waitForTimeout(ms);
  const shot = async (name, show) => { const s = now(); await show(); marks[name] = [s, now()]; console.log(name); };
  // A sync flash: the first red frame in the video is at marks._flash on this clock (ritchie.py).
  await p.setContent('<body style="margin:0;background:#000;height:800px">'); await pause(1000);
  await p.evaluate(() => { document.body.style.background = '#f00'; });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  marks._flash = now(); await pause(500);
  const skills = () => p.waitForSelector('#skills li:not([hidden])', { timeout: 60_000 });
  const scan = async (link) => { await p.fill('#repo', ''); await p.type('#repo', link, { delay: 25 }); await p.click('#scan'); };

  // The CLI: the command typed, then its real output line by line.
  const out = execFileSync(`${ROOT}/skill-atlas`, ['scan', 'https://github.com/JetBrains/kotlin'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').slice(0, 18);
  await p.setContent(`<body style="margin:0;background:#0f111a;color:#d6deeb;font:18px/1.5 'DejaVu Sans Mono',monospace;padding:30px;height:800px;box-sizing:border-box">
    <div id="c" style="color:#82aaff"></div><pre id="o" style="margin:0;white-space:pre-wrap"></pre></body>`);
  await shot('cli', async () => {
    await p.evaluate(async (lines) => {
      const cmd = '$ ./skill-atlas scan https://github.com/JetBrains/kotlin', w = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const ch of cmd) { document.getElementById('c').textContent += ch; await w(18); }
      for (const l of lines) { document.getElementById('o').textContent += l + '\n'; await w(45); }
    }, out);
    await pause(400);
  });
  await p.goto(url);
  await shot('filter', async () => {
    await scan(join(ROOT, 'fixture')); await skills(); await pause(300);
    await p.click('#filter'); await p.type('#filter', 'use before', { delay: 60 }); await pause(700);
  });
  await p.fill('#filter', '');
  await scan('https://github.com/JetBrains/kotlin'); await skills();
  await shot('fold', async () => {
    await p.locator('#skills li').nth(2).click(); await pause(500);
    const f = p.locator('#skills details.description summary').first(); if (await f.count()) await f.click();
    await pause(1000);
  });
  await shot('orgscan', async () => { await scan('https://github.com/JetBrains'); await pause(2500); });
  await p.waitForSelector('#org-top li', { timeout: 120_000 });
  await shot('org', async () => { await pause(800); await p.mouse.wheel(0, 420); await pause(1000); });
  await p.goto(`${url}?repo=${encodeURIComponent('https://github.com/JetBrains/kotlin')}&filter=gradle`); await skills();
  await shot('link', () => pause(1200));
  await p.setContent(`<body style="margin:0;height:800px;background:#e8b931;display:flex;align-items:center;justify-content:center">
    <iframe src="${url}?repo=${encodeURIComponent(join(ROOT, 'fixture'))}" style="width:375px;height:740px;border:10px solid #111;border-radius:36px;background:#fff"></iframe></body>`);
  await pause(2500);
  await shot('phone', () => pause(1200));

  const gh = async (path, text) => {
    await p.goto(GH + path, { waitUntil: 'domcontentloaded' }); await pause(2500);
    if (text && !(await p.evaluate((s) => {
      const el = [...document.querySelectorAll('*')].filter((e) => e.children.length < 3 && e.textContent.includes(s)).pop();
      el?.scrollIntoView({ block: 'center' }); return !!el;
    }, text))) console.warn(`  not on the page: ${text}`);
    await pause(600);
  };
  await gh('/issues?q=is%3Aissue%20label%3A%22Delegated%20to%20AI%22');
  await shot('issues', async () => { await p.mouse.wheel(0, 250); await pause(1200); });
  await gh('/issues/28', 'Video');
  await shot('issue28', () => pause(1200));
  await p.goto('file://' + join(HERE, 'slack.html'));
  await shot('slack', () => pause(1500));
  await gh('/pull/42', 'Verdict: ready to merge');
  await shot('review', () => pause(1300));
  await gh('/pull/42', 'Full video: fixture.mp4');
  await shot('demo', () => pause(1200));
  await gh('/pull/42/checks');
  await shot('checks', () => pause(1200));
  await ctx.close();
  writeFileSync(join(WORK, 'marks.json'), JSON.stringify(marks, null, 1));
}
