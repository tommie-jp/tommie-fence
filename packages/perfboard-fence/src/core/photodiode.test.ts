import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { isAxial } from './parts/types.ts';

/**
 * フォトダイオードの胴。**砲弾型の玉で描く** (fence-kit の `domeBody`。LED と同じ形)
 * ので、当たり判定も玉にする (perfboard の約束 9: 胴の形は描画と当たり判定で同じ)。
 * 以前は足の間に伸びる箱で当てていて、足を広げると間の部品と重なると言っていた。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');

describe('フォトダイオード', () => {
  test('is radial like the LED, so it fits in neighbouring holes', () => {
    // 軸物 (胴の両端から足が出る) ではない。隣の穴に挿せる。
    expect(isAxial('photodiode')).toBe(false);
    const result = renderPerfboard(fence('parts:', '  D1: photodiode b2 b3', 'wires:', '  - b2 -- a2', '  - b3 -- c3'));

    expect(result.notices.map((one) => one.message).join('\n')).not.toContain('狭すぎます');
  });

  test('collides as the drawn dome, not as a body stretched between the legs', () => {
    const result = renderPerfboard(fence('parts:', '  D1: photodiode a1 a8', '  R1: resistor a2 a3 1k'));

    expect(result.notices.map((one) => one.message).join('\n')).not.toContain('D1 と R1 の胴が重なっています');
  });
});
