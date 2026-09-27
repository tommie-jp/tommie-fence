import { describe, expect, test } from 'vitest';
import { renderVna } from './index.ts';

/**
 * **数には単位を要る** (直下の CLAUDE.md の文法の方針 1)。以前は `shunt C 0.1` を
 * 100 mF、`series L 5` を 5 H と黙って受け、周波数の素の数 (`10000000`) を Hz で読んでいた。
 */
const messagesOf = (lines: readonly string[]): string =>
  renderVna(['sweep: 1M-300M', ...lines].join('\n')).errors.map((error) => error.message).join('\n');

describe('vna の素の数', () => {
  test('refuses a bare number for L and C, and for the parasites', () => {
    expect(messagesOf(['dut:', '  - shunt C 0.1'])).toContain('接頭辞');
    expect(messagesOf(['dut:', '  - series L 5'])).toContain('接頭辞');
    expect(messagesOf(['dut:', '  - series C 10p esl 1'])).toContain('接頭辞');
    expect(messagesOf(['dut:', '  - series L 100n cp 1'])).toContain('接頭辞');
  });

  test('keeps a bare number where the unit is fixed: R, esr, Z0, vf and the points', () => {
    expect(messagesOf(['dut:', '  - series R 100', '  - series C 10p esr 0.2', '  - line 50 1m vf 0.66'])).toBe('');
    expect(renderVna('sweep: 1M-300M 201\n').errors).toEqual([]);
  });

  test('accepts a unit written without a prefix (1F, 1H)', () => {
    expect(messagesOf(['dut:', '  - shunt C 1F'])).toBe('');
  });

  test('refuses a bare number of hertz in the sweep, the markers and the notes', () => {
    expect(renderVna('sweep: 1000000-300000000\n').errors.map((error) => error.message).join('\n')).toContain('接頭辞');
    expect(messagesOf(['markers:', '  - 10000000'])).toContain('接頭辞');
    expect(messagesOf(['notes:', '  - mark 10000000 -6dB'])).toContain('接頭辞');
    expect(messagesOf(['notes:', '  - band 88000000 108M'])).toContain('接頭辞');
  });

  test('keeps reading a prefix, and Hz with or without one', () => {
    expect(renderVna('sweep: 1MHz-300M\nmarkers:\n  - 100M\n  - 2.4GHz\n  - 455kHz\n  - 900Hz\n').errors
      .filter((error) => !error.message.includes('範囲'))).toEqual([]);
  });
});
