import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dataFrom } from './data.ts';

describe('dataFrom', () => {
  const home = mkdtempSync(join(tmpdir(), 'vna-data-'));
  writeFileSync(join(home, 'a.s2p'), '# HZ S RI R 50\n');
  writeFileSync(join(home, 'big.s1p'), '!'.repeat(1_000_001));

  test('reads a file next to the markdown', () => {
    expect(dataFrom(home)('a.s2p')).toBe('# HZ S RI R 50\n');
  });

  test('does not follow paths, and refuses large or missing files', () => {
    expect(dataFrom(home)('../a.s2p')).toBeNull();
    expect(dataFrom(home)('sub/a.s2p')).toBeNull();
    expect(dataFrom(home)('big.s1p')).toBeNull();
    expect(dataFrom(home)('none.s2p')).toBeNull();
  });

  test('does not follow a symlink out of the folder, nor read a device', () => {
    const outside = mkdtempSync(join(tmpdir(), 'vna-secret-'));
    writeFileSync(join(outside, 'secret.txt'), 'TOP-SECRET');
    symlinkSync(join(outside, 'secret.txt'), join(home, 'leak.s1p'));
    symlinkSync('/dev/zero', join(home, 'bomb.s1p'));
    symlinkSync('a.s2p', join(home, 'alias.s2p'));
    expect(dataFrom(home)('leak.s1p')).toBeNull();
    expect(dataFrom(home)('bomb.s1p')).toBeNull();
    // 同じフォルダの中を指すリンクも辿らない (決まりを 1 つにする)。
    expect(dataFrom(home)('alias.s2p')).toBeNull();
  });

  test('refuses a directory that happens to have the name', () => {
    mkdirSync(join(home, 'dir.s2p'));
    expect(dataFrom(home)('dir.s2p')).toBeNull();
  });
});
