import { describe, expect, test } from 'vitest';
import { PIN_NAME_GAP, pinNameWidth } from 'fence-kit';
import { renderBreadboard } from './index.ts';

/**
 * 板の外の機器の足の名前 (`type: device` の `pins:`)。**隣の名前と字が触れない。**
 * 帯に機器が詰め込まれると足の間が縮み、`GND VCC OUT` が `GNDVCCOUT` と読めた。
 */

type Drawn = { readonly x: number; readonly y: number; readonly size: number; readonly text: string };

const drawnTexts = (svg: string): Drawn[] =>
  [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map(([, x, y, size, text]) => ({ x: Number(x), y: Number(y), size: Number(size), text: text ?? '' }));

/** 同じ高さに並んだ名前どうしの、字と字の隙間の最小。 */
function tightestGap(names: readonly Drawn[]): number {
  let tightest = Infinity;
  for (const one of names) {
    for (const other of names) {
      if (one === other || one.y !== other.y || other.x <= one.x) continue;
      const gap = other.x - one.x - (pinNameWidth(one.text) * one.size + pinNameWidth(other.text) * other.size) / 2;
      tightest = Math.min(tightest, gap);
    }
  }
  return tightest;
}

const crammed = [
  'board: mini',
  'parts:',
  '  PIR:',
  '    type: device',
  '    label: PIR module HC-SR501',
  '    pins: [GND, VCC, OUT]',
  '  AD:',
  '    type: device',
  '    label: Analog Discovery 2',
  '    pins: [1+, 1-, 2+, 2-, W1, W2, GND]',
  '  US:',
  '    type: device',
  '    label: HC-SR04',
  '    pins: [VCC, TRIG, ECHO, GND]',
  '',
].join('\n');

describe('機器の足の名前', () => {
  test('帯に詰め込んでも、隣の名前と字が触れない', () => {
    const { svg } = renderBreadboard(crammed);
    const pinNames = new Set(['GND', 'VCC', 'OUT', '1+', '1-', '2+', '2-', 'W1', 'W2', 'TRIG', 'ECHO']);
    const names = drawnTexts(svg).filter((drawn) => pinNames.has(drawn.text));

    expect(names.length).toBe(14);
    expect(tightestGap(names)).toBeGreaterThanOrEqual(PIN_NAME_GAP - 0.05);
  });

  test('長い名前は箱を広げて、既定の大きさのまま並べる', () => {
    const { svg } = renderBreadboard([
      'board: half',
      'parts:',
      '  M:',
      '    type: device',
      '    pins: [SIGNAL_A, SIGNAL_B, ENABLE_X]',
      '',
    ].join('\n'));
    const names = drawnTexts(svg).filter((drawn) => drawn.text.length === 8);

    const roomy = drawnTexts(renderBreadboard('board: half\nparts:\n  M:\n    type: device\n    pins: [A, B]\n').svg)
      .find((drawn) => drawn.text === 'A');

    expect(names.map((name) => name.size)).toEqual([roomy?.size, roomy?.size, roomy?.size]);
    expect(tightestGap(names)).toBeGreaterThanOrEqual(PIN_NAME_GAP - 0.05);
  });
});
