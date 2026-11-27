// Each case of qa/*.md, as a tester follows it: `t.step(n)` shows step n of the script (its text comes from
// the script), `t.see(text, ok)` checks a point of its "Should see". Keep them in the script's order and words.
import { cpSync, mkdtempSync, readFileSync, appendFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';

const KOOG = '709079e4a34d6c9234583352550e6a2b88a0bb85';
const ANDROID = '6c1bcc42a2cbb45c241fafea9fbd82d32ac4d765';
const MPS = '1cbf7f783dbc5c74c8e5231d31f61b02829143de';
const FIXTURE_NAMES = ['aspect-generator', 'code-style', 'commits', 'lint-checks', 'release-checklist', 'reviews', 'run-tests'];

const same = (actual, expected) => ({ ok: JSON.stringify(actual) === JSON.stringify(expected), detail: `got ${JSON.stringify(actual)}` });
const has = (text, part) => ({ ok: text.includes(part), detail: `got ${JSON.stringify(text.slice(0, 300))}` });
const matches = (text, re) => ({ ok: re.test(text), detail: `got ${JSON.stringify(text.slice(0, 300))}` });
const exit = (run, code) => ({ ok: run.code === code, detail: `exit ${run.code}` });
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedBy = (list, key = (x) => x) => list.every((x, i) => i === 0 || compare(key(list[i - 1]), key(x)) <= 0);
/** A skill line of the CLI: `<name> — <summary>`, or `<name>` alone. */
const skillLines = (lines) => lines.filter((l, i) => i > 0 && l && !l.startsWith(' '));
const nameOf = (line) => line.split(' — ')[0];
const noTrace = (run) => ({ ok: !/\n\s+at .+:\d+:\d+/.test(run.all), detail: 'a stack trace is printed' });
const tmpCopy = () => { const dir = mkdtempSync(join(tmpdir(), 'qa-fixture-')); cpSync(join(import.meta.dirname, '../../../fixture'), dir, { recursive: true }); return dir; };

async function github(t, path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${t.token}`, 'User-Agent': 'skill-atlas-qa' } });
  return response.json();
}
async function ownRepositories(t, owner) {
  const all = [];
  for (let page = 1; ; page++) {
    const list = await github(t, `/orgs/${owner}/repos?per_page=100&page=${page}`);
    all.push(...list);
    if (list.length < 100) break;
  }
  return all.filter((r) => !r.fork).map((r) => r.full_name);
}
/** The CLI's organization output: its header, then a block per repository. */
function organizationOutput(stdout) {
  const [header, ...blocks] = stdout.trimEnd().split('\n\n');
  const m = /^(\S+) · (\d+) skills? in (\d+) of (\d+) repositor(?:y|ies)$/.exec(header) ?? [];
  return { header, owner: m[1], skills: +m[2], withSkills: +m[3], repositories: +m[4], blocks,
    ids: blocks.map((b) => /^(\S+) · \d+ skills?$/.exec(b.split('\n')[0])?.[1]), counts: blocks.map((b) => +(/ · (\d+) skills?$/.exec(b.split('\n')[0])?.[1])) };
}

export const CASES = {
  // ======================== qa/cli.md
  async 'CLI-01'(t) {
    await t.step(1); const a = await t.sh('./skill-atlas');
    await t.step(2); const b = await t.sh('./skill-atlas help');
    await t.see('Both print the same usage', a.stdout === b.stdout && a.stdout.startsWith('Usage: skill-atlas'), a.stdout.slice(0, 200));
    for (const line of ['scan <GitHub URL | directory>', 'scan github.com/<owner>', 'serve [--port <number>]', 'help ']) {
      await t.see(`It lists \`${line.trim()}\` with a description`, () => matches(a.stdout, new RegExp(`^  ${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\S`, 'm')));
    }
    await t.see('Exit code 0', a.code === 0 && b.code === 0, `exit ${a.code}, ${b.code}`);
  },
  async 'CLI-02'(t) {
    await t.step(1); const r = await t.sh('./skill-atlas scan fixture 2>/dev/null');
    await t.see('First line: `fixture · 7 skills`', () => same(r.lines[0], 'fixture · 7 skills'));
    await t.see('The seven skills, in order', () => same(skillLines(r.lines).map(nameOf), FIXTURE_NAMES));
    const links = r.lines.filter((l) => l.startsWith('  file://'));
    await t.see('Each skill, then an indented file:// link to its SKILL.md under fixture/',
      () => ({ ok: links.length === 7 && links.every((l) => /^  file:\/\/\/.*\/fixture\/.*SKILL\.md$/.test(l)) && r.lines.every((l, i) => !(i > 0 && !l.startsWith(' ') && l) || r.lines[i + 1]?.startsWith('  file://')), detail: links.join(' | ') }));
    await t.see('`commits — Write commit messages the way this repository does.`: the first sentence only',
      () => ({ ok: r.lines.includes('commits — Write commit messages the way this repository does.'), detail: r.lines.find((l) => l.startsWith('commits')) }));
    await t.see('Exit code 0', () => exit(r, 0));
  },
  async 'CLI-03'(t) {
    await t.step(1); const r = await t.sh('./skill-atlas scan fixture 2>/dev/null');
    const names = skillLines(r.lines).map(nameOf);
    for (const name of ['weather-retrieval', 'notes', 'commits-example']) await t.see(`\`${name}\` is not listed`, !names.includes(name), names.join(', '));
    const linkOf = (name) => r.lines[r.lines.findIndex((l) => nameOf(l) === name) + 1] ?? '';
    await t.see('`run-tests` is listed', names.includes('run-tests'));
    await t.see('`lint-checks` is listed, from agent/skills', () => has(linkOf('lint-checks'), '/agent/skills/lint-checks/SKILL.md'));
    await t.see('`aspect-generator` is listed, from plugins/mcp-tools/resources/skills', () => has(linkOf('aspect-generator'), '/plugins/mcp-tools/resources/skills/aspect-generator/SKILL.md'));
    await t.see('`code-style` is listed, from .github/skills', () => has(linkOf('code-style'), '/.github/skills/code-style/SKILL.md'));
  },
  async 'CLI-04'(t) {
    await t.step(1); const r = await t.sh('./skill-atlas scan fixture 2>/dev/null');
    const at = r.lines.findIndex((l) => nameOf(l) === 'reviews');
    await t.see('`reviews` listed once', () => same(skillLines(r.lines).filter((l) => nameOf(l) === 'reviews').length, 1));
    await t.see('Linked to .agents/skills/reviews/SKILL.md', () => matches(r.lines[at + 1] ?? '', /\/fixture\/\.agents\/skills\/reviews\/SKILL\.md$/));
    await t.see('Then `  also in .claude/skills/reviews/SKILL.md`', () => same(r.lines[at + 2], '  also in .claude/skills/reviews/SKILL.md'));
    await t.see('No other `also in` line', () => same(r.lines.filter((l) => l.startsWith('  also in')).length, 1));
  },
  async 'CLI-05'(t) {
    await t.step(1); const a = await t.sh('./skill-atlas scan fixture >/dev/null');
    await t.see('One warning line about release-checklist\'s malformed front matter',
      () => matches(a.stderr.trimEnd(), /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: [^\n]*; using the directory name$/));
    await t.step(2); const b = await t.sh('./skill-atlas scan fixture 2>/dev/null | grep -A1 release-checklist');
    await t.see('`release-checklist` still listed, with no description', () => same(b.lines[0], 'release-checklist'));
    await t.see('And its link', () => matches(b.lines[1] ?? '', /^  file:\/\/\/.*\/\.agents\/skills\/release-checklist\/SKILL\.md$/));
    await t.see('Exit code 0', () => exit(a, 0));
  },
  async 'CLI-06'(t) {
    await t.step(1); const r = await t.sh('./skill-atlas scan /no/such/directory');
    await t.see('`Not a GitHub URL or a readable directory: /no/such/directory`', () => same(r.all.trim(), 'Not a GitHub URL or a readable directory: /no/such/directory'));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'CLI-07'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh(`./skill-atlas scan https://github.com/JetBrains/koog/tree/${KOOG}`);
    const link = (name) => `  https://github.com/JetBrains/koog/blob/${KOOG}/.claude/skills/${name}/SKILL.md`;
    const expected = ['JetBrains/koog · 2 skills',
      'add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).',
      link('add-java-code-snippets-in-docs'), '  updated 2026-05-18',
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
      link('split-jvm-nonjvm'), '  updated 2026-03-25', ''].join('\n');
    await t.see('Exactly the listing of the script', () => ({ ok: r.stdout === expected, detail: r.stdout.slice(0, 300) }));
    await t.see('`weather-retrieval` and `arithmetic-evaluator` not listed', !/weather-retrieval|arithmetic-evaluator/.test(r.stdout));
    await t.see('Nothing on stderr; exit code 0', r.stderr === '' && r.code === 0, `exit ${r.code}, stderr ${r.stderr.slice(0, 200)}`);
    for (const name of ['add-java-code-snippets-in-docs', 'split-jvm-nonjvm']) {
      const response = await t.open(link(name).trim());
      await t.see(`The ${name} link opens its SKILL.md on GitHub, at that commit`, response.status() === 200 && t.p.url().includes(KOOG), `HTTP ${response.status()} ${t.p.url()}`);
    }
  },
  async 'CLI-08'(t) {
    const before = (await t.sh('git status --porcelain', { show: false })).stdout;
    await t.step(1); const r = await t.sh('./skill-atlas scan https://github.com/JetBrains/koog');
    await t.see('`JetBrains/koog · <n> skills`', () => matches(r.lines[0], /^JetBrains\/koog · \d+ skills?$/));
    const names = skillLines(r.lines).map(nameOf);
    await t.see('Its skills sorted by name', sortedBy(names), names.join(', '));
    const commits = r.lines.filter((l) => l.startsWith('  https://')).map((l) => /\/blob\/([0-9a-f]{40})\//.exec(l)?.[1]);
    await t.see('Every link pinned to one 40-hex commit, not `main`', commits.length > 0 && commits.every((c) => c && c === commits[0]), commits.join(', '));
    const again = await t.sh('./skill-atlas scan https://github.com/JetBrains/koog');
    const after = (await t.sh('git status --porcelain', { show: true })).stdout;
    await t.see('Run again: nothing stored in the checkout (`git status` unchanged)', before === after && again.code === 0, after);
    if (before) t.note('the checkout was not clean before the run; compared before and after');
  },
  async 'CLI-09'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh(`./skill-atlas scan github.com/JetBrains/android/tree/${ANDROID}`);
    await t.see('`JetBrains/android · 6 skills`', () => same(r.lines[0], 'JetBrains/android · 6 skills'));
    const links = r.lines.filter((l) => l.startsWith('  https://'));
    await t.see('Every link under agent/skills/', links.length === 6 && links.every((l) => l.includes(`/blob/${ANDROID}/agent/skills/`)), links.join(' | '));
    const at = r.lines.indexOf('write-evals — Expertise in building new AI agent evaluations (evals) for Android Studio.');
    await t.see('`write-evals`, linked to agent/skills/android-studio-evals/SKILL.md', at > 0 && r.lines[at + 1]?.endsWith('/agent/skills/android-studio-evals/SKILL.md'), r.lines.find((l) => l.startsWith('write-evals')) ?? 'not listed');
    await t.see('`writing-lint-checks` listed', skillLines(r.lines).some((l) => nameOf(l) === 'writing-lint-checks'));
  },
  async 'CLI-10'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh(`./skill-atlas scan github.com/JetBrains/MPS/tree/${MPS}`);
    await t.see('`JetBrains/MPS · 43 skills`; nothing on stderr', r.lines[0] === 'JetBrains/MPS · 43 skills' && r.stderr === '', `${r.lines[0]}; stderr ${r.stderr.slice(0, 200)}`);
    const plugin = 'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills';
    for (const name of ['mps-tests', 'mps-aspect-generator']) {
      const at = r.lines.findIndex((l) => nameOf(l) === name);
      await t.see(`\`${name}\`: once, linked to .agents, also in .claude and the plugin`, () => ({
        ok: skillLines(r.lines).filter((l) => nameOf(l) === name).length === 1 &&
          r.lines[at + 1] === `  https://github.com/JetBrains/MPS/blob/${MPS}/.agents/skills/${name}/SKILL.md` &&
          r.lines[at + 2] === `  also in .claude/skills/${name}/SKILL.md, ${plugin}/${name}/SKILL.md`,
        detail: r.lines.slice(at, at + 3).join(' | ') }));
    }
    await t.see('All 43 skills have an `also in .claude/skills/…` line', () => same(r.lines.filter((l) => l.startsWith('  also in .claude/skills/')).length, 43));
  },
  async 'CLI-11'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('./skill-atlas scan https://github.com/JetBrains/koog/tree/0000000000000000000000000000000000000000');
    await t.see('`Commit not found: …`', () => same(r.all.trim(), 'Commit not found: https://github.com/JetBrains/koog/tree/0000000000000000000000000000000000000000'));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'CLI-12'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('./skill-atlas scan https://github.com/JetBrains/no-such-repository-qa');
    await t.see('`Repository not found: …`', () => same(r.all.trim(), 'Repository not found: https://github.com/JetBrains/no-such-repository-qa'));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'CLI-13'(t) {
    await t.step(1, 'GitHub made unreachable, and GITHUB_TOKEN=bad');
    await t.step(2); const a = await t.sh('./skill-atlas scan https://github.com/./x', { offline: true, env: { GITHUB_TOKEN: 'bad' } });
    await t.step(3); const b = await t.sh('./skill-atlas scan https://github.com/JetBrains/..', { offline: true, env: { GITHUB_TOKEN: 'bad' } });
    await t.see('`Repository not found: https://github.com/./x`', () => same(a.all.trim(), 'Repository not found: https://github.com/./x'));
    await t.see('`Repository not found: https://github.com/JetBrains/..`', () => same(b.all.trim(), 'Repository not found: https://github.com/JetBrains/..'));
    await t.see('At once, nothing asked of GitHub', a.ms < 3000 && b.ms < 3000, `${a.ms} ms, ${b.ms} ms`);
    await t.see('Exit code 1 each', a.code === 1 && b.code === 1, `exit ${a.code}, ${b.code}`);
  },
  async 'CLI-14'(t) {
    await t.step(1); const r = await t.sh('GITHUB_TOKEN=bad ./skill-atlas scan https://github.com/JetBrains/koog');
    await t.see('`GitHub rejected the token in GITHUB_TOKEN`', () => same(r.all.trim(), 'GitHub rejected the token in GITHUB_TOKEN'));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'CLI-15'(t) {
    t.needToken();
    const url = t.needs('QA_EMPTY_REPO', 'the URL of an empty GitHub repository of your own').replace(/\/$/, '');
    await t.step(1); const r = await t.sh(`./skill-atlas scan ${url}`);
    await t.see('`Repository is empty: <URL>`', () => same(r.all.trim(), `Repository is empty: ${url.replace(/^(?:https?:\/\/)?(?:www\.)?/, 'https://')}`));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'CLI-16'(t) {
    t.needToken();
    const url = t.needs('QA_PRIVATE_REPO', 'the URL of a private repository with a skill, readable with the token').replace(/\/$/, '');
    await t.step(1); const a = await t.sh(`unset GITHUB_TOKEN; ./skill-atlas scan ${url}`);
    await t.see('Without the token: `Repository not found: …`, exit code 1', a.code === 1 && a.all.startsWith('Repository not found: '), a.all.slice(0, 200));
    await t.step(2); const b = await t.sh(`./skill-atlas scan ${url}`);
    await t.see('With it: the repository and its skills, with their descriptions', /^\S+ · [1-9]\d* skills?$/.test(b.lines[0]) && skillLines(b.lines).some((l) => l.includes(' — ')), b.stdout.slice(0, 300));
    await t.see('Exit code 0', () => exit(b, 0));
  },
  async 'CLI-17'(t) {
    await t.step(1); const r = await t.sh('unset GITHUB_TOKEN; ./skill-atlas scan https://github.com/JetBrains/koog');
    const listed = r.code === 0 && /^JetBrains\/koog · \d+ skills?$/.test(r.lines[0]);
    const limited = r.code === 1 && r.all.trim() === 'GitHub rate limit reached (the core limit); set GITHUB_TOKEN';
    await t.see('The skills, or the rate limit message with exit code 1', listed || limited, r.all.slice(0, 300));
    await t.see('Never a stack trace', () => noTrace(r));
    t.note(listed ? 'GitHub answered: the skills were listed' : 'GitHub\'s anonymous limit was spent: the rate limit message');
  },
  async 'CLI-18'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('time ./skill-atlas scan https://github.com/JetBrains/intellij-community');
    await t.see('The repository and its skills', r.code === 0 && /^JetBrains\/intellij-community · \d+ skills?$/.test(r.lines[0]), r.all.slice(0, 200));
    await t.see('In under 5 seconds', r.ms < 5000, `${(r.ms / 1000).toFixed(1)} s`);
  },

  // ======================== qa/organization.md
  async 'ORG-01'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('./skill-atlas scan github.com/getnao 2>/dev/null');
    const o = organizationOutput(r.stdout);
    await t.step(2); await t.open('https://github.com/orgs/getnao/repositories?type=source');
    const own = await ownRepositories(t, 'getnao');
    await t.see('`getnao · <s> skills in <k> of <m> repositories`, <m> without the forks', o.owner === 'getnao' && o.repositories === own.length, `${o.header}; GitHub: ${own.length} without forks`);
    await t.see('One block per repository with skills (<k> blocks)', o.blocks.length === o.withSkills && o.withSkills > 0, `${o.blocks.length} blocks, k = ${o.withSkills}`);
    await t.see('Each block: `getnao/<name> · <n> skills`, then its skills sorted by name, linked',
      () => ({ ok: o.blocks.every((b) => { const lines = b.split('\n'); return /^getnao\/[\w.-]+ · \d+ skills?$/.test(lines[0]) && sortedBy(skillLines(lines).map(nameOf)) && skillLines(lines).every((l) => lines[lines.indexOf(l) + 1]?.startsWith('  https://github.com/')); }), detail: o.blocks.map((b) => b.split('\n')[0]).join(' | ') }));
    await t.see('Blocks sorted by owner/name, ignoring case', sortedBy(o.ids, (id) => id.toLowerCase()), o.ids.join(', '));
    await t.see('The blocks\' counts add up to <s>', o.counts.reduce((a, b) => a + b, 0) === o.skills, `${o.counts.join('+')} vs ${o.skills}`);
    await t.see('Each link pinned: …/blob/<40-hex commit>/…', r.lines.filter((l) => l.startsWith('  https://')).every((l) => /\/blob\/[0-9a-f]{40}\//.test(l)));
  },
  async 'ORG-02'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('./skill-atlas scan github.com/getnao 2>/dev/null');
    const block = organizationOutput(r.stdout).blocks[0] ?? '';
    const id = block.split(' · ')[0];
    const commit = /\/blob\/([0-9a-f]{40})\//.exec(block)?.[1];
    if (!commit) return t.see('A block to pick', false, r.stdout.slice(0, 200));
    await t.step(2, `${id} at ${commit.slice(0, 7)}`); const alone = await t.sh(`./skill-atlas scan github.com/${id}/tree/${commit} 2>/dev/null`);
    await t.see('Exactly the block of step 1, line for line', alone.stdout.trimEnd() === block, alone.stdout.slice(0, 300));
  },
  async 'ORG-03'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('./skill-atlas scan github.com/getnao >/dev/null');
    const warnings = r.stderr.trimEnd().split('\n').filter(Boolean);
    await t.see('Each warning: `warning: getnao/<name>: <file>: …`', warnings.length > 0 && warnings.every((w) => /^warning: getnao\/[\w.-]+: \S+SKILL\.md: /.test(w) || /^warning: getnao\/[\w.-]+: /.test(w)), warnings.slice(0, 3).join(' | ') || 'no warnings');
    const full = await t.sh('./skill-atlas scan github.com/getnao 2>/dev/null');
    const o = organizationOutput(full.stdout);
    await t.see('The scan still lists every repository with skills; exit code 0', r.code === 0 && o.blocks.length === o.withSkills && o.withSkills > 0, `exit ${r.code}; ${o.header}`);
  },
  async 'ORG-04'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('time ./skill-atlas scan github.com/JetBrains 2>/dev/null', { timeout: 600_000 });
    const o = organizationOutput(r.stdout);
    await t.see('`JetBrains · <s> skills in <k> of <m> repositories`, <m> in the hundreds', o.owner === 'JetBrains' && o.repositories >= 100, o.header);
    await t.see('Blocks such as JetBrains/koog and JetBrains/MPS', o.ids.includes('JetBrains/koog') && o.ids.includes('JetBrains/MPS'), o.ids.slice(0, 10).join(', '));
    await t.see('Sorted ignoring case', sortedBy(o.ids, (id) => id.toLowerCase()));
    await t.see('The scan prints (exit code 0)', () => exit(r, 0));
    t.note(`${(r.ms / 1000).toFixed(0)} s`);
  },
  async 'ORG-05'(t) {
    t.needToken();
    const user = t.needs('QA_USER', 'a GitHub user with a skill in a repository of their own');
    await t.step(1); const r = await t.sh(`./skill-atlas scan github.com/${user} 2>/dev/null`);
    const o = organizationOutput(r.stdout);
    await t.see('The shape of ORG-01: the header, then the blocks', o.owner?.toLowerCase() === user.toLowerCase() && o.blocks.length === o.withSkills && o.withSkills > 0, o.header);
  },
  async 'ORG-06'(t) {
    t.needToken();
    await t.step(1); const r = await t.sh('./skill-atlas scan https://github.com/no-such-org-qa-12345');
    await t.see('`Organization not found: …`', () => same(r.all.trim(), 'Organization not found: https://github.com/no-such-org-qa-12345'));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'ORG-07'(t) {
    await t.step(1, 'GitHub made unreachable');
    await t.step(2); const a = await t.sh('./skill-atlas scan https://github.com/..', { offline: true });
    await t.step(3); const b = await t.sh('./skill-atlas scan https://github.com/.', { offline: true });
    await t.see('`Organization not found: https://github.com/..`', () => same(a.all.trim(), 'Organization not found: https://github.com/..'));
    await t.see('`Organization not found: https://github.com/.`', () => same(b.all.trim(), 'Organization not found: https://github.com/.'));
    await t.see('At once, not a network error', a.ms < 3000 && b.ms < 3000, `${a.ms} ms, ${b.ms} ms`);
    await t.see('Exit code 1 each', a.code === 1 && b.code === 1, `exit ${a.code}, ${b.code}`);
  },
  async 'ORG-08'(t) {
    await t.step(1); const r = await t.sh('GITHUB_TOKEN=bad ./skill-atlas scan github.com/getnao');
    await t.see('Only `GitHub rejected the token in GITHUB_TOKEN`', () => same(r.all.trim(), 'GitHub rejected the token in GITHUB_TOKEN'));
    await t.see('Exit code 1', () => exit(r, 1));
  },
  async 'ORG-09'(t) {
    await t.step(1, 'GitHub made unreachable');
    await t.step(2); const r = await t.sh('./skill-atlas scan github.com/getnao', { offline: true });
    await t.see('`Cannot reach GitHub: …`, no partial list', /^Cannot reach GitHub: /.test(r.all) && !r.all.includes('getnao ·'), r.all.slice(0, 200));
    await t.see('No stack trace', () => noTrace(r));
    await t.see('Exit code 1', () => exit(r, 1));
  },

  // ======================== qa/web.md
  async 'WEB-01'(t) {
    await t.step(1); const a = await t.serve({ port: 4173 });
    await t.see('`Skill Atlas at http://127.0.0.1:4173/`', () => same(a.printed, 'Skill Atlas at http://127.0.0.1:4173/'));
    await t.open(a.url);
    await t.see('The page opens at that URL', async () => has(await t.text('h1'), 'Skill Atlas'));
    await a.stop();
    await t.step(2); const b = await t.serve({ port: 4180 });
    await t.see('`Skill Atlas at http://127.0.0.1:4180/`', () => same(b.printed, 'Skill Atlas at http://127.0.0.1:4180/'));
    await t.open(b.url);
    await t.see('The page opens there', async () => has(await t.text('h1'), 'Skill Atlas'));
    const old = await t.sh('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/');
    await t.see('And not on 4173', old.stdout === '000', `HTTP ${old.stdout}`);
  },
  async 'WEB-02'(t) {
    await t.step(1); const a = await t.sh('./skill-atlas serve --port abc', { timeout: 10_000 });
    await t.step(2); const b = await t.sh('./skill-atlas serve --verbose', { timeout: 10_000 });
    for (const r of [a, b]) await t.see('`Usage: skill-atlas serve [--port <number>]`, no server', () => same(r.all.trim(), 'Usage: skill-atlas serve [--port <number>]'));
    await t.see('Exit code 1', a.code === 1 && b.code === 1, `exit ${a.code}, ${b.code}`);
  },
  async 'WEB-03'(t) {
    const s = await t.serve({ port: 4173 });
    await t.step(1); const a = await t.sh("curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:4173/");
    await t.step(2); const b = await t.sh("curl -s -o /dev/null -w '%{http_code}\\n' http://localhost:4173/");
    await t.step(3); const c = await t.sh("curl -s -o /dev/null -w '%{http_code}\\n' -H 'Host: evil.example:4173' http://127.0.0.1:4173/");
    await t.see('Steps 1, 2: 200', a.stdout.trim() === '200' && b.stdout.trim() === '200', `${a.stdout.trim()}, ${b.stdout.trim()}`);
    await t.see('Step 3: 403', () => same(c.stdout.trim(), '403'));
    const ip = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
    if (!ip) await t.skip('Step 4: refused from another machine', 'no network address but loopback');
    else {
      await t.step(4, `here: this machine's own address, ${ip}, not loopback`);
      const d = await t.sh(`curl -s -m 5 -o /dev/null -w '%{http_code}\\n' http://${ip}:4173/; echo "curl exit $?"`);
      await t.see('Step 4: the connection is refused', /^000\ncurl exit 7$/.test(d.stdout.trim()), d.stdout.trim());
    }
    await s.stop();
  },
  async 'WEB-31'(t) {
    t.needToken();
    const box = (selector) => t.p.locator(selector).first().boundingBox();
    // One row: each box's vertical middle inside the h1's height.
    const oneRow = async (...selectors) => {
      const title = await box('h1');
      const boxes = await Promise.all(selectors.map(box));
      const ok = !!title && boxes.every((b) => b && b.y + b.height / 2 > title.y && b.y + b.height / 2 < title.y + title.height);
      return { ok, detail: `h1 ${JSON.stringify(title)}; ${selectors.map((s, i) => `${s} ${JSON.stringify(boxes[i])}`).join('; ')}` };
    };
    const onlyHeader = async () => ({ ok: (await t.p.isHidden('#results')) && (await t.p.isHidden('#list')) && (await t.p.isHidden('#skill')), detail: `#results hidden: ${await t.p.isHidden('#results')}` });
    const s = await t.serve();
    await t.step(1); await t.open(s.url);
    await t.see('The header on one row: `Skill Atlas`, the field and **Scan**', () => oneRow('#repo', '#scan'));
    await t.see('The placeholder `A GitHub link or a local directory`', async () => same(await t.p.getAttribute('#repo', 'placeholder'), 'A GitHub link or a local directory'));
    await t.see('No *Filter the skills* card, no list, no `SKILL.md` view', onlyHeader);
    await t.step(2); await t.scan('https://github.com/JetBrains/no-such-repository-qa', { wait: false });
    const scanning = await t.text('#status');
    await t.see('`Scanning …` in the header, no skills', async () => ({ ok: /^Scanning .+…$/.test(scanning) && (await onlyHeader()).ok, detail: `got ${JSON.stringify(scanning)}` }));
    await t.scanned();
    await t.see('Then `Repository not found: …`', async () => same(await t.text('#status'), 'Repository not found: https://github.com/JetBrains/no-such-repository-qa'));
    await t.see('Still only the header, no skills', onlyHeader);
    await t.step(3); await t.scan(t.fixture);
    await t.see('On the header\'s row, after **Scan**: `fixture · 7 skills`', async () => {
      const row = await oneRow('#status');
      const after = (await box('#status')).x >= (await box('#scan')).x + (await box('#scan')).width;
      return { ok: row.ok && after && (await t.text('#status')) === 'fixture · 7 skills', detail: `${await t.text('#status')}; ${row.detail}` };
    });
    await t.see('Under it, *Filter the skills* and the skills', async () => ({ ok: (await t.p.isVisible('#results')) && (await t.p.isVisible('#filter')) && (await box('#list')).y > (await box('header')).y + (await box('header')).height && (await t.names()).length === 7, detail: `${(await t.names()).length} skills` }));
  },
  async 'WEB-04'(t) {
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan(t.fixture);
    await t.see('`fixture · 7 skills`', async () => same(await t.text('#status'), 'fixture · 7 skills'));
    await t.see('The skills by name', async () => same(await t.names(), FIXTURE_NAMES));
    await t.see('Each with its first sentence, on one line', async () => {
      const shown = await t.p.$$eval('#skills li[role="option"] .clamp', (els) => els.map((e) => e.textContent));
      return { ok: shown.includes('Write commit messages the way this repository does.') && shown.every((s) => !s.includes('\n')), detail: shown.join(' | ') };
    });
    await t.see('weather-retrieval, notes, commits-example not listed', async () => ({ ok: !(await t.names()).some((n) => ['weather-retrieval', 'notes', 'commits-example'].includes(n)) }));
    await t.see('`aspect-generator` selected: its name, link and whole SKILL.md', async () => {
      const file = readFileSync(join(t.fixture, 'plugins/mcp-tools/resources/skills/aspect-generator/SKILL.md'), 'utf8');
      const href = await t.p.getAttribute('#skill a', 'href');
      const text = await t.p.textContent('#skill pre.skill-md');
      return { ok: (await t.selected()) === 'aspect-generator' && href?.endsWith('/aspect-generator/SKILL.md') && text === file, detail: `${await t.selected()} ${href}` };
    });
    await t.see('The release-checklist warning under the field', async () => matches(await t.text('#warnings'), /release-checklist\/SKILL\.md: malformed front matter/));
    await t.see('No organization card', () => t.p.isHidden('#organization'));
  },
  async 'WEB-05'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    await t.step(1); await t.click('commits');
    await t.see('The commits SKILL.md as it is in the file, front matter included', async () => {
      const text = await t.p.textContent('#skill pre.skill-md');
      return { ok: text === readFileSync(join(t.fixture, '.claude/skills/commits/SKILL.md'), 'utf8') && text.includes('Start with the area, then say what changed: `editor: keep the caret after undo`.') && text.startsWith('---\nname: commits'), detail: text.slice(0, 200) };
    });
    await t.step(2); await t.click('reviews');
    await t.see('`also in .claude/skills/reviews/SKILL.md`', async () => same(await t.text('#skill .copies'), 'also in .claude/skills/reviews/SKILL.md'));
  },
  async 'WEB-32'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    const focused = () => t.p.evaluate(() => document.activeElement.closest('li[role="option"]')?.querySelector('.name').textContent ?? document.activeElement.tagName);
    const ring = () => t.p.evaluate(() => { const a = document.activeElement; return a.matches(':focus-visible') && getComputedStyle(a).outlineStyle !== 'none'; });
    await t.step(1); await t.p.focus('#filter'); await t.p.keyboard.press('Tab'); await t.pause(400);
    await t.see('A ring on `aspect-generator`, the selected skill', async () => ({ ok: (await focused()) === 'aspect-generator' && (await ring()) && (await t.selected()) === 'aspect-generator', detail: await focused() }));
    await t.step(2); for (let i = 0; i < 4; i++) { await t.p.keyboard.press('ArrowDown'); await t.pause(300); }
    await t.see('The ring on `release-checklist`; `aspect-generator` stays selected', async () => ({ ok: (await focused()) === 'release-checklist' && (await ring()) && (await t.selected()) === 'aspect-generator', detail: `${await focused()}, selected ${await t.selected()}` }));
    await t.step(3); await t.p.keyboard.press('Enter'); await t.pause(400);
    await t.see('`release-checklist` selected, its SKILL.md shows', async () => ({ ok: (await t.selected()) === 'release-checklist' && (await t.text('#skill pre.skill-md')).includes('release-checklist') }));
    await t.step(4);
    const top = () => t.p.evaluate(() => scrollY);
    const before = await top();
    await t.p.keyboard.press('End'); await t.pause(300);
    const end = await focused();
    await t.p.keyboard.press('ArrowUp'); await t.pause(300); await t.p.keyboard.press(' '); await t.pause(400);
    await t.see('End → `run-tests`, ↑ → `reviews`; Space selects `reviews`; no scroll', async () => ({ ok: end === 'run-tests' && (await focused()) === 'reviews' && (await t.selected()) === 'reviews' && (await top()) === before, detail: `${end}, ${await focused()}, selected ${await t.selected()}, scroll ${before} → ${await top()}` }));
    await t.step(5); await t.p.keyboard.press('Tab'); await t.p.keyboard.press('Enter'); await t.pause(600);
    await t.see("`reviews`' fold unfolds; `reviews` stays selected", async () => ({ ok: (await t.item('reviews').locator('details.description').evaluate((d) => d.open)) && (await t.selected()) === 'reviews', detail: await t.selected() }));
  },
  async 'WEB-06'(t) {
    const dir = join(mkdtempSync(join(tmpdir(), 'qa-')), 'qa-fixture');
    await t.step(1, dir); await t.sh(`cp -r fixture ${dir}`);
    const html = '<b>bold</b> <img src=x onerror=alert(1)>';
    await t.step(2); appendFileSync(join(dir, '.claude/skills/commits/SKILL.md'), html + '\n');
    await t.sh(`tail -2 ${dir}/.claude/skills/commits/SKILL.md`);
    let alerted = false; t.p.on('dialog', (d) => { alerted = true; d.dismiss(); });
    const s = await t.serve(); await t.open(s.url);
    await t.step(3); await t.scan(dir); await t.click('commits');
    await t.see('The characters literally', async () => has(await t.p.textContent('#skill pre.skill-md'), html));
    await t.see('No bold text, no image', async () => ({ ok: (await t.p.$$('#skill b, #skill img')).length === 0 }));
    await t.pause(1000);
    await t.see('No alert', !alerted);
    rmSync(dir, { recursive: true, force: true });
  },
  async 'WEB-07'(t) {
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan(t.fixture);
    const commits = t.item('commits');
    await t.see('`▸ Write commit messages the way this repository does.`', async () => {
      const summary = commits.locator('details.description summary');
      const arrow = await summary.evaluate((e) => getComputedStyle(e, '::before').content).catch(() => '');
      return { ok: arrow.includes('▸') && (await summary.innerText()).trim() === 'Write commit messages the way this repository does.', detail: `${arrow} ${await summary.innerText().catch(() => 'no fold')}` };
    });
    await t.click('reviews');
    await t.step(2); await commits.locator('details.description summary').click(); await t.pause(800);
    await t.see('`▾` and the whole description', async () => {
      const whole = commits.locator('details.description .whole');
      const arrow = await whole.evaluate((e) => getComputedStyle(e, '::before').content).catch(() => '');
      return { ok: arrow.includes('▾') && (await whole.isVisible()) && (await whole.innerText()).endsWith('Use for every commit.'), detail: `${arrow} ${await whole.innerText().catch(() => '')}` };
    });
    await t.see('The selected skill does not change', async () => same(await t.selected(), 'reviews'));
    await t.step(3); await commits.locator('details.description .whole').click(); await t.pause(800);
    await t.see('Folded again, to the first sentence', async () => ({ ok: !(await commits.locator('details.description').evaluate((d) => d.open)) }));
    await t.see('Still the same selected skill', async () => same(await t.selected(), 'reviews'));
    await t.step(4); await t.see('`release-checklist` has no `▸`', async () => ({ ok: (await t.item('release-checklist').locator('details').count()) === 0 }));
    t.needToken();
    await t.scan(`https://github.com/JetBrains/koog/tree/${KOOG}`);
    const long = t.item('add-java-code-snippets-in-docs');
    await t.see('The long sentence cut at two lines, with a `▸`', async () => {
      const clamp = long.locator('.clamp');
      const { lines, cut } = await clamp.evaluate((e) => ({ lines: e.clientHeight / parseFloat(getComputedStyle(e).lineHeight), cut: e.scrollHeight > e.clientHeight + 1 }));
      return { ok: (await long.locator('details.description').count()) === 1 && lines > 1.5 && lines < 2.5 && cut, detail: `${lines.toFixed(2)} lines on screen, cut: ${cut}` };
    });
  },
  async 'WEB-08'(t) {
    t.needToken();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan(`https://github.com/JetBrains/koog/tree/${KOOG}`);
    await t.see('`JetBrains/koog · 2 skills`', async () => same(await t.text('#status'), 'JetBrains/koog · 2 skills'));
    await t.see('add-java-code-snippets-in-docs, split-jvm-nonjvm', async () => same(await t.names(), ['add-java-code-snippets-in-docs', 'split-jvm-nonjvm']));
    await t.step(2, 'opened in this tab, so it shows in the video');
    const href = await t.p.getAttribute('#skill a', 'href');
    const response = await t.open(href);
    await t.see('The link opens the SKILL.md on GitHub, at 709079e…', response.status() === 200 && href.includes(`/blob/${KOOG}/`) && href.endsWith('/SKILL.md'), `HTTP ${response.status()} ${href}`);
  },
  async 'WEB-09'(t) {
    t.needToken();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan('https://github.com/JetBrains/no-such-repository-qa');
    await t.see('`Repository not found: …` under the field', async () => same(await t.text('#status'), 'Repository not found: https://github.com/JetBrains/no-such-repository-qa'));
    await t.step(2); await t.scan('/no/such/directory');
    await t.see('`Not a GitHub URL or a readable directory: /no/such/directory`', async () => same(await t.text('#status'), 'Not a GitHub URL or a readable directory: /no/such/directory'));
    await t.see('No skills, no selected skill', async () => ({ ok: (await t.names()).length === 0 && (await t.selected()) === '' }));
    await t.scan(t.fixture);
    await t.see('The page still works: the fixture\'s skills', async () => same((await t.names()).length, 7));
  },
  async 'WEB-10'(t) {
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan(t.fixture);
    const copied = t.p.url();
    await t.see('`?repo=<the path>` in the address', () => same(new URL(copied).searchParams.get('repo'), t.fixture));
    await t.step(2, 'opened afresh, no click on Scan'); await t.open(copied);
    await t.p.waitForSelector('#skills li[role="option"]', { timeout: 60_000 });
    await t.see('The scan runs at once: the same 7 skills', async () => same(await t.names(), FIXTURE_NAMES));
  },
  async 'WEB-11'(t) {
    t.needToken();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.p.click('#repo');
    await t.p.waitForFunction(() => document.querySelectorAll('#repositories option').length > 0, null, { timeout: 30_000 }).catch(() => {});
    const options = await t.p.$$eval('#repositories option', (els) => els.map((o) => o.value));
    const pushed = await github(t, '/user/repos?sort=pushed&per_page=1');
    await t.see('A list of your repositories, most recently pushed first', options.length > 0 && options[0] === pushed[0]?.html_url, `${options.length} suggestions, first ${options[0]}; GitHub's most recent: ${pushed[0]?.html_url}`);
    await t.p.type('#repo', new URL(options[0] ?? 'https://github.com/x/y').pathname.slice(1, 4), { delay: 120 });
    await t.step(2, 'headless Chrome draws no suggestion list: the pick is the option\'s value filled in');
    await t.p.fill('#repo', options[0] ?? '');
    await t.see('The field holds `https://github.com/<owner>/<repo>`', async () => matches(await t.p.inputValue('#repo'), /^https:\/\/github\.com\/[^/]+\/[^/]+$/));
  },
  async 'WEB-12'(t) {
    await t.step(1); let s = await t.serve({ env: { GITHUB_TOKEN: undefined } }); await t.open(s.url); await t.pause(1000);
    await t.see('No suggestions, and the hint `Set GITHUB_TOKEN to see your repositories`', async () => ({ ok: (await t.text('#suggestions')) === 'Set GITHUB_TOKEN to see your repositories' && (await t.p.$$('#repositories option')).length === 0, detail: await t.text('#suggestions') }));
    await t.scan(t.fixture);
    await t.see('Scanning the fixture still works', async () => same((await t.names()).length, 7));
    await s.stop();
    await t.step(2); s = await t.serve({ env: { GITHUB_TOKEN: 'bad' } }); await t.open(s.url); await t.pause(1500);
    await t.see('`Your repositories: GitHub rejected the token in GITHUB_TOKEN`', async () => same(await t.text('#suggestions'), 'Your repositories: GitHub rejected the token in GITHUB_TOKEN'));
    await t.scan(t.fixture);
    await t.see('Scanning the fixture still works', async () => same((await t.names()).length, 7));
  },
  async 'WEB-13'(t) {
    await t.step(1); const r = await t.sh('./skill-atlas help');
    await t.see('`serve [--port <number>]` is listed', () => matches(r.stdout, /^  serve \[--port <number>\] +\S/m));
    t.note('the browser terminal half is covered by npm test only, as the script says');
  },
  async 'WEB-14'(t) {
    t.needToken();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan('https://github.com/getnao');
    const own = await ownRepositories(t, 'getnao');
    const status = await t.text('#status');
    const m = /^getnao · (\d+) skills? in (\d+) of (\d+) repositor(?:y|ies)$/.exec(status) ?? [];
    await t.see('`getnao · <s> skills`, `<k> of <m> repositories`, forks left out', +m[3] === own.length, `${status}; GitHub: ${own.length} without forks`);
    const groups = await t.p.$$eval('#skills li', (els) => {
      const out = [];
      for (const li of els) if (li.classList.contains('group')) out.push({ text: li.textContent, href: li.querySelector('a').href, names: [] }); else out.at(-1)?.names.push(li.querySelector('.name').textContent);
      return out;
    });
    await t.see('A heading per repository, `getnao/<name> · N skills`, linked, its skills under it sorted by name', () => ({
      ok: groups.length > 0 && groups.every((g) => { const h = /^(getnao\/[\w.-]+) · (\d+) skills?$/.exec(g.text); return h && g.href === `https://github.com/${h[1]}` && +h[2] === g.names.length && sortedBy(g.names); }),
      detail: groups.map((g) => `${g.text} (${g.names.length})`).join(' | ') }));
    const ids = groups.map((g) => g.text.split(' · ')[0]);
    await t.see('Repositories sorted ignoring case; only those with skills', sortedBy(ids, (id) => id.toLowerCase()) && groups.length === +m[2], ids.join(', '));
    await t.see('Warnings prefixed with `getnao/<name>:`', async () => {
      const warnings = await t.p.$$eval('#warnings li', (els) => els.map((e) => e.textContent));
      return { ok: warnings.every((w) => /^getnao\/[\w.-]+: /.test(w)), detail: warnings.slice(0, 3).join(' | ') };
    });
  },
  async 'WEB-15'(t) {
    t.needToken();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan('https://github.com/getnao', { wait: false });
    await t.see('While scanning: the card, `github.com/getnao`, a pill `…`, the bar moving', async () => {
      const state = await t.p.evaluate(() => ({ hidden: document.getElementById('organization').hidden, name: document.getElementById('org-name').textContent, pill: document.getElementById('org-count').textContent, running: document.getElementById('org-progress').classList.contains('running'), now: document.getElementById('org-progress').getAttribute('aria-valuenow') }));
      return { ok: !state.hidden && state.name === 'github.com/getnao' && state.pill === '…' && state.running && state.now === null, detail: JSON.stringify(state) };
    });
    await t.see('The card above the skills', async () => ({ ok: (await t.p.locator('#organization').boundingBox()).y < (await t.p.locator('#list').boundingBox()).y }));
    await t.step(2); await t.scanned();
    const own = await ownRepositories(t, 'getnao');
    await t.see('The pill `<m> repositories`, forks left out', async () => same(await t.text('#org-count'), `${own.length} repositories`));
    await t.see('The bar full', async () => ({ ok: await t.p.evaluate(() => { const e = document.getElementById('org-progress'); return !e.classList.contains('running') && e.getAttribute('aria-valuenow') === '100'; }) }));
    const card = async () => t.p.evaluate(() => ({
      label: document.getElementById('org-label').textContent, more: document.getElementById('org-more').textContent,
      top: [...document.querySelectorAll('#org-top li')].map((li) => ({ name: li.querySelector('a').textContent, href: li.querySelector('a').href, skills: li.querySelector('.skills').textContent, font: getComputedStyle(li.querySelector('a')).fontFamily })),
      groups: [...document.querySelectorAll('#skills li.group a')].map((a) => a.textContent),
    }));
    const ranking = (groups) => groups.map((g) => { const [id, n] = g.split(' · '); return { id, n: parseInt(n) }; })
      .sort((a, b) => b.n - a.n || compare(a.id.toLowerCase(), b.id.toLowerCase()));
    const checkTop = async (owner) => {
      const c = await card();
      const expected = ranking(c.groups).slice(0, 3).map((g) => ({ name: g.id.slice(owner.length + 1), href: `https://github.com/${g.id}`, skills: `${g.n} skill${g.n === 1 ? '' : 's'}` }));
      return { c, ok: JSON.stringify(c.top.map(({ font, ...x }) => x)) === JSON.stringify(expected) && c.top.every((x) => /mono/i.test(x.font)), detail: `${JSON.stringify(c.top.map(({ font, ...x }) => x))} expected ${JSON.stringify(expected)}` };
    };
    const small = await checkTop('getnao');
    await t.see('The top repositories, most skills first, by name, in monospace, linked, `N skills`', small);
    const k = small.c.groups.length;
    if (k <= 3) await t.see(`\`${k} with skills\`, no \`among them\`, no \`+<n> more\``, small.c.label === `${k} with skills` && small.c.more === '', `${small.c.label} / ${small.c.more}`);
    else await t.see(`\`${k} with skills, among them\`, \`+${k - 3} more\``, small.c.label === `${k} with skills, among them` && small.c.more === `+${k - 3} more`, `${small.c.label} / ${small.c.more}`);
    await t.step(3); await t.scan('https://github.com/JetBrains', { timeout: 600_000 });
    const big = await checkTop('JetBrains');
    await t.see('JetBrains: the top 3', big);
    const n = big.c.groups.length;
    await t.see('`<k> with skills, among them`, `+<k − 3> more`', n > 3 && big.c.label === `${n} with skills, among them` && big.c.more === `+${n - 3} more`, `${big.c.label} / ${big.c.more} (${n} groups)`);
  },
  async 'WEB-16'(t) {
    const s = await t.serve(); await t.open(s.url);
    const user = process.env.QA_USER_NO_SKILLS;
    if (!user || !t.token) await t.skip('Step 1: `No repository with skills`', !t.token ? 'needs GITHUB_TOKEN' : 'needs QA_USER_NO_SKILLS: a GitHub user or organization whose repositories have no skills');
    else {
      await t.step(1); await t.scan(`https://github.com/${user}`);
      await t.see('The card, with `No repository with skills`', async () => ({ ok: !(await t.p.isHidden('#organization')) && (await t.text('#org-label')) === 'No repository with skills', detail: await t.text('#org-label') }));
    }
    t.needToken();
    await t.step(2); await t.scan('https://github.com/no-such-org-qa-12345');
    await t.see('No card; `Organization not found: …` under the field', async () => ({ ok: (await t.p.isHidden('#organization')) && (await t.text('#status')) === 'Organization not found: https://github.com/no-such-org-qa-12345', detail: await t.text('#status') }));
    await t.step(3); await t.scan(t.fixture);
    await t.see('No card for a local directory', () => t.p.isHidden('#organization'));
    await t.scan('https://github.com/JetBrains/koog');
    await t.see('Nor for a repository', async () => ({ ok: (await t.p.isHidden('#organization')) && (await t.names()).length > 0 }));
  },
  async 'WEB-17'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    const warnings = await t.text('#warnings');
    let scans = 0; t.p.on('request', (r) => { if (r.url().includes('/api/scan')) scans++; });
    await t.step(1); await t.p.click('#filter');
    const counts = [];
    for (const key of 'use before') { await t.p.type('#filter', key); await t.pause(120); counts.push((await t.names()).length); }
    await t.see('The list narrows with each key', counts.every((n, i) => i === 0 || n <= counts[i - 1]) && counts[0] < 7, counts.join(' → '));
    await t.see('No new scan: no request, the warnings stay', scans === 0 && (await t.text('#warnings')) === warnings, `${scans} scans`);
    const three = async () => ({ ok: JSON.stringify(await t.names()) === JSON.stringify(['code-style', 'reviews', 'run-tests']) && (await t.text('#status')) === 'fixture · 3 of 7 skills' && (await t.text('#count')) === '3 of 7', detail: `${await t.names()} · ${await t.text('#status')} · ${await t.text('#count')}` });
    await t.see('code-style, reviews, run-tests; `fixture · 3 of 7 skills`, the pill `3 of 7`', three);
    await t.step(2); await t.filter('before use');
    await t.see('The same, words in any order', three);
    await t.step(3); await t.filter('generator plugin');
    await t.see('Only aspect-generator', async () => same(await t.names(), ['aspect-generator']));
  },
  async 'WEB-18'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    const all = async () => ({ ok: (await t.names()).length === 7 && (await t.text('#status')) === 'fixture · 7 skills' && (await t.text('#count')) === '7 skills', detail: `${(await t.names()).length} · ${await t.text('#status')} · ${await t.text('#count')}` });
    await t.step(1); await t.filter('   ');
    await t.see('Spaces only: every skill, `fixture · 7 skills`, the pill `7 skills`', all);
    await t.step(2); await t.filter('');
    await t.see('Cleared: the same', all);
  },
  async 'WEB-19'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    await t.step(1); await t.filter('TEST');
    await t.see('`run-tests` listed', async () => same(await t.names(), ['run-tests']));
    const marks = async (sel) => t.item('run-tests').locator(`${sel} mark`).allTextContents();
    await t.see('`test` highlighted in its name', async () => same(await marks('.name'), ['test']));
    await t.see('And in `tests` in its description', async () => same(await marks('.snippet'), ['test']));
    await t.see('Whatever its case: the upper-case word highlights lower-case text', async () => ({ ok: (await marks('.name')).every((m) => m.toLowerCase() === 'test') }));
  },
  async 'WEB-20'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    const snippet = (name) => t.item(name).locator('.snippet');
    await t.step(1); await t.filter('merging');
    await t.see('`reviews`, a one-line snippet around `merging`, `…` where it is cut', async () => {
      const text = await snippet('reviews').innerText();
      return { ok: (await t.names()).join() === 'reviews' && text.startsWith('…') && text.includes('Use before merging.') && !text.includes('\n') && (await t.item('reviews').locator('.description').isHidden()), detail: text };
    });
    await t.step(2); await t.filter('lint');
    await t.see('`lint-checks`, the snippet from the start of its description, `lint` highlighted in both', async () => {
      const text = await snippet('lint-checks').innerText();
      return { ok: text === 'Write a lint check for this repository. Use when adding an inspection.' && (await t.item('lint-checks').locator('.name mark').allTextContents()).join() === 'lint' && (await snippet('lint-checks').locator('mark').allTextContents()).join() === 'lint', detail: text };
    });
    await t.step(3); await t.filter('commits');
    await t.see('`commits`, highlighted in the name only; its description as without a filter, with `▸`', async () => {
      const item = t.item('commits');
      return { ok: (await item.locator('.name mark').allTextContents()).join() === 'commits' && (await item.locator('.snippet').isHidden()) && (await item.locator('details.description summary').innerText()).trim() === 'Write commit messages the way this repository does.', detail: await item.innerText() };
    });
  },
  async 'WEB-21'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    await t.step(1); await t.filter('zzz');
    await t.see('`No skills match "zzz"`', async () => same(await t.text('#no-match'), 'No skills match "zzz"'));
    await t.see('An empty list; no selected skill', async () => ({ ok: (await t.names()).length === 0 && (await t.selected()) === '' }));
    await t.see('On the right, `Select a skill to read its SKILL.md.`', async () => same(await t.text('#skill'), 'Select a skill to read its SKILL.md.'));
  },
  async 'WEB-22'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    await t.step(1); await t.click('reviews');
    await t.step(2); await t.filter('use before');
    await t.see('`reviews` still selected', async () => same(await t.selected(), 'reviews'));
    await t.step(3); await t.filter('commit');
    await t.see('`reviews` does not match: the first match, `code-style`, selected', async () => ({ ok: (await t.selected()) === 'code-style' && (await t.names())[0] === 'code-style', detail: `${await t.selected()}; ${await t.names()}` }));
  },
  async 'WEB-23'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    await t.step(1); await t.filter('use before');
    await t.step(2); await t.scan(t.fixture);
    await t.see('The filter field still holds `use before`', async () => same(await t.p.inputValue('#filter'), 'use before'));
    await t.see('The new skills filtered by it', async () => same(await t.names(), ['code-style', 'reviews', 'run-tests']));
  },
  async 'WEB-24'(t) {
    const s = await t.serve(); await t.open(s.url); await t.scan(t.fixture);
    await t.step(1); await t.filter('use');
    const partial = new URL(t.p.url()).searchParams.get('filter');
    await t.p.type('#filter', ' before', { delay: 90 }); await t.pause(400);
    const address = t.p.url();
    await t.see('`?repo=…&filter=use+before`, updated as you type', new URL(address).searchParams.get('filter') === 'use before' && new URL(address).searchParams.get('repo') === t.fixture && partial === 'use', `${address} (while typing: ${partial})`);
    await t.step(2); await t.open(address);
    // The first skill in the list, aspect-generator, is filtered out (hidden): wait for one shown.
    await t.p.waitForSelector('#skills li[role="option"]:not([hidden])', { timeout: 60_000 });
    await t.see('The scan and the filter at once: `3 of 7`', async () => ({ ok: (await t.text('#count')) === '3 of 7' && (await t.p.inputValue('#filter')) === 'use before', detail: await t.text('#count') }));
    await t.step(3); await t.filter('');
    await t.see('No `filter=`, `repo=` stays', () => { const u = new URL(t.p.url()); return { ok: !u.searchParams.has('filter') && u.searchParams.get('repo') === t.fixture, detail: t.p.url() }; });
  },
  async 'WEB-25'(t) {
    t.needToken();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan('https://github.com/getnao');
    const unfiltered = await t.text('#status');
    const total = +(/ · (\d+) skills? in /.exec(unfiltered)?.[1]);
    const word = await t.p.$$eval('#skills li', (els) => {
      const i = els.findIndex((e) => e.classList.contains('group') && e.textContent.startsWith('getnao/nao '));
      return els[i + 1]?.querySelector('.name')?.textContent ?? '';
    });
    await t.step(2, `\`${word}\``); await t.filter(word, { delay: 40 });
    const view = await t.p.$$eval('#skills li', (els) => els.filter((e) => !e.hidden).map((e) => (e.classList.contains('group') ? 'H' : 'S')).join(''));
    await t.see('A repository\'s heading only over a match', view.length > 0 && /^(HS+)+$/.test(view), view);
    const shown = (await t.names()).length;
    await t.see('`getnao · <n> of <s> skills`', async () => same(await t.text('#status'), `getnao · ${shown} of ${total} skills`));
    await t.filter('');
    await t.see('Cleared: the organization\'s count, `<k> of <m> repositories`', async () => same(await t.text('#status'), unfiltered));
  },
  async 'WEB-26'(t) {
    const s = await t.serve();
    await t.step(1); const a = await t.api(`${s.url}api/scan?repo=${encodeURIComponent(t.fixture)}`);
    await t.see('JSON `{ repository, skills, warnings }`', a.status === 200 && a.json && ['repository', 'skills', 'warnings'].every((k) => k in a.json), a.text.slice(0, 200));
    await t.see('Each skill: name, description (one line), summary, path, link, copies, text', () => ({ ok: a.json.skills.length === 7 && a.json.skills.every((k) => ['name', 'description', 'summary', 'path', 'link', 'copies', 'text'].every((f) => f in k) && !k.description.includes('\n') && k.text.startsWith('---')), detail: JSON.stringify(a.json.skills[0]).slice(0, 300) }));
    await t.see('`reviews` has `copies: [".claude/skills/reviews/SKILL.md"]`', () => same(a.json.skills.find((k) => k.name === 'reviews')?.copies, ['.claude/skills/reviews/SKILL.md']));
    await t.see('`warnings` has the release-checklist one', () => ({ ok: a.json.warnings.some((w) => w.includes('release-checklist')) }));
    await t.step(2); const b = await t.api(`${s.url}api/scan`);
    await t.see('`{"error":"Enter a repository link"} 400`', b.status === 400 && b.text === '{"error":"Enter a repository link"}', `${b.text} ${b.status}`);
    await t.step(3); const c = await t.api(`${s.url}api/scan?repo=/no/such/directory`);
    await t.see('`{"error":"Not a GitHub URL or a readable directory: /no/such/directory"} 400`', c.status === 400 && c.text === '{"error":"Not a GitHub URL or a readable directory: /no/such/directory"}', `${c.text} ${c.status}`);
  },
  async 'WEB-27'(t) {
    t.needToken();
    const s = await t.serve();
    await t.step(1); const a = await t.api(`${s.url}api/scan?repo=https://github.com/getnao`);
    const own = await ownRepositories(t, 'getnao');
    const j = a.json ?? {};
    await t.see('JSON `{ organization, repositories, warnings }`', a.status === 200 && ['organization', 'repositories', 'warnings'].every((k) => k in j), a.text.slice(0, 200));
    await t.see('`organization`: id `getnao`, url, repositories (forks left out)', j.organization?.id === 'getnao' && typeof j.organization?.url === 'string' && j.organization?.repositories === own.length, `${JSON.stringify(j.organization)}; GitHub: ${own.length}`);
    await t.see('`repositories`: only those with skills, each `{ repository, skills }`', Array.isArray(j.repositories) && j.repositories.length > 0 && j.repositories.every((r) => r.repository && r.skills?.length > 0), `${j.repositories?.length} repositories`);
  },
  async 'WEB-28'(t) {
    t.needToken();
    await t.step(1); let s = await t.serve(); const a = await t.api(`${s.url}api/repositories`);
    const list = a.json?.repositories ?? [];
    const pushed = await github(t, '/user/repos?sort=pushed&per_page=1');
    await t.see('`{ repositories }`, most recently pushed first, at most 300', list.length > 0 && list.length <= 300 && list[0].full_name === pushed[0]?.full_name, `${list.length}; first ${list[0]?.full_name}, GitHub's ${pushed[0]?.full_name}`);
    await t.see('Each: full_name, url `https://github.com/<owner>/<repo>`, description (`""` if none)', list.every((r) => typeof r.full_name === 'string' && r.url === `https://github.com/${r.full_name}` && typeof r.description === 'string'), JSON.stringify(list.find((r) => !(r.url === `https://github.com/${r.full_name}` && typeof r.description === 'string')) ?? ''));
    await s.stop();
    await t.step(2); s = await t.serve({ env: { GITHUB_TOKEN: undefined } }); const b = await t.api(`${s.url}api/repositories`);
    await t.see('`{"repositories":[],"hint":"Set GITHUB_TOKEN to see your repositories"}`', () => same(b.text, '{"repositories":[],"hint":"Set GITHUB_TOKEN to see your repositories"}'));
    await s.stop();
    await t.step(3); s = await t.serve({ env: { GITHUB_TOKEN: 'bad' } }); const c = await t.api(`${s.url}api/repositories`);
    await t.see('`{"repositories":[],"error":"GitHub rejected the token in GITHUB_TOKEN"} 200`', c.text === '{"repositories":[],"error":"GitHub rejected the token in GITHUB_TOKEN"}' && c.status === 200, `${c.text} ${c.status}`);
  },
  async 'WEB-29'(t) {
    const before = (await t.sh('git status --porcelain', { show: false })).stdout;
    const dir = tmpCopy();
    const s = await t.serve(); await t.open(s.url);
    await t.step(1); await t.scan(dir); await t.click('commits');
    await t.step(2);
    const file = join(dir, '.claude/skills/commits/SKILL.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Write commit messages the way this repository does.', 'Changed by QA, just now.'));
    await t.scan(dir);
    await t.see('The new description at once', async () => ({ ok: (await t.item('commits').innerText()).includes('Changed by QA, just now.') }));
    const after = (await t.sh('git status --porcelain')).stdout;
    await t.see('`git status` in the checkout unchanged', before === after, after);
    rmSync(dir, { recursive: true, force: true });
  },
};
