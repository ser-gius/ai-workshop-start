// spec/analysis.md#topics: the skills by topic, from a stubbed `claude` (never a real model), or the heuristic.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { heuristicTopics, OTHER, parseTopics, topicsPrompt, type TopicSkill } from '../src/core/topics.ts';
import { topicsOf } from '../src/topics.ts';
import { claudeAnswering, stubClaude } from './helpers.ts';

const skills = (...names: string[]): TopicSkill[] => names.map((name) => ({ id: `r:${name}`, name, description: `Does ${name}.` }));
const ids = (...names: string[]) => names.map((name) => `r:${name}`);

test('the model: `claude -p --model haiku`, the names and descriptions on stdin, its topics as it answers them', async (t) => {
  const claude = stubClaude(t, claudeAnswering({ topics: [{ title: 'Testing', skills: ['run-tests', 'writing-tests'] }, { title: 'Commits', skills: ['commits'] }] }));
  const asked = skills('commits', 'run-tests', 'writing-tests');
  assert.deepEqual(await topicsOf(asked, { command: claude.command }), {
    by: 'model',
    topics: [
      { title: 'Testing', skills: ids('run-tests', 'writing-tests') },
      { title: 'Commits', skills: ids('commits') },
    ],
  });
  assert.deepEqual(claude.args(), ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--no-session-persistence']);
  const prompt = claude.stdin()!;
  for (const skill of asked) assert.ok(prompt.includes(`- ${skill.name}: ${skill.description}`), skill.name);
  assert.match(prompt, /"topics"/, 'it is asked for JSON');
});

test('the model: an answer with text around its JSON, or in a code block, is read', async (t) => {
  const claude = stubClaude(t, `printf 'Here you are:\\n\`\`\`json\\n{"topics": [{"title": "All", "skills": ["a-b", "c"]}]}\\n\`\`\`\\n'`);
  assert.deepEqual(await topicsOf(skills('a-b', 'c'), { command: claude.command }), { by: 'model', topics: [{ title: 'All', skills: ids('a-b', 'c') }] });
});

test('the model: a made-up name dropped, a skill in two topics in the first, one left out in Other', () => {
  const topics = parseTopics(
    JSON.stringify({
      topics: [
        { title: 'Tests', skills: ['run-tests', 'no-such-skill'] },
        { title: 'Ghosts', skills: ['no-such-skill'] },
        { title: 'Tools', skills: ['run-tests', 'lint'] },
        { title: '  ', skills: ['commits'] },
        { title: 'tools', skills: ['format'] },
      ],
    }),
    skills('commits', 'format', 'lint', 'run-tests', 'stray'),
  );
  assert.deepEqual(topics, [
    { title: 'Tests', skills: ids('run-tests') },
    // `tools` is `Tools`, ignoring case.
    { title: 'Tools', skills: ids('lint', 'format') },
    // Left out (or only under a topic with no title): Other, last.
    { title: OTHER, skills: ids('commits', 'stray') },
  ]);
});

test('the model: its own Other topic, not last, takes the skills it left out and moves last', () => {
  const answer = JSON.stringify({ topics: [{ title: 'other', skills: ['a'] }, { title: 'Git', skills: ['commits'] }] });
  assert.deepEqual(parseTopics(answer, skills('a', 'commits', 'stray')), [
    { title: 'Git', skills: ids('commits') },
    { title: 'other', skills: ids('a', 'stray') },
  ]);
  // Its Other with nothing left out moves last too.
  assert.deepEqual(parseTopics(answer, skills('a', 'commits')), [
    { title: 'Git', skills: ids('commits') },
    { title: 'other', skills: ids('a') },
  ]);
});

test('the model: the same name in two repositories, both skills where the name goes; the prompt has it once', () => {
  const twice: TopicSkill[] = [
    { id: 'a/x:skills/commits/SKILL.md', name: 'commits', description: 'Commit.' },
    { id: 'a/y:skills/commits/SKILL.md', name: 'commits', description: 'Commit too.' },
  ];
  assert.deepEqual(parseTopics('{"topics":[{"title":"Git","skills":["commits"]}]}', twice), [
    { title: 'Git', skills: ['a/x:skills/commits/SKILL.md', 'a/y:skills/commits/SKILL.md'] },
  ]);
  assert.equal(topicsPrompt(twice).match(/^- commits/gm)?.length, 1);
});

test('the model: no topic in its answer (not JSON, not that shape, only made-up names) → none', () => {
  const asked = skills('a', 'b');
  for (const answer of ['', 'Sorry, I cannot help.', '{"topics": ', '{"groups": []}', '{"topics": "a"}', '{"topics": []}', '{"topics": [{"title": "X", "skills": ["z"]}]}']) {
    assert.equal(parseTopics(answer, asked), undefined, answer);
  }
});

test('`claude` missing, failing, too slow, or not answering topics → the heuristic', async (t) => {
  const asked = skills('run-tests', 'writing-tests', 'commits');
  const heuristic = { by: 'heuristic', topics: [{ title: 'tests', skills: ids('run-tests', 'writing-tests') }, { title: OTHER, skills: ids('commits') }] };
  const missing = join(mkdtempSync(join(tmpdir(), 'skill-atlas-none-')), 'claude');
  assert.deepEqual(await topicsOf(asked, { command: missing }), heuristic, 'missing');
  const failing = stubClaude(t, `echo '{"topics":[{"title":"X","skills":["commits"]}]}'; exit 1`);
  assert.deepEqual(await topicsOf(asked, { command: failing.command }), heuristic, 'exit code 1, whatever it printed');
  const slow = stubClaude(t, `sleep 5; ${claudeAnswering({ topics: [{ title: 'X', skills: ['commits'] }] })}`);
  const started = Date.now();
  assert.deepEqual(await topicsOf(asked, { command: slow.command, timeout: 300 }), heuristic, 'too slow');
  assert.ok(Date.now() - started < 3000, 'it does not wait for it');
  const chatty = stubClaude(t, `echo 'I would group them by purpose.'`);
  assert.deepEqual(await topicsOf(asked, { command: chatty.command }), heuristic, 'no JSON');
});

test('no skills → no topics, and the model is not asked', async (t) => {
  const claude = stubClaude(t, claudeAnswering({ topics: [] }));
  assert.deepEqual(await topicsOf([], { command: claude.command }), { by: 'heuristic', topics: [] });
  assert.equal(claude.args(), undefined, 'not run');
});

test('the heuristic: skills sharing a word in their names; test, tests, testing are one word, titled as most use it', () => {
  assert.deepEqual(heuristicTopics(skills('testing', 'writing-tests', 'driver-ui-tests', 'commits')), [
    { title: 'tests', skills: ids('testing', 'writing-tests', 'driver-ui-tests') },
    { title: OTHER, skills: ids('commits') },
  ]);
});

test('the heuristic: the word most share first, then the next among the rest; a tie alphabetical; Other last', () => {
  assert.deepEqual(
    heuristicTopics(skills('build-bump-gradle-version', 'gradle-plugin', 'kotlin-ui-dsl', 'ui-accessibility', 'run-tests', 'unit-tests', 'gradle-tests', 'writing-tests', 'icons')),
    [
      // tests: 4 skills; gradle-tests is taken, so gradle has 2 left, as ui has: gradle before ui.
      { title: 'tests', skills: ids('run-tests', 'unit-tests', 'gradle-tests', 'writing-tests') },
      { title: 'gradle', skills: ids('build-bump-gradle-version', 'gradle-plugin') },
      { title: 'ui', skills: ids('kotlin-ui-dsl', 'ui-accessibility') },
      { title: OTHER, skills: ids('icons') },
    ],
  );
});

test('the heuristic: at most 6 topics; no shared word → every skill in Other; every skill in exactly one', () => {
  const many = skills(...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap((word) => [`${word}x-1`, `${word}x-2`]));
  const topics = heuristicTopics(many);
  assert.deepEqual(topics.map((topic) => topic.title), ['ax', 'bx', 'cx', 'dx', 'ex', 'fx', OTHER]);
  assert.deepEqual(topics.flatMap((topic) => topic.skills).sort(), many.map((skill) => skill.id).sort());
  assert.deepEqual(heuristicTopics(skills('code-style', 'commits', 'reviews')), [{ title: OTHER, skills: ids('code-style', 'commits', 'reviews') }]);
  assert.deepEqual(heuristicTopics([]), []);
});
