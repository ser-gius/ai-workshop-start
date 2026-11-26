import { AtlasError, EmptyRepositoryError, UnavailableError } from './errors.ts';
import { findSkills, type SkillFile } from './find.ts';
import { compareText, sortSkills, type Organization, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  return {
    repository: source.repository,
    skills: sortSkills(results.flatMap((result) => (result.skill ? [result.skill] : []))),
    warnings: [...source.warnings, ...results.flatMap((result) => (result.warning ? [result.warning] : []))],
  };
}

async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warning?: string }> {
  const bytes = await source.read(file.path);
  if (!bytes) return { warning: `${file.path}: listed, but not found at the scanned commit; skipped` };
  const text = new TextDecoder().decode(bytes);
  const parsed = parseSkill(text);
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies: file.copies,
    text,
  };
  return { skill, warning: parsed.warning && `${file.path}: ${parsed.warning}` };
}

/** An organization to scan: its repositories that may have skills, each opened when it is scanned. */
export type OrganizationSource = {
  organization: Organization;
  /** How many repositories it has, forks left out. */
  repositories: number;
  sources: { id: string; open(): Promise<Source> }[];
  /** What listing the repositories had to leave out. */
  warnings: string[];
};

export type OrganizationResult = {
  organization: Organization;
  /** How many repositories it has, forks left out. */
  repositories: number;
  /** The repositories with skills, by `owner/name`, ignoring case. */
  results: ScanResult[];
  /** Each prefixed with its repository. */
  warnings: string[];
};

/** Is it an organization, not a single repository? */
export function isOrganization(source: Source | OrganizationSource): source is OrganizationSource {
  return 'sources' in source;
}

/**
 * Every repository, scanned at the same time (the source limits how many requests run at once).
 * One repository that fails is a warning; a source that turns the scan away stops it.
 */
export async function scanOrganization(source: OrganizationSource): Promise<OrganizationResult> {
  // By `owner/name`, ignoring case as GitHub does; then exactly, so the order never changes.
  const sources = [...source.sources].sort(
    (a, b) => compareText(a.id.toLowerCase(), b.id.toLowerCase()) || compareText(a.id, b.id),
  );
  const scanned = await Promise.all(
    sources.map(async ({ id, open }): Promise<{ result?: ScanResult; warnings: string[] }> => {
      try {
        const result = await scan(await open());
        return { result, warnings: result.warnings.map((warning) => `${id}: ${warning}`) };
      } catch (error) {
        if (error instanceof EmptyRepositoryError) return { warnings: [] };
        if (error instanceof AtlasError && !(error instanceof UnavailableError)) return { warnings: [`${id}: ${error.message}; skipped`] };
        throw error;
      }
    }),
  );
  return {
    organization: source.organization,
    repositories: source.repositories,
    results: scanned.flatMap(({ result }) => (result && result.skills.length > 0 ? [result] : [])),
    warnings: [...source.warnings, ...scanned.flatMap(({ warnings }) => warnings)],
  };
}
