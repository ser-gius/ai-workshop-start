// The skills' topics from a tiny Claude model, Haiku, through `claude -p`; the heuristic when
// `claude` is missing, fails, takes too long, or answers something that is not topics.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { heuristicTopics, parseTopics, topicsPrompt, type Topics, type TopicSkill } from './core/topics.ts';

export type ClaudeOptions = {
  /** The `claude` executable; found on PATH by default. */
  command?: string;
  /** How long the model may take, in ms; 30 s by default. */
  timeout?: number;
};

/** The skills by topic: the model's, else the heuristic's. None for no skills, and the model is not asked. */
export async function topicsOf(skills: TopicSkill[], options: ClaudeOptions = {}): Promise<Topics> {
  if (!skills.length) return { by: 'heuristic', topics: [] };
  const answer = await askClaude(topicsPrompt(skills), options);
  const topics = answer === undefined ? undefined : parseTopics(answer, skills);
  return topics ? { by: 'model', topics } : { by: 'heuristic', topics: heuristicTopics(skills) };
}

/** What `claude` is run with: one answer from Haiku, nothing else. */
export const CLAUDE_ARGS = ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--no-session-persistence'];

/** `claude -p --model haiku`, the prompt on stdin: what it printed; undefined when it could not answer. */
function askClaude(prompt: string, { command = 'claude', timeout = 30_000 }: ClaudeOptions): Promise<string | undefined> {
  return new Promise((resolve) => {
    let out = '';
    // Away from any project: no CLAUDE.md of a repository is read along. No tools and no MCP servers: the
    // descriptions are the scanned repository's text, so a model told to do something there can do nothing.
    const child = spawn(command, CLAUDE_ARGS, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, timeout);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.once('error', () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out : undefined);
    });
    child.stdin.on('error', () => {}); // a command that exits before reading it
    child.stdin.end(prompt);
  });
}
