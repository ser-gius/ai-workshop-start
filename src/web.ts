// The local web view: a page with a field for a repository link, its skills and their SKILL.md; an
// organization's link, its repositories' skills, grouped by repository.
// The same core as the CLI; the page asks GET /api/scan?repo=<URL> and renders the answer, and
// GET /api/repositories for the user's GitHub repositories to suggest in the field.
// Nothing is stored: every scan is fresh.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import type { UserRepositories } from './core/github.ts';
import { firstSentence, skillLink } from './core/model.ts';
import { isOrganization, scan, scanOrganization, type OrganizationSource, type ScanResult, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user typed into the field: a repository, or an organization's repositories. */
  open(input: string): Promise<Source | OrganizationSource>;
  /** The user's repositories, suggested in the field; none without it. */
  repositories?(): Promise<UserRepositories>;
};

/** What GET /api/repositories answers: the suggestions, a hint without a token, or GitHub's failure. */
export type RepositoriesAnswer = UserRepositories & { error?: string };

/** One repository in GET /api/scan's answer: the repository, each skill with its link and SKILL.md. */
export type RepositoryAnswer = {
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
};

/** What GET /api/scan answers for a repository: its skills, and warnings. */
export type ScanAnswer = RepositoryAnswer & { warnings: string[] };

/** What GET /api/scan answers for an organization: the repositories with skills, grouped, and warnings. */
export type OrganizationAnswer = {
  /** `repositories`: how many it has, forks left out. */
  organization: { id: string; url: string; repositories: number };
  repositories: RepositoryAnswer[];
  warnings: string[];
};

/** A repository's skills as the page shows them. */
function repositoryAnswer({ repository, skills }: ScanResult): RepositoryAnswer {
  return {
    repository: { id: repository.id, url: repository.url, commit: repository.commit },
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description.replace(/\s+/g, ' ').trim(),
      summary: firstSentence(skill.description),
      path: skill.path,
      link: skillLink(repository, skill),
      copies: skill.copies,
      text: skill.text,
    })),
  };
}

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
      const opened = await open(repo);
      let answer: ScanAnswer | OrganizationAnswer;
      if (isOrganization(opened)) {
        const result = await scanOrganization(opened);
        answer = {
          organization: { ...result.organization, repositories: result.repositories },
          repositories: result.results.map(repositoryAnswer),
          warnings: result.warnings,
        };
      } else {
        const result = await scan(opened);
        answer = { ...repositoryAnswer(result), warnings: result.warnings };
      }
      send(200, 'application/json', JSON.stringify(answer));
    } catch (error) {
      if (error instanceof AtlasError) return send(400, 'application/json', JSON.stringify({ error: error.message }));
      send(500, 'application/json', JSON.stringify({ error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` }));
    }
  });
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
  :root { color-scheme: light; --border: #e4e2dc; --muted: #8a8a8a; --accent: #4350c8; --page: #f8f7f3; --panel: #f6f5f1; --tile: #eceefb; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif; background: var(--page); color: #1d1d1f; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  /* An organization's card: what was scanned, how far, and the repositories with the most skills. */
  .card { background: #fff; border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 2px 12px #0000000f; padding: 24px; margin: 14px 0 4px; max-width: 760px; }
  .card[hidden] { display: none; }
  .card-head { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .card-head h2 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .tile { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 14px; background: var(--tile); color: var(--accent); flex: none; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .target { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border: 2px solid var(--accent); border-radius: 12px; background: #fff; color: var(--accent); }
  .target-name { flex: 1; font-size: 18px; color: #1d1d1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { background: var(--accent); color: #fff; border-radius: 999px; padding: 4px 14px; font-weight: 500; white-space: nowrap; }
  .progress { height: 6px; margin: 12px 2px; border-radius: 3px; background: #e3e4f4; overflow: hidden; }
  .progress span { display: block; height: 100%; width: 100%; border-radius: 3px; background: var(--accent); }
  .progress.running span { width: 30%; animation: progress 1.2s ease-in-out infinite; }
  @keyframes progress { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
  .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  .top { list-style: none; margin: 4px 0 0; padding: 0; }
  .top li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
  .top a { color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .top a:hover { text-decoration: underline; }
  .top .skills { color: var(--accent); font-weight: 700; white-space: nowrap; }
  .more { color: var(--muted); padding-top: 2px; }
  .more:empty { display: none; }
  header { padding: 16px 20px; background: var(--page); }
  h1 { font-size: 18px; margin: 0 0 10px; }
  form { display: flex; gap: 8px; }
  input { flex: 1; padding: 8px 10px; font: inherit; border: 2px solid var(--border); border-radius: 10px; background: #fff; color: inherit; }
  input:focus { outline: none; border-color: var(--accent); }
  button { padding: 8px 16px; font: inherit; border: 0; border-radius: 999px; background: var(--accent); color: white; cursor: pointer; }
  button:disabled { opacity: .6; cursor: wait; }
  #suggestions { margin-top: 4px; color: var(--muted); font-size: 12px; }
  #suggestions:empty { display: none; }
  #status { margin-top: 10px; color: var(--muted); min-height: 1.4em; }
  #status.error { color: #d33; }
  #warnings { margin: 6px 0 0; padding-left: 20px; color: #c80; font-size: 13px; }
  main { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; min-height: 60vh; }
  #skills { list-style: none; margin: 0; padding: 0; border-right: 1px solid var(--border); overflow: auto; }
  #skills li { padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  #skills li.group { padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: default; background: #8881; position: sticky; top: 0; }
  #skills li.group a { color: inherit; text-decoration: none; }
  #skills li.group a:hover { text-decoration: underline; }
  #skills li[aria-selected="true"] { background: #4350c81a; }
  main { background: #fff; border-top: 1px solid var(--border); }
  #skills .name { font-weight: 600; }
  #skills .description { color: var(--muted); font-size: 13px; }
  /* At most two lines, folded or not; the fold's own marker shows that it unfolds. */
  #skills .description .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  #skills details.description summary { display: flex; gap: 4px; cursor: pointer; list-style: none; }
  #skills details.description summary::-webkit-details-marker { display: none; }
  #skills details.description summary::before, #skills details.description .whole::before { color: var(--accent); flex: none; }
  #skills details.description summary::before { content: '▸'; }
  #skills details.description .whole::before { content: '▾ '; }
  #skills details.description .whole { cursor: pointer; }
  #skills details.description[open] summary { display: none; }
  #skill { padding: 16px 20px; overflow: auto; }
  #skill h2 { margin: 0 0 4px; font-size: 17px; }
  #skill a { color: var(--accent); word-break: break-all; font-size: 13px; }
  #skill .copies { color: var(--muted); font-size: 13px; }
  pre { white-space: pre-wrap; word-wrap: break-word; font: 13px/1.5 ui-monospace, monospace; padding: 12px; border: 1px solid var(--border); border-radius: 6px; }
</style>
</head>
<body>
<header>
  <h1>Skill Atlas</h1>
  <form id="form">
    <input id="repo" name="repo" type="text" placeholder="https://github.com/owner/repo, or https://github.com/owner" aria-label="Repository link" list="repositories" autocomplete="off" autofocus>
    <datalist id="repositories"></datalist>
    <button id="scan" type="submit">Scan</button>
  </form>
  <div id="suggestions"></div>
  <section id="organization" class="card" aria-label="Organization" hidden>
    <div class="card-head"><span class="tile"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg></span><h2>Scan the organization</h2></div>
    <div class="panel">
      <div class="target"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg><span id="org-name" class="target-name"></span><span id="org-count" class="pill"></span></div>
      <div id="org-progress" class="progress" role="progressbar" aria-label="Scan progress" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <div id="org-label" class="label"></div>
      <ul id="org-top" class="top"></ul>
      <div id="org-more" class="more"></div>
    </div>
  </section>
  <div id="status"></div>
  <ul id="warnings"></ul>
</header>
<main>
  <ul id="skills" role="listbox" aria-label="Skills"></ul>
  <section id="skill"></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

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
  for (const other of $('skills').querySelectorAll('li[role="option"]')) other.setAttribute('aria-selected', String(other === item));
  const view = $('skill');
  view.replaceChildren(el('h2', '', skill.name));
  const link = el('a', '', skill.link);
  link.href = skill.link;
  link.target = '_blank';
  link.rel = 'noopener';
  view.append(link);
  if (skill.copies.length) view.append(el('div', 'copies', 'also in ' + skill.copies.join(', ')));
  view.append(el('pre', 'skill-md', skill.text));
}

function count(n, one, many) {
  return n + ' ' + (n === 1 ? one : many || one + 's');
}

// Each skill, its name and description; a click selects it.
function list(skills) {
  for (const skill of skills) {
    const item = el('li');
    item.setAttribute('role', 'option');
    item.append(el('div', 'name', skill.name));
    if (skill.description) item.append(description(skill));
    item.addEventListener('click', () => show(skill, item));
    $('skills').append(item);
    foldIfClamped(item, skill);
  }
}

// An organization's link, as the core reads it: github.com/<owner>, nothing after.
const ORGANIZATION_URL = /^(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/([\\w.-]+)\\/?$/i;
/** The repositories at the top of the organization's card. */
const TOP = 3;

// The card while an organization is scanned: its link, and the bar moving; no counts yet.
function organizationScanning(owner) {
  $('organization').hidden = false;
  $('org-name').textContent = 'github.com/' + owner;
  $('org-count').textContent = '…';
  $('org-progress').className = 'progress running';
  $('org-progress').removeAttribute('aria-valuenow');
  $('org-label').textContent = 'Scanning…';
  $('org-top').replaceChildren();
  $('org-more').textContent = '';
}

// The card once scanned: the repositories, the bar full, the ones with the most skills, then how many more.
function organizationScanned(answer) {
  $('organization').hidden = false;
  $('org-name').textContent = 'github.com/' + answer.organization.id;
  $('org-count').textContent = count(answer.organization.repositories, 'repository', 'repositories');
  $('org-progress').className = 'progress';
  $('org-progress').setAttribute('aria-valuenow', '100');
  const ranked = [...answer.repositories].sort((a, b) => b.skills.length - a.skills.length ||
    a.repository.id.toLowerCase().localeCompare(b.repository.id.toLowerCase()));
  const top = ranked.slice(0, TOP);
  const more = ranked.length - top.length;
  $('org-label').textContent = ranked.length ? ranked.length + ' with skills' + (more ? ', among them' : '') : 'No repository with skills';
  $('org-top').replaceChildren(...top.map((group) => {
    const item = el('li');
    const link = el('a', 'mono', group.repository.id.slice(group.repository.id.indexOf('/') + 1));
    link.href = group.repository.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = group.repository.id;
    item.append(link, el('span', 'skills', count(group.skills.length, 'skill')));
    return item;
  }));
  $('org-more').textContent = more ? '+' + more + ' more' : '';
}

async function scan(repo) {
  const owner = ORGANIZATION_URL.exec(repo);
  if (owner) organizationScanning(owner[1]);
  else $('organization').hidden = true;
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
    for (const warning of answer.warnings) $('warnings').append(el('li', '', warning));
    if (answer.organization) {
      organizationScanned(answer);
      // An organization: a heading per repository, its skills under it.
      const skills = answer.repositories.reduce((sum, group) => sum + group.skills.length, 0);
      const total = answer.organization.repositories;
      $('status').textContent = answer.organization.id + ' · ' + count(skills, 'skill') + ' in ' + answer.repositories.length +
        ' of ' + count(total, 'repository', 'repositories');
      for (const group of answer.repositories) {
        const heading = el('li', 'group');
        heading.setAttribute('role', 'presentation');
        const link = el('a', '', group.repository.id + ' · ' + count(group.skills.length, 'skill'));
        link.href = group.repository.url;
        link.target = '_blank';
        link.rel = 'noopener';
        heading.append(link);
        $('skills').append(heading);
        list(group.skills);
      }
    } else {
      $('status').textContent = answer.repository.id + ' · ' + count(answer.skills.length, 'skill');
      list(answer.skills);
    }
    const first = $('skills').querySelector('li[role="option"]');
    if (first) first.click();
  } catch (error) {
    $('organization').hidden = true;
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
  history.replaceState(null, '', '?repo=' + encodeURIComponent(repo));
  scan(repo);
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

const initial = new URLSearchParams(location.search).get('repo');
if (initial) { $('repo').value = initial; scan(initial); }
</script>
</body>
</html>
`;
