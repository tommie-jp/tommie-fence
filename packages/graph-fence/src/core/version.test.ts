import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { VERSION } from './version.ts';

describe('VERSION', () => {
  test('matches package.json (doVersion.sh writes both)', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { version: string };

    expect(VERSION).toBe(manifest.version);
  });
});
