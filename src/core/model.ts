/** A GitHub organization, or a user's account: the owner of repositories. */
export type Organization = {
  /** The owner's login, for example `JetBrains`. */
  id: string;
  /** `https://github.com/<owner>`. */
  url: string;
};

/** A scanned repository. The hierarchy is organization → repository → skill. */
export type Repository = {
  /** `owner/name`, for example `JetBrains/kotlin`; a local directory's name. */
  id: string;
  organization: string;
  name: string;
  /** `https://github.com/<owner>/<repo>`, or a local directory's file:// URL. */
  url: string;
  /** The scanned commit; empty for a local directory. */
  commit: string;
};

/** One skill. Its link is derived, by `skillLink`. */
export type Skill = {
  /** `repo:path`, for example `JetBrains/kotlin:.claude/skills/x/SKILL.md`. */
  id: string;
  repository: string;
  path: string;
  name: string;
  description: string;
  /** The scanned commit, the one the link pins; empty for a local directory. */
  commit: string;
  /** The same skill in other agents' folders. */
  copies: string[];
  /** The SKILL.md itself, as scanned. */
  text: string;
  /**
   * When its files last changed: the time of the latest commit that touched its folder or a copy's,
   * ISO 8601 in UTC (`2025-11-20T09:14:03Z`); undefined when unknown.
   */
  updated?: string;
};

/**
 * The SKILL.md file, from where its repository is: on GitHub at the scanned commit,
 * `https://github.com/<owner>/<repo>/blob/<commit>/<path>`; in a local directory, the file itself.
 */
export function skillLink(repository: Repository, skill: Skill): string {
  const path = skill.path.split('/').map(encodeURIComponent).join('/');
  return skill.commit ? `${repository.url}/blob/${skill.commit}/${path}` : `${repository.url}/${path}`;
}

/** By code point, whatever the locale. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** By name, then by path: the same order everywhere, whatever the locale. */
export function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => compareText(a.name, b.name) || compareText(a.path, b.path));
}

/** A description on one line, up to the end of its first sentence: what lists show. */
export function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}

/** A skill's folder: the directory of its SKILL.md, `.claude/skills/x` for `.claude/skills/x/SKILL.md`. */
export function skillFolder(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/** A time as ISO 8601 in UTC, to the second (`2025-11-20T09:14:03Z`); undefined if it is not a time. */
export function utc(time: string | undefined): string | undefined {
  const ms = time ? Date.parse(time) : NaN;
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The latest of these times (each as `utc` gives it); undefined if none is known. */
export function latest(times: (string | undefined)[]): string | undefined {
  return times.reduce<string | undefined>((last, time) => (time && (!last || time > last) ? time : last), undefined);
}

/** The day of a time, as lists show it: `2025-11-20`, in UTC. */
export function day(time: string): string {
  return time.slice(0, 10);
}
