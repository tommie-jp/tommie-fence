import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * マイコンボード (Pico など) の向き。**`r180` だけを書ける** — 下に置いて GP0〜GP15 の辺を上へ向ける
 * (教科書の 5-29 の学習ボード)。`r90` / `r270` はピンの名前がピンに重なって読めないので断る。
 */
const fence = (part: string) => ['board:', '  size: 9x7cm', 'parts:', `  ${part}`, 'wires:', '  - v25 -- v26'].join('\n');

describe('board turned r180', () => {
  test('is accepted and puts pin 1 at the upper right', () => {
    const result = renderPerfboard(fence('U1: pico2 v18 r180'));
    expect(result.errors).toEqual([]);
    // 1 番 (GP0) が右上 (v25) に来るので、v25 から出した線は GP0 のネットに乗る。
    const net = result.netlist.find((one) => one.refs.includes('U1.GP0'));
    expect(net?.refs).toEqual(['U1.GP0']);
  });

  test('r90 and r270 are refused with the reason', () => {
    for (const turn of ['r90', 'r270']) {
      const { errors } = renderPerfboard(fence(`U1: pico2 b25 ${turn}`));
      expect(errors.map((error) => error.message).join('\n')).toContain('r180 だけ');
    }
  });

  test('mirror is still refused', () => {
    expect(renderPerfboard(fence('U1: pico2 v18 mirror')).errors).not.toEqual([]);
  });
});
