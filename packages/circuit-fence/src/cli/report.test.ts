import { afterEach, describe, expect, test, vi } from 'vitest';
import { compileCircuit } from '../core/index.ts';
import { checkHeading, reportNotices } from './report.ts';

/** R1 の片足 (a2) がどこにもつながっていない回路。お知らせが 1 件出る。 */
const LOOSE = 'parts:\n  R1: resistor a1 a2 10k\n  R2: resistor b1 b2 10k\nwires:\n  - a1 -- b1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reportNotices', () => {
  test('writes to standard error, like the unreadable lines and the other two fences', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { notices, erc } = compileCircuit(LOOSE, { erc: true });

    reportNotices([...notices, ...erc]);

    expect(out).not.toHaveBeenCalled();
    expect(err.mock.calls.flat().join('\n')).toMatch(/お知らせ: .*R1\.2 はどこにもつながっていません/);
  });

  test('stays quiet for a figure that turned the notices off', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { erc } = compileCircuit(LOOSE, { erc: true });

    reportNotices(erc, false);

    expect(err).not.toHaveBeenCalled();
  });
});

describe('checkHeading', () => {
  test('says it was read only when nothing was left unread', () => {
    expect(checkHeading('a (1 行目)', 0)).toBe('a (1 行目): 読めました');
  });

  test('counts what could not be read instead of saying it was read', () => {
    expect(checkHeading('a (1 行目)', 2)).toBe('a (1 行目): 2 件読めませんでした');
  });
});
