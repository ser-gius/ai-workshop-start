#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the local web view. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl, userRepositories } from './core/github.ts';
import type { Source } from './core/scan.ts';
import { openDirectory } from './local.ts';
import { serve } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string): Promise<Source> =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input);
const args = process.argv.slice(2);

if (args[0] === 'serve') {
  const port = parsePort(args.slice(1));
  if (port === undefined) {
    console.error('Usage: skill-atlas serve [--port <number>]');
    process.exitCode = 1;
  } else {
    try {
      const { url } = await serve({ open, repositories: () => userRepositories({ fetch, token }), port });
      console.log(`Skill Atlas at ${url}`);
    } catch (error) {
      console.error(`Cannot start the web view: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
} else {
  process.exitCode = await run(args, {
    open,
    print: (text) => console.log(text),
    error: (text) => console.error(text),
    commands: ['serve [--port <number>]         a local web view: a repository link, its skills, their SKILL.md'],
  });
}

/** `[--port <n>]`, 4173 by default; undefined when the arguments are wrong. */
function parsePort(rest: string[]): number | undefined {
  if (rest.length === 0) return 4173;
  if (rest.length !== 2 || rest[0] !== '--port' || !/^\d+$/.test(rest[1])) return undefined;
  const port = Number(rest[1]);
  return port <= 65535 ? port : undefined;
}
