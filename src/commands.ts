// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { day, firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import { isOrganization, scan, scanOrganization, type OrganizationResult, type OrganizationSource, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan: a repository, or an organization's repositories. */
  open(input: string): Promise<Source | OrganizationSource>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Help lines for the commands only this client runs, such as the Node CLI's `serve`. */
  commands?: string[];
};

/** The help: the shared commands, then the client's own, so it lists only what runs here. */
function usage({ commands = [] }: Context): string {
  return [
    'Usage: skill-atlas <command>',
    '',
    '  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it',
    '  scan github.com/<owner>         every repository of an organization, grouped by repository',
    ...commands.map((line) => `  ${line}`),
    '  help                            show this help',
  ].join('\n');
}

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'help') context.print(usage(context));
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage(context)}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory>');
  const opened = await context.open(args[0]);
  const result = isOrganization(opened) ? await scanOrganization(opened) : await scan(opened);
  if ('results' in result) printOrganization(result, context);
  else printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/** `<owner> · N skills in R of M repositories`, then each repository with skills, a blank line before each. */
function printOrganization({ organization, repositories, results }: OrganizationResult, context: Context) {
  const skills = results.reduce((sum, result) => sum + result.skills.length, 0);
  context.print(
    `${organization.id} · ${count(skills, 'skill')} in ${results.length} of ${count(repositories, 'repository', 'repositories')}`,
  );
  for (const result of results) {
    context.print('');
    printRepository(result.repository, result.skills, context);
  }
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence, link, copies and the day it last changed. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${count(skills.length, 'skill')}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
    if (skill.updated) print(`  updated ${day(skill.updated)}`);
  }
}
