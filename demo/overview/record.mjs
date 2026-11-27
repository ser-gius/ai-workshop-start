// The 20-second overview video: Skill Atlas's features, then how the work runs (issues, the agents'
// PRs and reviews, CI, Slack). `node demo/overview/record.mjs [out.mp4]`; needs GITHUB_TOKEN and
// .claude/skills/record-demo/setup.sh. GitHub pages are recorded live, logged out; slack.html holds
// real messages from sergius-private-channel (the Slack UI needs a login).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const TOOLS = process.env.DEMO_TOOLS ?? join(homedir(), '.cache/skill-atlas-demo');
const { chromium } = createRequire(join(TOOLS, 'package.json'))('playwright');
const OUT = resolve(process.argv[2] ?? join(process.env.AIR_ARTIFACTS_DIR ?? '.', 'skill-atlas-20s.mp4'));
const LENGTH = 20; // seconds
mkdirSync(dirname(OUT), { recursive: true });
const RAW = mkdtempSync(join(tmpdir(), 'overview-'));
const GH = 'https://github.com/ser-gius/ai-workshop-start';
const PORT = 4300 + Math.floor(Math.random() * 500);
const server = spawn(`${ROOT}/skill-atlas`, ['serve', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const url = `http://127.0.0.1:${PORT}/`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const size = { width: 1280, height: 800 };
const ctx = await b.newContext({ viewport: size, recordVideo: { dir: RAW, size } });
const p = await ctx.newPage();
const t0 = Date.now(); const marks = [];
const pause = (ms) => p.waitForTimeout(ms);
const caption = (text, tag) => p.evaluate(([text, tag]) => {
  document.getElementById('__cap')?.remove();
  const d = document.createElement('div'); d.id = '__cap';
  d.innerHTML = (tag ? `<span style="opacity:.7;font-weight:600;margin-right:12px">${tag}</span>` : '') + text;
  Object.assign(d.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 2147483647,
    background: 'rgba(17,17,27,.92)', color: '#fff', font: '700 27px/1.25 system-ui,sans-serif', padding: '14px 26px',
    borderRadius: '14px', whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(0,0,0,.35)' });
  document.body.appendChild(d);
}, [text, tag]);
async function shot(name, setup, show) { await setup(); const s = Date.now() - t0; await show(); marks.push({ name, s: s / 1000, e: (Date.now() - t0) / 1000 }); console.log(name); }
const card = (title, sub) => p.setContent(`<body style="margin:0;height:800px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1b1340,#3b2a8a);color:#fff;font-family:system-ui,sans-serif"><div style="font-size:84px;font-weight:800">${title}</div><div style="font-size:32px;opacity:.85;margin-top:14px">${sub}</div></body>`);
const typeScan = async (link) => { await p.fill('#repo', link); await p.click('#scan'); };
const P1 = '1 · Skill Atlas', P2 = '2 · How the work runs';

await shot('title', () => card('Skill Atlas', 'every agent skill in a repository'), () => pause(1200));
const term = (cmd, out) => `<body style="margin:0;background:#0f111a;color:#d6deeb;font:17px/1.5 'DejaVu Sans Mono',monospace;padding:30px;height:800px;box-sizing:border-box"><div style="color:#82aaff">$ ${cmd}</div><pre style="margin:0;white-space:pre-wrap">${out.replace(/</g,'&lt;')}</pre></body>`;
await shot('cli', async () => { await p.setContent(term('./skill-atlas scan https://github.com/JetBrains/kotlin', execFileSync(`${ROOT}/skill-atlas`, ['scan', 'https://github.com/JetBrains/kotlin'], { cwd: ROOT, encoding: 'utf8' }).split('\n').slice(0,16).join('\n'))); await caption('CLI: scan any repository, org or folder', P1); }, () => pause(1600));
await shot('fixture-filter', async () => { await p.goto(url); await typeScan(`${ROOT}/fixture`); await p.waitForSelector('#skills li:not([hidden])'); await caption('Web view · filter as you type, matches highlighted', P1); },
  async () => { await p.click('#filter'); await p.type('#filter', 'use before', { delay: 70 }); await pause(900); });
await shot('kotlin', async () => { await p.fill('#filter', ''); await typeScan('https://github.com/JetBrains/kotlin'); await p.waitForSelector('#skills li:not([hidden])', { timeout: 60000 }); await p.locator('#skills li').nth(2).click(); await caption('Last-updated day · foldable descriptions · SKILL.md', P1); },
  async () => { const f = p.locator('#skills details.description summary').first(); if (await f.count()) await f.click(); await pause(1500); });
await shot('org', async () => { await typeScan('https://github.com/JetBrains'); await p.waitForSelector('#org-top li', { timeout: 120000 }); await caption('A whole organization: top repos, skills grouped', P1); },
  async () => { await pause(900); await p.mouse.wheel(0, 450); await pause(900); });
await shot('link', async () => { await p.goto(`${url}?repo=${encodeURIComponent('https://github.com/JetBrains/kotlin')}&filter=gradle`); await p.waitForSelector('#skills li:not([hidden])', { timeout: 60000 }); await caption('Every scan & filter has its own link; Back/Forward work', P1); },
  () => pause(1300));
await shot('narrow', async () => { await p.setContent(`<body style="margin:0;height:800px;background:#e9e6f5;display:flex;align-items:center;justify-content:center"><iframe src="${url}?repo=${encodeURIComponent(ROOT + '/fixture')}" style="width:375px;height:740px;border:10px solid #111;border-radius:36px;background:#fff"></iframe></body>`); await pause(2500); await caption('Fits a phone screen', P1); },
  () => pause(1100));
await shot('part2', () => card('How the work runs', 'issues · automations · reviews · CI · Slack'), () => pause(1100));
const gh = async (path, text, sel) => { await p.goto(GH + path, { waitUntil: 'domcontentloaded' }); await pause(2500);
  if (sel) { await p.evaluate((s) => { const el = [...document.querySelectorAll('*')].filter(e => e.children.length < 3 && e.textContent.includes(s)).pop(); if (!el) return false; el.scrollIntoView({ block: 'center' }); return true; }, sel).then((ok) => { if (!ok) console.warn(`  not on the page: ${sel}`); }); await pause(800); }
  await caption(text, P2); };
await shot('issues', () => gh('/issues?q=is%3Aissue%20label%3A%22Delegated%20to%20AI%22', 'Red agent files bugs · labelled “Delegated to AI”'), () => pause(1300));
await shot('issue28', () => gh('/issues/28', 'Each with steps, expected, actual and a video', 'Video'), () => pause(1300));
await shot('slack', async () => { await p.goto('file://' + join(HERE, 'slack.html')); await caption('Open decision? The agent asks in Slack and waits', P2); }, () => pause(1800));
await shot('pr-review', () => gh('/pull/42', 'Agent opens the PR · agent code review', 'Verdict: ready to merge'), () => pause(1600));
await shot('pr-demo', () => gh('/pull/42', 'CI posts the demo videos in the PR', 'Full video: fixture.mp4'), () => pause(1300));
await shot('actions', () => gh('/pull/42/checks', 'CI green: tests, e2e, visual → merged'), () => pause(1300));
await shot('end', () => card('Skill Atlas', 'spec → code → tests → review → CI → demo'), () => pause(900));

await ctx.close(); await b.close(); server.kill();
const vid = join(RAW, readdirSync(RAW).find((f) => f.endsWith('.webm')));
// Each shot's visible part, cut out, sped up or slowed together to LENGTH seconds, then joined.
const total = marks.reduce((a, m) => a + (m.e - m.s - 0.1), 0), k = LENGTH / total;
const filter = marks.map((m, i) => `[0:v]trim=${(m.s + 0.1).toFixed(3)}:${m.e.toFixed(3)},setpts=(PTS-STARTPTS)*${k.toFixed(4)}[v${i}]`).join(';')
  + ';' + marks.map((_, i) => `[v${i}]`).join('') + `concat=n=${marks.length}:v=1:a=0,fps=30,tpad=stop_mode=clone:stop_duration=1[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', vid, '-filter_complex', filter, '-map', '[out]', '-t', String(LENGTH),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', OUT]);
rmSync(RAW, { recursive: true, force: true });
console.log(OUT);
