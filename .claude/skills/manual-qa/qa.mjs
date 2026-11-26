// Follows the QA scripts in qa/*.md in a recorded headless Chrome: `node qa.mjs <ID | CLI | ORG | WEB | --all>...`.
// Each case gets its own MP4, with the script's steps and every check (✓/✗) on screen; then a report.
// The steps come from cases.mjs; their captions come from the script itself. Run record-demo's setup.sh once first.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TOOLS = process.env.DEMO_TOOLS ?? join(homedir(), '.cache/skill-atlas-demo');
const SIZE = { width: 1280, height: 800 };
/** A case that cannot run here, and why. */
class Blocked extends Error {}
/** Node's fetch through a closed port: GitHub unreachable, as with the network disconnected. */
const OFFLINE = { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9' };

// ---- The scripts: every case, its steps and what a tester should see, as qa/*.md writes them.
export function readScripts(dir = join(ROOT, 'qa')) {
  const scripts = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()) {
    let current = null;
    let section = null;
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      const heading = /^#{2,3} ((?:[A-Z]+)-\d+) · (.+)$/.exec(line);
      if (heading) {
        current = { id: heading[1], title: heading[2], file, steps: [], see: [], needs: '' };
        scripts[current.id] = current;
        section = null;
        continue;
      }
      if (/^#{1,3} /.test(line)) { current = null; continue; }
      if (!current) continue;
      if (line.startsWith('**Steps**')) section = 'steps';
      else if (line.startsWith('**Should see**')) section = 'see';
      else if (/^\*Needs .*\*$/.test(line.trim())) current.needs = line.trim().slice(1, -1);
      else if (section === 'steps' && /^\d+\. /.test(line)) current.steps.push(line.replace(/^\d+\. /, ''));
      else if (section === 'see' && /^- /.test(line)) current.see.push(line.slice(2));
      else if (/^ {2,}\S/.test(line) && section) {
        const list = current[section];
        if (list.length) list[list.length - 1] += ' ' + line.trim();
      }
    }
  }
  return scripts;
}

// ---- Arguments.
const args = process.argv.slice(2);
const scripts = readScripts();
if (!args.length || args.includes('--list')) {
  for (const s of Object.values(scripts)) console.log(`${s.id.padEnd(7)} ${CASES[s.id] ? ' ' : '!'} ${s.title}${s.needs ? `  (${s.needs})` : ''}`);
  console.log('\n! : in the script, not automated in cases.mjs');
  process.exit(args.length ? 0 : 1);
}
const outAt = args.indexOf('--out');
if (outAt >= 0 && (!args[outAt + 1] || args[outAt + 1].startsWith('--'))) { console.error('--out needs a directory: --out <dir>'); process.exit(1); }
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const out = resolve(outAt >= 0 ? args.splice(outAt, 2)[1] : join(process.env.AIR_ARTIFACTS_DIR ?? tmpdir(), 'manual-qa', stamp));
const ids = [];
for (const a of args) {
  if (a === '--all') ids.push(...Object.keys(scripts));
  else if (scripts[a]) ids.push(a);
  else if (/^[A-Z]+$/.test(a) && Object.keys(scripts).some((id) => id.startsWith(a + '-'))) ids.push(...Object.keys(scripts).filter((id) => id.startsWith(a + '-')));
  else { console.error(`Unknown case: ${a}; --list lists them`); process.exit(1); }
}
const selected = [...new Set(ids)];
mkdirSync(out, { recursive: true });

// A token for the cases that need one: GITHUB_TOKEN, else gh's.
let token = process.env.GITHUB_TOKEN;
if (!token) { try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() || undefined; } catch {} }

const { chromium } = createRequire(join(TOOLS, 'package.json'))('playwright');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const results = [];
try {
  for (const id of selected) {
    const result = await runCase(scripts[id]);
    results.push(result);
    const mark = { pass: 'PASS', fail: 'FAIL', blocked: 'BLOCKED', 'not automated': 'NOT AUTOMATED' }[result.status];
    console.log(`${mark.padEnd(13)} ${id} · ${result.title}${result.video ? `  ${result.video}` : ''}`);
    for (const c of result.checks.filter((c) => c.status !== 'pass')) console.log(`              ${c.status === 'fail' ? '✗' : '–'} ${c.text}${c.detail ? `: ${c.detail}` : ''}`);
  }
} finally {
  await browser.close();
}
writeReport(out, results);
console.log(`\n${summary(results)}\n${join(out, 'report.md')}`);
process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);

// ---- One case: its own browser context, so its own video.
async function runCase(script) {
  const result = { id: script.id, title: script.title, file: script.file, steps: script.steps, see: script.see, checks: [], status: 'pass', notes: [], warnings: [] };
  const automate = CASES[script.id];
  if (!automate) { result.status = 'not automated'; return result; }
  const videos = mkdtempSync(join(tmpdir(), 'qa-video-'));
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videos, size: SIZE } });
  const page = await context.newPage();
  const cleanup = [];
  const stepsShown = new Set();
  const t = tester(page, script, result, cleanup, stepsShown);
  const started = Date.now();
  try {
    await t.terminal([]);
    await t.pause(800);
    await automate(t);
  } catch (error) {
    if (error instanceof Blocked) result.checks.push({ status: 'blocked', text: error.message });
    else {
      result.checks.push({ status: 'fail', text: 'The case ran to its end', detail: String(error?.message ?? error).split('\n')[0] });
      await page.screenshot({ path: join(out, `${script.id}-error.png`) }).catch(() => {});
      result.screenshot = `${script.id}-error.png`;
    }
    await t.overlay().catch(() => {});
    await t.pause(1500).catch(() => {});
  } finally {
    for (const undo of cleanup.reverse()) await undo().catch(() => {});
    await t.pause(800).catch(() => {});
    const video = page.video();
    await context.close();
    const webm = await video?.path();
    if (webm && existsSync(webm)) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', join(out, `${script.id}.mp4`)]);
      result.video = `${script.id}.mp4`;
    }
    rmSync(videos, { recursive: true, force: true });
  }
  result.seconds = Math.round((Date.now() - started) / 1000);
  const missing = script.steps.map((_, i) => i + 1).filter((n) => !stepsShown.has(n));
  if (missing.length && result.checks.every((c) => c.status !== 'blocked')) result.warnings.push(`step ${missing.join(', ')} of the script not shown: cases.mjs may be out of date`);
  if (!result.checks.length) result.checks.push({ status: 'fail', text: 'At least one check', detail: 'the case checked nothing' });
  result.status = result.checks.some((c) => c.status === 'fail') ? 'fail' : result.checks.some((c) => c.status === 'blocked') ? 'blocked' : 'pass';
  return result;
}


// ---- What a case can do: the tester's hands (t.sh, t.open, t.scan, …) and eyes (t.see).
function tester(p, script, result, cleanup, stepsShown) {
  const state = { step: '', transcript: [] };
  const t = {
    p, root: ROOT, fixture: join(ROOT, 'fixture'), token, script, OFFLINE,
    pause: (ms) => p.waitForTimeout(ms),

    /** Step n of the script: its text, on screen. */
    async step(n, note = '') {
      stepsShown.add(n);
      state.step = `Step ${n}. ${script.steps[n - 1] ?? '(not in the script)'}${note ? `  — ${note}` : ''}`;
      await t.overlay();
      await t.pause(700);
    },
    /** A point of "Should see": `ok` a boolean, or a function giving one (or { ok, detail }). */
    async see(text, ok, detail = '') {
      let value = ok;
      try { if (typeof ok === 'function') value = await ok(); } catch (error) { value = { ok: false, detail: String(error?.message ?? error).split('\n')[0] }; }
      if (value && typeof value === 'object') { detail = value.detail ?? detail; value = value.ok; }
      const check = { status: value ? 'pass' : 'fail', text, detail: value ? '' : String(detail).slice(0, 400) };
      result.checks.push(check);
      await t.overlay();
      await t.pause(value ? 500 : 1500);
      return Boolean(value);
    },
    /** A check that cannot be done here, such as one needing another machine; the rest goes on. */
    async skip(text, why) { result.checks.push({ status: 'blocked', text, detail: why }); await t.overlay(); },
    /** The whole case cannot run: say why. */
    blocked(why) { throw new Blocked(why); },
    note(text) { result.notes.push(text); },
    /** GITHUB_TOKEN, or the case is blocked. */
    needToken() { if (!token) t.blocked('Needs GITHUB_TOKEN (or `gh auth login`)'); return token; },
    /** A value the tester sets up, from the environment, or the case is blocked. */
    needs(name, what) { const v = process.env[name]; if (!v) t.blocked(`Needs ${name}: ${what}`); return v; },

    /** A shell command, as typed in the script, shown in a terminal pane. */
    async sh(command, { env = {}, offline = false, timeout = 180_000, show = true } = {}) {
      const environment = { ...process.env, ...(token ? { GITHUB_TOKEN: token } : {}), ...(offline ? OFFLINE : {}), ...env };
      for (const [k, v] of Object.entries(environment)) if (v === undefined) delete environment[k];
      state.transcript.push({ command: (offline ? '# offline: GitHub unreachable (a proxy on a closed port)\n' : '') + '$ ' + command, output: '…' });
      if (show) await t.terminal(state.transcript);
      const started = Date.now();
      const run = await new Promise((done) => {
        const child = spawn('bash', ['-c', command], { cwd: ROOT, env: environment });
        let stdout = '', stderr = '', all = '';
        child.stdout.on('data', (d) => { stdout += d; all += d; });
        child.stderr.on('data', (d) => { stderr += d; all += d; });
        const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
        child.on('close', (code) => { clearTimeout(timer); done({ stdout, stderr, all, code }); });
      });
      run.ms = Date.now() - started;
      run.lines = run.stdout.replace(/\n$/, '').split('\n');
      state.transcript[state.transcript.length - 1].output = run.all + `[exit ${run.code} · ${(run.ms / 1000).toFixed(1)} s]`;
      if (show) await t.terminal(state.transcript);
      return run;
    },
    /** The terminal pane: the commands of this case and their output. */
    async terminal(entries) {
      const shown = entries.slice(-4).map(({ command, output }) => {
        const lines = output.split('\n');
        const cut = lines.length > 40 ? [...lines.slice(0, 36), `… ${lines.length - 37} more lines …`, lines[lines.length - 1]] : lines;
        return `<div class="cmd">${esc(command)}</div><pre>${esc(cut.join('\n'))}</pre>`;
      }).join('');
      await p.setContent(`<!doctype html><title>Terminal</title><style>
        body{margin:0;background:#16161c;color:#e6e6ea;font:13px/1.45 'DejaVu Sans Mono',monospace;padding:70px 24px 110px}
        .cmd{color:#8fd18f;white-space:pre-wrap;margin-top:12px} pre{margin:2px 0 0;white-space:pre-wrap;word-break:break-all}
        .empty{color:#777}</style><body>${shown || '<div class="empty">QA: ' + esc(script.id) + '</div>'}<script>scrollTo(0, document.body.scrollHeight)</script>`);
      await t.overlay();
    },

    /** `./skill-atlas serve` for this case, stopped at its end; resolves with its URL. */
    async serve({ env = {}, port, offline = false } = {}) {
      const environment = { ...process.env, ...(token ? { GITHUB_TOKEN: token } : {}), ...(offline ? OFFLINE : {}), ...env };
      for (const [k, v] of Object.entries(environment)) if (v === undefined) delete environment[k];
      const chosen = port ?? 4300 + Math.floor(Math.random() * 1500);
      const server = spawn(join(ROOT, 'skill-atlas'), ['serve', '--port', String(chosen)], { cwd: ROOT, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
      let printed = '';
      const url = await new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(new Error(`skill-atlas serve did not start: ${printed}`)), 15_000);
        const read = (d) => { printed += d; const m = /Skill Atlas at (\S+)/.exec(printed); if (m) { clearTimeout(timer); ok(m[1]); } };
        server.stdout.on('data', read);
        server.stderr.on('data', read);
        server.on('exit', (code) => { clearTimeout(timer); fail(new Error(`skill-atlas serve exited (${code}): ${printed.trim()}`)); });
      });
      const stop = () => new Promise((done) => { if (server.exitCode !== null) return done(); server.once('exit', done); server.kill('SIGINT'); });
      cleanup.push(stop);
      return { url, printed: printed.trim(), stop };
    },
    /** Opens a URL in the page; resolves with the response. */
    async open(url) { const response = await p.goto(url, { waitUntil: 'load', timeout: 60_000 }); await t.overlay(); await t.pause(600); return response; },
    /** An API answer, opened in the browser: { status, json, text }. */
    async api(url) {
      const response = await t.open(url);
      const text = await response.text();
      let json; try { json = JSON.parse(text); } catch {}
      return { status: response.status(), json, text };
    },

    // ---- The page: typing and clicking as a tester does, and reading what is on screen.
    async scan(link, { wait = true, timeout = 240_000 } = {}) {
      await p.fill('#repo', '');
      await p.type('#repo', link, { delay: link.length > 60 ? 8 : 25 });
      await p.click('#scan');
      if (wait) await t.scanned(timeout);
    },
    /** Waits until the scan has answered. */
    async scanned(timeout = 240_000) { await p.waitForFunction(() => !document.getElementById('scan').disabled, null, { timeout }); await t.pause(500); },
    async filter(words, { delay = 90 } = {}) { await p.fill('#filter', ''); await p.click('#filter'); if (words) await p.type('#filter', words, { delay }); await t.pause(500); },
    text: (selector) => p.locator(selector).first().innerText({ timeout: 5_000 }).then((s) => s.trim()).catch(() => ''),
    /** The skills on screen: their names, in order. */
    names: () => p.$$eval('#skills li[role="option"]:not([hidden]) .name', (els) => els.map((e) => e.textContent)),
    /** The selected skill's name, '' when none. */
    selected: () => p.$eval('#skill', (e) => e.querySelector('h2')?.textContent ?? '').catch(() => ''),
    async click(name) {
      // The name: a click on a fold opens it, and by design does not select.
      await p.locator('#skills li[role="option"]:not([hidden]) .name', { hasText: new RegExp(`^${name}$`) }).first().click();
      await t.pause(600);
    },
    item: (name) => p.locator('#skills li[role="option"]', { has: p.locator('.name', { hasText: new RegExp(`^${name}$`) }) }).first(),

    /** The case's banner, step and checks, drawn over the page. */
    async overlay() {
      const checks = result.checks.slice(-7).map((c) => ({ mark: c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '–', status: c.status, text: c.text }));
      await p.evaluate(({ title, step, checks }) => {
        let root = document.getElementById('qa-overlay');
        if (!root) {
          root = document.createElement('div');
          root.id = 'qa-overlay';
          root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:13px/1.4 system-ui,sans-serif';
          document.documentElement.append(root);
        }
        const box = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;background:rgba(20,20,30,.88);color:#fff;border-radius:8px;padding:8px 12px;' + css; return d; };
        const top = box('top:8px;left:8px;right:8px;font-weight:600;font-size:14px');
        top.textContent = title;
        const bottom = box('bottom:8px;left:8px;right:420px;max-height:96px;overflow:hidden');
        bottom.textContent = step;
        bottom.hidden = !step;
        const side = box('bottom:8px;right:8px;width:396px');
        for (const c of checks) {
          const row = document.createElement('div');
          row.textContent = c.mark + ' ' + c.text;
          row.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (c.status === 'pass' ? '#9fe09f' : c.status === 'fail' ? '#ff9b9b' : '#e0d08f');
          side.append(row);
        }
        side.hidden = !checks.length;
        root.replaceChildren(top, bottom, side);
      }, { title: `QA ${script.id} · ${script.title}`, step: state.step, checks }).catch(() => {});
    },
  };
  p.on('load', () => { t.overlay(); });
  return t;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

function summary(results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const parts = [`${count('pass')} passed`, `${count('fail')} failed`];
  if (count('blocked')) parts.push(`${count('blocked')} blocked`);
  if (count('not automated')) parts.push(`${count('not automated')} not automated`);
  return `${results.length} cases: ${parts.join(', ')}`;
}

// ---- The report: report.md, report.html (with the videos) and results.json, next to the MP4s.
function writeReport(dir, results) {
  const commit = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return '?'; } })();
  const icon = { pass: '✅ pass', fail: '❌ fail', blocked: '⏸ blocked', 'not automated': '⚪ not automated' };
  const mark = { pass: '✓', fail: '✗', blocked: '–' };
  const md = [
    `# Manual QA · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${commit}`,
    '', summary(results), '',
    '| Case | Result | Video | Failed or blocked |', '| --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} · ${r.title.replace(/\|/g, '\\|')} | ${icon[r.status]} | ${r.video ? `[${r.video}](${r.video})` : ''} | ${r.checks.filter((c) => c.status !== 'pass').map((c) => (c.text + (c.detail ? `: ${c.detail}` : '')).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join('<br>')} |`),
    '',
    ...results.flatMap((r) => [
      `## ${r.id} · ${r.title}`, '',
      `${icon[r.status]} · [${r.file}](../../qa/${r.file})${r.video ? ` · [video](${r.video})` : ''}${r.seconds ? ` · ${r.seconds} s` : ''}`, '',
      ...r.checks.map((c) => `- ${mark[c.status]} ${c.text}${c.detail ? `: \`${c.detail.replace(/`/g, "'")}\`` : ''}`),
      ...r.notes.map((n) => `- note: ${n}`),
      ...r.warnings.map((w) => `- warning: ${w}`),
      ...(r.screenshot ? [`- screenshot: [${r.screenshot}](${r.screenshot})`] : []),
      '',
    ]),
  ].join('\n');
  writeFileSync(join(dir, 'report.md'), md);
  writeFileSync(join(dir, 'results.json'), JSON.stringify({ commit, results }, null, 2));
  const color = { pass: '#1f8a3b', fail: '#c62f2f', blocked: '#a86400', 'not automated': '#777' };
  const html = `<!doctype html><meta charset="utf-8"><title>Manual QA</title><style>
    body{font:14px/1.5 system-ui,sans-serif;margin:0 auto;padding:16px;max-width:1100px;color:#1d1d22}
    .case{border:1px solid #e6e3dc;border-radius:10px;padding:12px 16px;margin:12px 0}
    .status{font-weight:700;margin-right:8px} video{width:100%;max-width:960px;border-radius:8px;margin-top:8px}
    li.fail{color:#c62f2f} li.blocked{color:#a86400} details{margin-top:6px} code{font-size:12px}</style>
    <h1>Manual QA · ${esc(commit)}</h1><p>${esc(summary(results))}</p>
    ${results.map((r) => `<section class="case" id="${r.id}"><div><span class="status" style="color:${color[r.status]}">${esc(r.status.toUpperCase())}</span><b>${esc(r.id)}</b> · ${esc(r.title)}</div>
      <ul>${r.checks.map((c) => `<li class="${c.status}">${mark[c.status]} ${esc(c.text)}${c.detail ? `: <code>${esc(c.detail)}</code>` : ''}</li>`).join('')}${r.warnings.map((w) => `<li class="blocked">warning: ${esc(w)}</li>`).join('')}</ul>
      <details><summary>The script</summary><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><ul>${r.see.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>
      ${r.video ? `<video controls preload="metadata" src="${r.video}"></video>` : ''}</section>`).join('')}`;
  writeFileSync(join(dir, 'report.html'), html);
}
