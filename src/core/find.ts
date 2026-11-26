/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills, in the order a copy is preferred. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/** Words that mark a folder as test data: `tests`, `jvmTest`, `integration-tests`, `testData`. */
const TEST_WORDS = new Set(['test', 'tests', 'fixture', 'fixtures']);

/**
 * Every `<root>/<name>/SKILL.md`, where `<root>` is a folder named `skills`: one of SKILL_ROOTS
 * or one specific to the repository, such as a plugin's. A root inside test data is not a skill
 * root. The same `<name>` in several roots is one skill, at its path in the first root by
 * SKILL_ROOTS order (then by path); the other paths are its copies.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const segments = path.split('/');
    if (segments.length < 3 || segments.at(-1) !== 'SKILL.md' || segments.at(-3) !== 'skills') continue;
    if (segments.slice(0, -2).some(isTestFolder)) continue;
    const name = segments.at(-2)!;
    byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  return [...byName].map(([name, found]) => {
    const [path, ...copies] = found.sort(byRoot);
    return { path, name, copies };
  });
}

function isTestFolder(segment: string): boolean {
  const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s._-]+/);
  return words.some((word) => TEST_WORDS.has(word.toLowerCase()));
}

function byRoot(a: string, b: string): number {
  const rank = (path: string) => {
    const index = SKILL_ROOTS.findIndex((root) => path.startsWith(`${root}/`));
    return index < 0 ? SKILL_ROOTS.length : index;
  };
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}
