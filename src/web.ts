// The local web view: a page with a field for a repository link, its skills and their SKILL.md.
// The same core as the CLI; the page asks GET /api/scan?repo=<URL> and renders the answer, and
// GET /api/repositories for the user's GitHub repositories to suggest in the field.
// Nothing is stored: every scan is fresh.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import type { UserRepositories } from './core/github.ts';
import { firstSentence, skillLink } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user typed into the field. */
  open(input: string): Promise<Source>;
  /** The user's repositories, suggested in the field; none without it. */
  repositories?(): Promise<UserRepositories>;
};

/** What GET /api/repositories answers: the suggestions, a hint without a token, or GitHub's failure. */
export type RepositoriesAnswer = UserRepositories & { error?: string };

/** What GET /api/scan answers: the repository, each skill with its link and SKILL.md, and warnings. */
export type ScanAnswer = {
  repository: { id: string; url: string; commit: string };
  skills: {
    id: string;
    name: string;
    /** The whole description, on one line. */
    description: string;
    /** Its first sentence: the folded description. */
    summary: string;
    path: string;
    link: string;
    copies: string[];
    text: string;
  }[];
  warnings: string[];
};

export function createWebServer({ open, repositories }: WebOptions): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    // Only this machine's own names: a page that rebinds its domain to 127.0.0.1 sends its own Host.
    const port = request.socket.localPort;
    if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) {
      return send(403, 'text/plain', 'Forbidden: open the page at 127.0.0.1 or localhost');
    }
    if (request.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname === '/api/repositories') {
      // Only suggestions: a failure is a message beside the field, never a broken page.
      let answer: RepositoriesAnswer;
      try {
        answer = repositories ? await repositories() : { repositories: [] };
      } catch (error) {
        answer = { repositories: [], error: error instanceof Error ? error.message : String(error) };
      }
      return send(200, 'application/json', JSON.stringify(answer));
    }
    if (url.pathname !== '/api/scan') return send(404, 'text/plain', 'Not found');

    const repo = url.searchParams.get('repo')?.trim();
    if (!repo) return send(400, 'application/json', JSON.stringify({ error: 'Enter a repository link' }));
    try {
      const result = await scan(await open(repo));
      const { repository } = result;
      const answer: ScanAnswer = {
        repository: { id: repository.id, url: repository.url, commit: repository.commit },
        skills: result.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description.replace(/\s+/g, ' ').trim(),
          summary: firstSentence(skill.description),
          path: skill.path,
          link: skillLink(repository, skill),
          copies: skill.copies,
          text: skill.text,
        })),
        warnings: result.warnings,
      };
      send(200, 'application/json', JSON.stringify(answer));
    } catch (error) {
      if (error instanceof AtlasError) return send(400, 'application/json', JSON.stringify({ error: error.message }));
      send(500, 'application/json', JSON.stringify({ error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` }));
    }
  });
}

// The filter's functions. The page runs these very functions, so they stay plain JavaScript once
// their types are stripped, and use nothing but each other.

/** The filter's words: split on spaces, lower case. */
export function filterWords(filter: string): string[] {
  return filter.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Whether a skill matches the filter field: every word (split on spaces), in any order, as part of
 * a word in its name or description, case-insensitive. No words → every skill.
 */
export function matchesFilter(skill: { name: string; description: string }, filter: string): boolean {
  const text = (skill.name + ' ' + skill.description).toLowerCase();
  return filterWords(filter).every((word) => text.includes(word));
}

/**
 * Where the filter's words are in a text, to highlight: every occurrence of every word,
 * case-insensitive, as [start, end) ranges in order; overlapping or touching ones merged.
 */
export function highlightRanges(text: string, filter: string): [number, number][] {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const word of filterWords(filter)) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + 1)) ranges.push([at, at + word.length]);
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * The part of a description around the filter's first match in it: from the start of a word at most
 * 30 characters before the match, to at most 80 characters after it, with `…` where it is cut.
 * null when no word of the filter is in the description.
 */
export function filterSnippet(description: string, filter: string): string | null {
  const first = highlightRanges(description, filter)[0];
  if (!first) return null;
  let start = Math.max(0, first[0] - 30);
  if (start > 0) {
    const space = description.indexOf(' ', start - 1);
    start = space !== -1 && space < first[0] ? space + 1 : first[0];
  }
  const end = Math.min(description.length, first[1] + 80);
  return (start > 0 ? '…' : '') + description.slice(start, end).trim() + (end < description.length ? '…' : '');
}

/** The count in the filter field: the matches while it has words, else every skill. */
export function filterCount(shown: number, total: number, filter: string): string {
  if (filterWords(filter).length) return shown + ' of ' + total;
  return total + (total === 1 ? ' skill' : ' skills');
}

/** Starts the server on 127.0.0.1 and resolves with its address once it listens. */
export async function serve(options: WebOptions & { port: number }): Promise<{ server: Server; url: string }> {
  const server = createWebServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  return { server, url: `http://127.0.0.1:${port}/` };
}

// The page. All content goes in through textContent: a SKILL.md is never HTML to the page.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root {
    --page: #f9f8f5; --card: #fff; --panel: #f6f5f1; --line: #e6e3dc; --ink: #1d1d22; --muted: #6e6e76;
    --accent: #3f48c8; --tile: #eceefb; --mark: #fbe6a2; --error: #c62f2f; --warn: #a86400;
    --sans: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Liberation Sans', system-ui, sans-serif;
    --mono: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: var(--page); color: var(--ink); font: 15px/1.45 var(--sans); }
  svg.icon { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 2px 10px #0000000d, 0 1px 2px #0000000a; padding: 20px; min-width: 0; }
  .card-title { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .card-title h1, .card-title h2 { margin: 0; font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; word-break: break-word; }
  .tile { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 12px; background: var(--tile); color: var(--accent); flex: none; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
  .field { display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 14px; background: var(--card); border: 2px solid var(--accent); border-radius: 12px; color: var(--accent); }
  .field svg.icon { width: 18px; height: 18px; }
  .field input { flex: 1; min-width: 0; padding: 6px 0; font: inherit; font-size: 17px; border: 0; outline: none; background: transparent; color: var(--ink); }
  .pill { padding: 5px 14px; border: 0; border-radius: 999px; background: var(--accent); color: #fff; font: 600 15px/1.4 var(--sans); white-space: nowrap; }
  .pill:empty { display: none; }
  button.pill { cursor: pointer; }
  button.pill:disabled { opacity: .6; cursor: wait; }
  header.card { margin-bottom: 24px; }
  #suggestions { margin-top: 6px; color: var(--muted); font-size: 12px; }
  #suggestions:empty { display: none; }
  #status { margin-top: 10px; color: var(--muted); min-height: 1.4em; }
  #status.error { color: var(--error); }
  #warnings { margin: 6px 0 0; padding-left: 20px; color: var(--warn); font-size: 13px; }
  #warnings:empty { display: none; }
  main { display: grid; grid-template-columns: minmax(320px, 560px) minmax(0, 1fr); gap: 24px; align-items: start; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  #no-match { margin: 12px 4px 2px; color: var(--muted); }
  #no-match:empty { display: none; }
  #skills { list-style: none; margin: 8px 0 0; padding: 0; }
  #skills:empty { display: none; }
  #skills [hidden] { display: none !important; }
  #skills li { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 14px; align-items: baseline; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
  #skills li:hover { background: #eeece6; }
  #skills li[aria-selected="true"] { background: var(--tile); box-shadow: inset 3px 0 0 var(--accent); }
  #skills .name { font: 15px/1.5 var(--mono); white-space: nowrap; }
  #skills .description, #skills .snippet { color: var(--muted); font-size: 14px; min-width: 0; }
  #skills .snippet { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  mark { background: var(--mark); color: inherit; border-radius: 4px; padding: 0 1px; }
  /* At most two lines, folded or not; the fold's own marker shows that it unfolds. */
  #skills .description .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  #skills details.description summary { display: flex; gap: 4px; cursor: pointer; list-style: none; }
  #skills details.description summary::-webkit-details-marker { display: none; }
  #skills details.description summary::before, #skills details.description .whole::before { color: var(--accent); flex: none; }
  #skills details.description summary::before { content: '▸'; }
  #skills details.description .whole::before { content: '▾ '; }
  #skills details.description .whole { cursor: pointer; }
  #skills details.description[open] summary { display: none; }
  #skill:empty { display: none; }
  #skill .card-title h2 { font-family: var(--mono); font-size: 21px; letter-spacing: 0; }
  #skill a { color: var(--accent); word-break: break-all; font-size: 13px; }
  #skill .copies { margin-top: 2px; color: var(--muted); font-size: 13px; }
  pre { margin: 12px 0 0; white-space: pre-wrap; word-wrap: break-word; font: 13px/1.55 var(--mono); background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
</style>
</head>
<body>
<header class="card">
  <div class="card-title">
    <span class="tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
    <h1>Skill Atlas</h1>
  </div>
  <form id="form" class="field">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    <input id="repo" name="repo" type="text" placeholder="https://github.com/owner/repo" aria-label="Repository link" list="repositories" autocomplete="off" autofocus>
    <datalist id="repositories"></datalist>
    <button id="scan" class="pill" type="submit">Scan</button>
  </form>
  <div id="suggestions"></div>
  <div id="status"></div>
  <ul id="warnings"></ul>
</header>
<main>
  <section id="list" class="card">
    <div class="card-title">
      <span class="tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg></span>
      <h2>Filter the skills</h2>
    </div>
    <div class="panel">
      <label class="field">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
        <input id="filter" type="search" placeholder="Filter by words in a name or description" aria-label="Filter skills" autocomplete="off">
        <span id="count" class="pill" aria-live="polite"></span>
      </label>
      <ul id="skills" role="listbox" aria-label="Skills"></ul>
      <p id="no-match"></p>
    </div>
  </section>
  <section id="skill" class="card"></section>
</main>
<template id="file-icon"><span class="tile"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg></span></template>
<script>
const $ = (id) => document.getElementById(id);
${filterWords}
${matchesFilter}
${highlightRanges}
${filterSnippet}
${filterCount}

// The last scan: its repository, and each skill with its item in the list; the selected one.
let scanned = null;
let selected = null;
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// A text as nodes, the filter's words in it highlighted.
function marked(text, filter) {
  const nodes = [];
  let at = 0;
  for (const [start, end] of highlightRanges(text, filter)) {
    if (start > at) nodes.push(document.createTextNode(text.slice(at, start)));
    nodes.push(el('mark', '', text.slice(start, end)));
    at = end;
  }
  if (at < text.length) nodes.push(document.createTextNode(text.slice(at)));
  return nodes;
}

// The first sentence, at most two lines; when there is more, a fold that opens to the whole description.
function description(skill) {
  const short = el('span', 'clamp', skill.summary);
  if (skill.summary !== skill.description) return fold(short, skill.description);
  const plain = el('div', 'description');
  plain.append(short);
  return plain;
}

// One sentence that is longer than its two lines folds too, once it is on screen and measured.
function foldIfClamped(item, skill) {
  const short = item.querySelector('div.description > .clamp');
  if (short && short.scrollHeight > short.clientHeight + 1) short.parentElement.replaceWith(fold(short, skill.description));
}

function fold(short, text) {
  const fold = el('details', 'description');
  const summary = el('summary');
  summary.title = 'Show the whole description';
  summary.append(short);
  const whole = el('div', 'whole', text);
  whole.title = 'Fold';
  whole.addEventListener('click', (event) => { event.stopPropagation(); fold.open = false; });
  summary.addEventListener('click', (event) => event.stopPropagation());
  fold.append(summary, whole);
  return fold;
}

function show(skill, item) {
  selected = { skill, item };
  for (const other of $('skills').children) other.setAttribute('aria-selected', String(other === item));
  const view = $('skill');
  const title = el('div', 'card-title');
  title.append($('file-icon').content.cloneNode(true), el('h2', '', skill.name));
  view.replaceChildren(title);
  const link = el('a', '', skill.link);
  link.href = skill.link;
  link.target = '_blank';
  link.rel = 'noopener';
  view.append(link);
  if (skill.copies.length) view.append(el('div', 'copies', 'also in ' + skill.copies.join(', ')));
  view.append(el('pre', 'skill-md', skill.text));
}

// Narrows the list to the skills that match the filter field, highlighting the matches; no new scan.
// While a word is in the description, the row shows the snippet around it instead.
function applyFilter() {
  $('count').textContent = '';
  if (!scanned) return;
  const filter = $('filter').value;
  let shown = 0;
  for (const { skill, item } of scanned.entries) {
    item.hidden = !matchesFilter(skill, filter);
    if (item.hidden) continue;
    shown++;
    item.querySelector('.name').replaceChildren(...marked(skill.name, filter));
    const snippet = filterSnippet(skill.description, filter);
    const full = item.querySelector('.description');
    const short = item.querySelector('.snippet');
    if (full) full.hidden = snippet !== null;
    short.hidden = snippet === null;
    short.replaceChildren(...marked(snippet || '', filter));
    short.title = snippet === null ? '' : skill.description;
  }
  const total = scanned.entries.length;
  const skills = total === 1 ? ' skill' : ' skills';
  $('count').textContent = filterCount(shown, total, filter);
  $('status').textContent = scanned.id + ' · ' + (shown === total ? total + skills : shown + ' of ' + total + skills);
  $('no-match').textContent = total && !shown ? 'No skills match "' + filter.trim() + '"' : '';
  if (!shown) {
    selected = null;
    for (const item of $('skills').children) item.setAttribute('aria-selected', 'false');
    $('skill').replaceChildren();
  } else if (!selected || selected.item.hidden) {
    const first = scanned.entries.find(({ item }) => !item.hidden);
    show(first.skill, first.item);
  }
}

// The link of this view: ?repo= for the scan, ?filter= for the filter field while it has words.
function updateLink(repo) {
  const params = new URLSearchParams(location.search);
  if (repo !== undefined) params.set('repo', repo);
  const filter = $('filter').value;
  if (filter.trim()) params.set('filter', filter.trim());
  else params.delete('filter');
  const query = params.toString();
  history.replaceState(null, '', query ? '?' + query : location.pathname);
}

async function scan(repo) {
  scanned = null;
  selected = null;
  $('no-match').textContent = '';
  $('count').textContent = '';
  $('scan').disabled = true;
  $('status').className = '';
  $('status').textContent = 'Scanning ' + repo + '…';
  $('warnings').replaceChildren();
  $('skills').replaceChildren();
  $('skill').replaceChildren();
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(repo));
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.error);
    scanned = { id: answer.repository.id, entries: [] };
    for (const warning of answer.warnings) $('warnings').append(el('li', '', warning));
    for (const skill of answer.skills) {
      const item = el('li');
      item.setAttribute('role', 'option');
      item.append(el('div', 'name', skill.name));
      if (skill.description) item.append(description(skill));
      item.append(el('div', 'snippet'));
      item.addEventListener('click', () => show(skill, item));
      $('skills').append(item);
      foldIfClamped(item, skill);
      scanned.entries.push({ skill, item });
    }
    applyFilter();
  } catch (error) {
    $('status').className = 'error';
    $('status').textContent = error.message;
  } finally {
    $('scan').disabled = false;
  }
}

$('form').addEventListener('submit', (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  if (!repo) return;
  updateLink(repo);
  scan(repo);
});

$('filter').addEventListener('input', () => {
  applyFilter();
  updateLink();
});

// The user's repositories as suggestions in the field: picking one fills in its URL.
async function suggest() {
  try {
    const answer = await (await fetch('/api/repositories')).json();
    for (const repository of answer.repositories) {
      const option = document.createElement('option');
      option.value = repository.url;
      option.label = repository.description ? repository.full_name + ' — ' + repository.description : repository.full_name;
      $('repositories').append(option);
    }
    $('suggestions').textContent = answer.error ? 'Your repositories: ' + answer.error : answer.hint || '';
  } catch (error) {
    $('suggestions').textContent = 'Your repositories: ' + error.message;
  }
}
suggest();

$('filter').value = new URLSearchParams(location.search).get('filter') || '';
const initial = new URLSearchParams(location.search).get('repo');
if (initial) { $('repo').value = initial; scan(initial); }
</script>
</body>
</html>
`;
