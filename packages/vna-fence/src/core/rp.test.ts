import { describe, expect, test } from 'vitest';
import { renderVna } from './index.ts';
import { impedanceOf } from './model/dut.ts';
import type { LumpedSpec } from './model/dut.ts';
import { parseDutLine } from './parser/dut.ts';

/**
 * `rp` — 全体に並列に付く抵抗 (Ω、素の数でよい)。`cp` と同じ所 (esr・esl を含む
 * 本体の両端) に付く。フェライトビーズの等価回路 `series L 100n rp 300 cp 2p esr 0.3`
 * で、R が山になり X が正から負へ回ることを数で見る。
 */
const bead = (): LumpedSpec => ({
  kind: 'lumped', place: 'series', part: 'L', value: 100e-9, esr: 0.3, esl: 0, cp: 2e-12, rp: 300,
});
const messagesOf = (lines: readonly string[]): string =>
  renderVna(['sweep: 1M-1G', ...lines].join('\n')).errors.map((error) => error.message).join('\n');

describe('rp (並列の抵抗)', () => {
  test('reads rp as ohms, with or without a prefix', () => {
    expect(parseDutLine('series L 100n rp 300 cp 2p esr 0.3')).toMatchObject({
      ok: true, value: { rp: 300, cp: 2e-12, esr: 0.3 },
    });
    expect(parseDutLine('series L 1u rp 4k7')).toMatchObject({ ok: true, value: { rp: 4700 } });
    expect(parseDutLine('series R 100')).toMatchObject({ ok: true, value: { rp: 0 } });
  });

  test('refuses zero, a negative value and one out of range', () => {
    for (const text of ['0', '-10', '2G', 'abc']) {
      const said = messagesOf(['dut:', `  - series L 100n rp ${text}`]);
      expect(said, text).toContain('rp');
      expect(said, text).not.toContain('知らない寄生分');
    }
  });

  test('makes the bead peak in R and swing X from positive to negative', () => {
    const z = (f: number) => impedanceOf(bead(), f);
    // L ∥ C の共振 1/(2π√(LC)) ≈ 356 MHz で R は rp に近づき、X は 0 を横切る
    expect(z(356e6).re).toBeGreaterThan(250);
    expect(z(356e6).re).toBeLessThan(300);
    expect(z(10e6).re).toBeLessThan(5);
    expect(z(100e6).im).toBeGreaterThan(0);
    expect(z(1e9).im).toBeLessThan(0);
  });

  test('leaves the part alone when rp is not written', () => {
    const plain = { ...bead(), rp: 0, cp: 0 };
    expect(impedanceOf(plain, 1e6).re).toBeCloseTo(0.3, 9);
  });
});
