import { describe, expect, test } from 'vitest';
import { REAL_INK, bodySize, drawBody, hasBody } from './bodies.ts';
import type { BodyInk, BodyPart } from './bodies.ts';

/**
 * 胴の姿は 2 つの板が共有する (52 の docs/18)。ここで見るのは**板に依らない
 * 約束**だけ — 描いた形が `bodySize` の言う大きさに収まること、極性の印が
 * 効くこと、色が `ink` を通ること。板ごとの置き方は各パッケージが見る。
 */
const part = (over: Partial<BodyPart> = {}): BodyPart =>
  ({ type: 'resistor', value: null, variant: null, pins: [{ name: '' }, { name: '' }], ...over });

/** 描いた図形の x 座標の端 (rect と circle だけ見る)。 */
function extentOf(svg: string): { readonly left: number; readonly right: number } {
  let left = Infinity;
  let right = -Infinity;
  for (const [, x, w] of svg.matchAll(/<rect x="(-?[\d.]+)"[^>]*?\swidth="([\d.]+)"/g)) {
    left = Math.min(left, Number(x));
    right = Math.max(right, Number(x) + Number(w));
  }
  for (const [, cx, r] of svg.matchAll(/<circle cx="(-?[\d.]+)"[^>]*?\sr="([\d.]+)"/g)) {
    left = Math.min(left, Number(cx) - Number(r));
    right = Math.max(right, Number(cx) + Number(r));
  }
  return { left, right };
}

describe('drawBody', () => {
  test('draws a shape of its own for every type the palettes offer', () => {
    const types = [
      'resistor', 'capacitor', 'led', 'diode', 'zener', 'schottky', 'photodiode', 'varicap', 'diac',
      'crystal', 'inductor', 'buzzer', 'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc',
      'varistor', 'reed', 'fuse', 'lamp',
      // 回路図にあって板に無かった実物 (52 の docs/21 の手順 7)。
      'battery', 'solar', 'speaker', 'mic', 'switch', 'switch-nc',
    ];
    const drawn = new Map(types.map((type) => [type, drawBody(part({ type }), 60)]));

    for (const [type, svg] of drawn) expect(svg, type).not.toBe('');
    // **見分けが付く。** 同じ絵が 2 つあると、図から実物を選べない
    // (ダイオードの仲間は色と帯で違い、円板は印で違う)。
    expect(new Set(drawn.values()).size).toBe(types.length);
    expect(types.every((type) => hasBody(type))).toBe(true);
    expect(hasBody('resistr')).toBe(false);
  });

  test('keeps every mark inside the body it reports, even on the shortest span', () => {
    // 隣り合う穴に挿した部品は胴が短い。はみ出すと板の地や隣の穴の上に乗る。
    for (const type of [
      'resistor', 'capacitor', 'diode', 'fuse', 'crystal',
      'battery', 'solar', 'speaker', 'mic', 'switch', 'switch-nc',
    ]) {
      for (const span of [12, 20, 40, 90]) {
        const one = part({ type, value: type === 'resistor' ? '10k' : null });
        const { left, right } = extentOf(drawBody(one, span));
        const { width } = bodySize(one, span);

        expect(left, `${type} ${span}`).toBeGreaterThanOrEqual(-width / 2 - 0.01);
        expect(right, `${type} ${span}`).toBeLessThanOrEqual(width / 2 + 0.01);
      }
    }
  });

  test('turns the mark around when the polarity is written the other way', () => {
    const forward = drawBody(part({ type: 'diode', pins: [{ name: 'A' }, { name: 'K' }] }), 60);
    const reversed = drawBody(part({ type: 'diode', pins: [{ name: 'K' }, { name: 'A' }] }), 60);

    expect(forward).not.toBe(reversed);
    // 印を書かなければ「先に書いた穴が + 側」の規則で、順に書いたのと同じ絵。
    expect(drawBody(part({ type: 'diode' }), 60)).toBe(forward);
  });

  test('takes its capacitor shape from the variant, falling back to the minus pin', () => {
    const film = drawBody(part({ type: 'capacitor', variant: 'film' }), 60);
    const ceramic = drawBody(part({ type: 'capacitor', variant: 'ceramic' }), 60);
    const bare = drawBody(part({ type: 'capacitor' }), 60);
    const minus = drawBody(part({ type: 'capacitor', pins: [{ name: '+' }, { name: '-' }] }), 60);

    expect(bare).toBe(film);
    expect(ceramic).not.toBe(film);
    // 姿を書かなかったときの選び分けは今までどおり `-` の有無で決まる。
    expect(minus).not.toBe(film);
    expect(minus).toBe(drawBody(part({ type: 'capacitor', variant: 'electrolytic' }), 60));
  });

  test('passes every fill through the ink, naming the colours a legend can pick up', () => {
    const named: string[] = [];
    const ink: BodyInk = { paint: (color, name) => { if (name !== undefined) named.push(name); return color; } };

    drawBody(part({ type: 'resistor', value: '10k' }), 60, ink);
    // 帯は名前つき (白黒では網に移して凡例から引く)。
    expect(named).toEqual(['brown', 'black', 'orange', 'brown']);

    const swapped = drawBody(part({ type: 'resistor', value: '10k' }), 60, { paint: () => 'none' });
    expect(swapped).not.toContain('#');
    expect(drawBody(part({ type: 'resistor', value: '10k' }), 60, REAL_INK)).toContain('#');
  });

  test('names the LED colour it was given, so a black and white figure can hatch it', () => {
    const named: string[] = [];
    const ink: BodyInk = { paint: (color, name) => { if (name !== undefined) named.push(name); return color; } };

    drawBody(part({ type: 'led', value: 'green' }), 60, ink);

    expect(named).toEqual(['green']);
  });
});

describe('bodySize', () => {
  test('grows with the span until the real part stops growing', () => {
    expect(bodySize(part(), 20).width).toBe(12);
    expect(bodySize(part(), 60).width).toBe(36);
    // 実物の抵抗はどこまでも伸びない。足を曲げて広げても胴は同じ。
    expect(bodySize(part(), 200).width).toBe(38);
  });

  test('makes the round bodies square, since the drawing is a circle', () => {
    for (const type of ['led', 'buzzer', 'thermistor', 'lamp']) {
      const size = bodySize(part({ type }), 60);
      expect(size.width, type).toBe(size.height);
    }
  });

  test('shrinks a 3mm led without moving its leads', () => {
    expect(bodySize(part({ type: 'led', variant: '3mm' }), 60).width)
      .toBeLessThan(bodySize(part({ type: 'led' }), 60).width);
  });
});
