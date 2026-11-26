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
  :root { color-scheme: light dark; --border: #8884; --muted: #888; --accent: #4a7cf0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 system-ui, sans-serif; }
  header { padding: 16px 20px; border-bottom: 1px solid var(--border); }
  h1 { font-size: 18px; margin: 0 0 10px; }
  form { display: flex; gap: 8px; }
  input { flex: 1; padding: 8px 10px; font: inherit; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; }
  button { padding: 8px 16px; font: inherit; border: 0; border-radius: 6px; background: var(--accent); color: white; cursor: pointer; }
  button:disabled { opacity: .6; cursor: wait; }
  #suggestions { margin-top: 4px; color: var(--muted); font-size: 12px; }
  #suggestions:empty { display: none; }
  #status { margin-top: 10px; color: var(--muted); min-height: 1.4em; }
  #status.error { color: #d33; }
  #warnings { margin: 6px 0 0; padding-left: 20px; color: #c80; font-size: 13px; }
  main { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; min-height: 60vh; }
  #skills { list-style: none; margin: 0; padding: 0; border-right: 1px solid var(--border); overflow: auto; }
  #skills li { padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  #skills li[aria-selected="true"] { background: #4a7cf022; }
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
    <input id="repo" name="repo" type="text" placeholder="https://github.com/owner/repo" aria-label="Repository link" list="repositories" autocomplete="off" autofocus>
    <datalist id="repositories"></datalist>
    <button id="scan" type="submit">Scan</button>
  </form>
  <div id="suggestions"></div>
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
  for (const other of $('skills').children) other.setAttribute('aria-selected', String(other === item));
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

async function scan(repo) {
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
    const count = answer.skills.length;
    $('status').textContent = answer.repository.id + ' · ' + count + (count === 1 ? ' skill' : ' skills');
    for (const warning of answer.warnings) $('warnings').append(el('li', '', warning));
    for (const skill of answer.skills) {
      const item = el('li');
      item.setAttribute('role', 'option');
      item.append(el('div', 'name', skill.name));
      if (skill.description) item.append(description(skill));
      item.addEventListener('click', () => show(skill, item));
      $('skills').append(item);
      foldIfClamped(item, skill);
    }
    if (count) show(answer.skills[0], $('skills').firstElementChild);
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
