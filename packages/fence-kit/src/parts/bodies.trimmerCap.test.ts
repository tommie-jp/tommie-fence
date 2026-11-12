import { describe, expect, test } from 'vitest';
import { TRIMMER_CAP_HOLES, bodySize, drawBody } from './bodies.ts';
import type { BodyPart } from './bodies.ts';
import { capacitorMark } from '../partsListing.ts';

/**
 * トリマコンデンサ (`capacitor/trimmer`) の胴。**上から見た丸い胴に、回す所 (ローター) と調整の溝**で、
 * 円板のセラミックとも LED の玉とも違う絵になることを数で見る。
 */
const part = (over: Partial<BodyPart> = {}): BodyPart =>
  ({ type: 'capacitor', value: '50p', variant: 'trimmer', pins: [{ name: '' }, { name: '' }], ...over });

/** 穴 2 つぶん (20 px × 2) 離したときの間隔。 */
const SPAN = 40;

const circles = (svg: string): readonly number[] =>
  [...svg.matchAll(/<circle [^>]*\br="([\d.]+)"/g)].map((match) => Number(match[1]));

describe('トリマコンデンサの胴', () => {
  test('is a look of its own among the capacitors', () => {
    const trimmer = drawBody(part(), SPAN);

    for (const variant of ['ceramic', 'film', 'electrolytic', 'tantalum']) {
      expect(trimmer, variant).not.toBe(drawBody(part({ variant }), SPAN));
    }
  });

  test('draws a round case, a rotor inside it and one adjusting slot across the rotor', () => {
    const svg = drawBody(part(), SPAN);
    const [shell, rotor] = circles(svg);

    expect(circles(svg)).toHaveLength(2);
    expect(rotor).toBeLessThan(shell ?? 0);
    // 溝は 1 本 (マイナスの溝)。ローターからはみ出さない。
    const slots = [...svg.matchAll(/<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g)];
    expect(slots).toHaveLength(1);
    const [, x1, y1, x2, y2] = (slots[0] ?? []).map(Number);
    expect(Math.hypot(x1 ?? 0, y1 ?? 0)).toBeLessThanOrEqual((rotor ?? 0) + 0.01);
    expect(Math.hypot(x2 ?? 0, y2 ?? 0)).toBeLessThanOrEqual((rotor ?? 0) + 0.01);
    // 溝はピンの線 (x 軸) に重ねない — 重ねるとリードが胴を貫いて見える。
    expect(Math.abs(y1 ?? 0)).toBeGreaterThan(1);
  });

  test('prints no three digit code: the real one is told apart by the colour of its case', () => {
    expect(drawBody(part({ value: '100n' }), SPAN)).not.toContain('<text');
    expect(capacitorMark('capacitor', 'trimmer', '50p')).toBe('');
    expect(capacitorMark('capacitor', 'ceramic', '50p')).toBe('500');
  });

  test('reports the size it draws, inside the pins when they are two holes apart', () => {
    const size = bodySize(part(), SPAN);
    const [shell] = circles(drawBody(part(), SPAN));

    expect(size.width).toBe(size.height);
    expect(size.width).toBeCloseTo((shell ?? 0) * 2);
    expect(size.width).toBeLessThan(SPAN);
    // セラミックの円板 (径 19) より大きい: 6 mm 級の胴。
    expect(size.width).toBeGreaterThan(bodySize(part({ variant: 'ceramic' }), SPAN).width);
  });

  test('shrinks rather than spill over the holes when written too close', () => {
    expect(bodySize(part(), 20).width).toBeLessThan(20);
  });

  test('does not grow when the pins are written too far apart', () => {
    expect(bodySize(part(), 200)).toEqual(bodySize(part(), SPAN));
  });

  test('says how many holes apart the real pins are: 5 mm is two holes', () => {
    expect(TRIMMER_CAP_HOLES).toBe(2);
  });

  test('lets the theme repaint it', () => {
    expect(drawBody(part(), SPAN, { paint: () => '#ff00ff' })).toContain('#ff00ff');
  });
});
