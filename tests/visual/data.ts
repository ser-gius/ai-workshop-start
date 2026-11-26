// The data the visual tests show, the same on every run and every machine.
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { Recording } from '../../src/core/replay.ts';

/** The demo's repository and organization, answered from RECORDING. */
export const DEMO_REPOSITORY = 'https://github.com/JetBrains/kotlin';
export const DEMO_ORGANIZATION = 'https://github.com/JetBrains';

/** What GitHub answered for them once (tests/visual/record-github.ts), gzipped JSON. */
export const RECORDING = fileURLToPath(new URL('./github.json.gz', import.meta.url));
export const recording = (): Recording => JSON.parse(gunzipSync(readFileSync(RECORDING)).toString());

/**
 * The fixture at a fixed path: a local directory shows its path, in the field and in its links,
 * so a checkout elsewhere would change the screenshots.
 */
export const FIXTURE_COPY = '/tmp/skill-atlas-visual/fixture';
export function copyFixture() {
  rmSync(FIXTURE_COPY, { recursive: true, force: true });
  mkdirSync(FIXTURE_COPY, { recursive: true });
  cpSync(fileURLToPath(new URL('../../fixture', import.meta.url)), FIXTURE_COPY, { recursive: true });
}
