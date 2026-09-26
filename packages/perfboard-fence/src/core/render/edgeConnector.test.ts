import { describe, expect, test } from 'vitest';
import { textWidth } from 'fence-kit';
import { renderPerfboard } from '../index.ts';

/**
 * 板の左右の縁に載せた端面の SMA と、行の名前。NanoVNA の冊の治具の図すべてで、
 * 台座が行の名前 `D`〜`F` を隠し、`SMA female` の字が `G` に掛かっていた。
 * コネクタの足の番地 (`e1 d0 f0`) を読む手掛かりがちょうどその行なので、座標で見張る。
 */
const FIXTURE = [
  'board:',
  '  size: 16x8',
  '  slots: on',
  'parts:',
  '  J1: sma/female-edge e1 d0 f0',
  '  J2: sma/female-edge e16 f17',
  '  R1: resistor e8 h8 100',
].join('\n');

type Text = { readonly x: number; readonly y: number; readonly anchor: string; readonly size: number; readonly body: string; readonly at: number };

const texts = (svg: string): Text[] =>
  [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="(\w+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((match) => ({
      x: Number(match[1]), y: Number(match[2]), anchor: match[3]!, size: Number(match[4]), body: match[5]!, at: match.index ?? 0,
    }));

/** 字の横の広がり (見積もり)。`textWidth` は字の大きさに対する比。 */
const span = (text: Text): { left: number; right: number } => {
  const width = textWidth(text.body) * text.size;
  if (text.anchor === 'start') return { left: text.x, right: text.x + width };
  if (text.anchor === 'end') return { left: text.x - width, right: text.x };
  return { left: text.x - width / 2, right: text.x + width / 2 };
};

/** 字と字の間に要る隙間。縁取り 2 つぶんと、幅の見積もりの誤差。 */
const CLEARANCE = 6;

describe('edge-mounted SMA and the row names', () => {
  const { svg } = renderPerfboard(FIXTURE);
  const all = texts(svg);
  const rowNames = all.filter((text) => /^[A-H]$/.test(text.body));

  test('the row names are drawn after (above) the connector bodies', () => {
    const lastConnector = svg.lastIndexOf('SMA female');
    for (const name of ['D', 'E', 'F']) {
      const label = rowNames.find((text) => text.body === name)!;
      expect(label.at, name).toBeGreaterThan(lastConnector);
    }
  });

  test('the "SMA female" badge keeps clear of every row name', () => {
    const badges = all.filter((text) => text.body.startsWith('SMA'));
    expect(badges).toHaveLength(2);

    for (const badge of badges) {
      const box = span(badge);
      for (const name of rowNames) {
        const half = textWidth(name.body) * name.size / 2;
        const sameLine = Math.abs(name.y - badge.y) < badge.size;
        // 縁取り (両側 1.5) と字の見積もりの誤差のぶん、隙間を取って見る。
        const apart = box.right + CLEARANCE <= name.x - half || box.left - CLEARANCE >= name.x + half;
        expect(!sameLine || apart, `${badge.body} と ${name.body}`).toBe(true);
      }
    }
  });
});
