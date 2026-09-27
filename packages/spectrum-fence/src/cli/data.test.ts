import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dataFrom } from './data.ts';

describe('dataFrom', () => {
  const home = mkdtempSync(join(tmpdir(), 'spectrum-data-'));
  writeFileSync(join(home, 'a.csv'), 'Frequency (Hz),Trace 1 (dBm)\n');
  writeFileSync(join(home, 'big.csv'), '!'.repeat(1_000_001));

  test('reads a file next to the markdown', () => {
    expect(dataFrom(home)('a.csv')).toBe('Frequency (Hz),Trace 1 (dBm)\n');
  });

  test('does not follow paths, and refuses large or missing files', () => {
    expect(dataFrom(home)('../a.csv')).toBeNull();
    expect(dataFrom(home)('sub/a.csv')).toBeNull();
    expect(dataFrom(home)('big.csv')).toBeNull();
    expect(dataFrom(home)('none.csv')).toBeNull();
  });

  test('does not follow a symlink out of the folder, nor read a device', () => {
    const outside = mkdtempSync(join(tmpdir(), 'spectrum-secret-'));
    writeFileSync(join(outside, 'secret.txt'), 'TOP-SECRET');
    symlinkSync(join(outside, 'secret.txt'), join(home, 'leak.csv'));
    symlinkSync('/dev/zero', join(home, 'bomb.txt'));
    symlinkSync('a.csv', join(home, 'alias.csv'));
    expect(dataFrom(home)('leak.csv')).toBeNull();
    expect(dataFrom(home)('bomb.txt')).toBeNull();
    // 同じフォルダの中を指すリンクも辿らない (決まりを 1 つにする)。
    expect(dataFrom(home)('alias.csv')).toBeNull();
  });

  test('refuses a directory that happens to have the name', () => {
    mkdirSync(join(home, 'dir.csv'));
    expect(dataFrom(home)('dir.csv')).toBeNull();
  });
});
