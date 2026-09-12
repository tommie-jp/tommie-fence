import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * **ERC は `notices` に混ぜず、`erc` として別に返す** (52 の docs/55)。
 *
 * editor の帯は ERC だけを「検査 N」の釦の向こうへ畳む。混ざったままだと、
 * 畳む側が文面で見分けることになる。**図の下の帯と CLI は今までどおり**
 * 両方を並べる。
 */

/** つないでいない抵抗。板は全穴が独立なので、挿しただけでは何にもつながらない。 */
const LOOSE = ['board: 12x7', 'parts:', '  R1: resistor b2 b6 1k', ''].join('\n');

/** 胴が重なる 2 つ。**置いたその場で直す種類**なので、釦の向こうへは隠さない。 */
const OVERLAP = ['board: 12x7', 'parts:', '  R1: resistor b2 b6 1k', '  R2: resistor b3 b7 1k', ''].join('\n');

describe('renderPerfboard の erc', () => {
  test('つながっていない足は erc に来る', () => {
    const { erc } = renderPerfboard(LOOSE);

    expect(erc.some((one) => one.message.includes('つながっていません'))).toBe(true);
  });

  test('erc は notices に混ざらない', () => {
    const { notices, erc } = renderPerfboard(LOOSE);

    expect(erc.length).toBeGreaterThan(0);
    for (const one of erc) expect(notices).not.toContain(one);
  });

  // **当たり判定は帯に残す。** 胴の重なりは中間状態として当たり前に出るもの
  // ではなく、置いたその場で直す間違い。釦の向こうに隠すと気づくのが遅れる。
  test('胴の重なりは notices のまま', () => {
    const { notices, erc } = renderPerfboard(OVERLAP);

    expect(notices.some((one) => one.message.includes('重なって'))).toBe(true);
    expect(erc.some((one) => one.message.includes('重なって'))).toBe(false);
  });

  test('check: off の図では数えない', () => {
    const off = `${LOOSE}style:\n  check: off\n`;

    expect(renderPerfboard(off).erc).toEqual([]);
  });

  // 図の下の帯は今までどおり両方を並べる (例 05-check.md がそう書いてある)。
  test('図の下の帯には今までどおり出る', () => {
    const { errorHtml } = renderPerfboard(LOOSE);

    expect(errorHtml).toContain('つながっていません');
  });
});
