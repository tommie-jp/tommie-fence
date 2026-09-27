import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readNeighbor } from './neighbor.ts';

const LIMITS = { pattern: /^[\w-][\w.-]{0,63}\.dat$/i, maxBytes: 1000 };

describe('readNeighbor', () => {
  const home = mkdtempSync(join(tmpdir(), 'kit-neighbor-'));
  writeFileSync(join(home, 'a.dat'), 'hello\n');
  writeFileSync(join(home, 'big.dat'), '!'.repeat(1001));
  writeFileSync(join(home, 'edge.dat'), '!'.repeat(1000));
  const read = (name: string): string | null => readNeighbor(home, name, LIMITS);

  test('reads a regular file next to the markdown', () => {
    expect(read('a.dat')).toBe('hello\n');
    expect(read('edge.dat')).toHaveLength(1000);
  });

  test('refuses names outside the pattern, paths, large or missing files', () => {
    expect(read('a.txt')).toBeNull();
    expect(read('../a.dat')).toBeNull();
    expect(read('sub/a.dat')).toBeNull();
    expect(read('/etc/passwd')).toBeNull();
    expect(read('big.dat')).toBeNull();
    expect(read('none.dat')).toBeNull();
  });

  test('refuses a name that passes a loose pattern but is not a bare file name', () => {
    expect(readNeighbor(home, 'sub/a.dat', { pattern: /\.dat$/, maxBytes: 1000 })).toBeNull();
  });

  test('does not follow a symlink, in or out of the folder, nor read a device', () => {
    const outside = mkdtempSync(join(tmpdir(), 'kit-secret-'));
    writeFileSync(join(outside, 'secret.txt'), 'TOP-SECRET');
    symlinkSync(join(outside, 'secret.txt'), join(home, 'leak.dat'));
    symlinkSync('/dev/zero', join(home, 'bomb.dat'));
    symlinkSync('a.dat', join(home, 'alias.dat'));
    expect(read('leak.dat')).toBeNull();
    expect(read('bomb.dat')).toBeNull();
    expect(read('alias.dat')).toBeNull();
  });

  test('refuses a directory that happens to have the name', () => {
    mkdirSync(join(home, 'dir.dat'));
    expect(read('dir.dat')).toBeNull();
  });
});
