// The web view for the visual tests: `./skill-atlas serve`, but GitHub answers from the recording in
// github.json.gz, the suggestions are fixed, and the fixture is at a fixed path. Nothing reaches the network.
import { openGitHub, openOrganization, parseGitHubOwnerUrl, parseGitHubUrl } from '../../src/core/github.ts';
import { replay } from '../../src/core/replay.ts';
import { openDirectory } from '../../src/local.ts';
import { serve } from '../../src/web.ts';
import { copyFixture, recording } from './data.ts';

copyFixture();
// Recorded with a token, so through code search; any other request fails the scan, never goes out.
const options = { fetch: replay(recording()), token: 'replayed' };
const open = (input: string) =>
  parseGitHubUrl(input) ? openGitHub(input, options) : parseGitHubOwnerUrl(input) ? openOrganization(input, options) : openDirectory(input);
const suggested = (full_name: string, description: string) => ({ full_name, url: `https://github.com/${full_name}`, description });
const repositories = async () => ({
  repositories: [suggested('JetBrains/kotlin', 'The Kotlin Programming Language.'), suggested('JetBrains/koog', 'Koog is a Kotlin-based framework for AI agents.')],
});

const { url } = await serve({ open, repositories, port: Number(process.env.PORT ?? 4317) });
console.log(`Skill Atlas at ${url}`);
