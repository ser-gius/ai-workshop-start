// The skills grouped by topic, so a long list reads at a glance: a model's groups, checked and
// completed here, or, without a model, groups by the words the skills' names share.
// Plain functions: asking the model is the client's (src/topics.ts runs `claude -p`).

/** What a topic is made of: a skill's id, name and description. */
export type TopicSkill = { id: string; name: string; description: string };

/** A topic: its title, and its skills' ids, in the list's order. */
export type Topic = { title: string; skills: string[] };

/** The topics and where they came from: the model, or the heuristic. */
export type Topics = { by: 'model' | 'heuristic'; topics: Topic[] };

/** The heuristic's topics at most, `Other` aside. */
export const MAX_TOPICS = 6;

/** The title of the skills no topic took. */
export const OTHER = 'Other';

/** What the model is asked: the skills' names and descriptions, an answer in JSON. */
export function topicsPrompt(skills: TopicSkill[]): string {
  const lines = uniqueNames(skills).map((name) => {
    const description = skills.find((skill) => skill.name === name && skill.description)?.description ?? '';
    return `- ${name}${description ? `: ${description.replace(/\s+/g, ' ').trim().slice(0, 300)}` : ''}`;
  });
  return [
    'Group these agent skills by topic, so a long list reads at a glance.',
    `Answer with a handful of topics (at most ${MAX_TOPICS + 1}), each with a short title (a few words, such as`,
    '"Testing and test infrastructure" or "Builds, modules and dependencies") and the names of its skills.',
    'Every skill in exactly one topic. Answer with JSON only, nothing else:',
    '{"topics": [{"title": "<title>", "skills": ["<name>", ...]}, ...]}',
    '',
    'The skills:',
    ...lines,
  ].join('\n');
}

/**
 * The model's answer as topics: the JSON object in it, `{ topics: [{ title, skills: [<name>] }] }`.
 * A name it made up is dropped; a skill in two topics stays in the first; a topic left empty is
 * dropped; a skill it left out goes to `Other`. Undefined when the answer has no topic at all:
 * not JSON, or not that shape.
 */
export function parseTopics(answer: string, skills: TopicSkill[]): Topic[] | undefined {
  const json = /\{[\s\S]*\}/.exec(answer)?.[0];
  if (!json) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const given = (parsed as { topics?: unknown })?.topics;
  if (!Array.isArray(given)) return undefined;
  const taken = new Set<string>();
  const topics: Topic[] = [];
  for (const topic of given) {
    const title = typeof topic?.title === 'string' ? topic.title.replace(/\s+/g, ' ').trim() : '';
    const names = Array.isArray(topic?.skills) ? topic.skills.filter((name: unknown) => typeof name === 'string') : [];
    if (!title) continue;
    const ids = skills.filter((skill) => names.includes(skill.name) && !taken.has(skill.id)).map((skill) => skill.id);
    for (const id of ids) taken.add(id);
    if (ids.length) add(topics, title, ids);
  }
  if (!topics.length) return undefined;
  const rest = skills.filter((skill) => !taken.has(skill.id)).map((skill) => skill.id);
  if (rest.length) add(topics, OTHER, rest);
  return topics;
}

/** Two topics with the same title are one. */
function add(topics: Topic[], title: string, ids: string[]) {
  const same = topics.find((topic) => topic.title.toLowerCase() === title.toLowerCase());
  if (same) same.skills.push(...ids);
  else topics.push({ title, skills: ids });
}

/**
 * Without a model: skills that share a word in their names. The word most of them share first
 * (`writing-tests`, `driver-ui-tests`, `testing` → *tests*: `test`, `tests`, `testing` are one word),
 * its skills a topic titled by the word; then the next, among the skills left, while two share one,
 * at most MAX_TOPICS; the rest, `Other`. A tie: the word first in alphabetical order.
 */
export function heuristicTopics(skills: TopicSkill[]): Topic[] {
  const words = new Map(skills.map((skill) => [skill.id, nameWords(skill.name)]));
  let left = skills;
  const topics: Topic[] = [];
  while (topics.length < MAX_TOPICS) {
    const counts = new Map<string, number>();
    for (const skill of left) for (const stem of new Set(words.get(skill.id)!.map(([stem]) => stem))) counts.set(stem, (counts.get(stem) ?? 0) + 1);
    let best: string | undefined;
    for (const [stem, n] of counts) {
      const most = best === undefined ? 0 : counts.get(best)!;
      if (n >= 2 && (n > most || (n === most && stem < best!))) best = stem;
    }
    if (best === undefined) break;
    const members = left.filter((skill) => words.get(skill.id)!.some(([stem]) => stem === best));
    topics.push({ title: title(members.flatMap((skill) => words.get(skill.id)!.filter(([stem]) => stem === best).map(([, word]) => word))), skills: members.map((skill) => skill.id) });
    left = left.filter((skill) => !members.includes(skill));
  }
  if (left.length) topics.push({ title: OTHER, skills: left.map((skill) => skill.id) });
  return topics;
}

/** A name's words, each with its stem: split on anything but letters and digits, lower case. */
function nameWords(name: string): [stem: string, word: string][] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)
    .map((word) => [stem(word), word]);
}

/** `tests`, `testing` → `test`: the plural and `-ing` off, if a word of 3 letters or more is left. */
function stem(word: string): string {
  if (word.endsWith('ing') && word.length >= 6) return word.slice(0, -3);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length >= 4) return word.slice(0, -1);
  return word;
}

/** The form of the word its skills use most; a tie, the first in alphabetical order. */
function title(forms: string[]): string {
  const counts = new Map<string, number>();
  for (const form of forms) counts.set(form, (counts.get(form) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

/** Each name once, in order: an organization may have the same skill in two repositories. */
function uniqueNames(skills: TopicSkill[]): string[] {
  return [...new Set(skills.map((skill) => skill.name))];
}
