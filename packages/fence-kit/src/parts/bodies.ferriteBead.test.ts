import { describe, expect, test } from 'vitest';
import { bodySize, drawBody, hasBody } from './bodies.ts';
import type { BodyPart } from './bodies.ts';

/**
 * フェライトビーズの胴。**帯の無い濃い円筒**で、抵抗ともコイルとも違う絵になることを数で見る。
 */
const part = (type: string, over: Partial<BodyPart> = {}): BodyPart =>
  ({ type, value: null, variant: null, pins: [{ name: '' }, { name: '' }], ...over });

/** 16 進の色の明るさ (3 成分の平均)。 */
const brightness = (hex: string): number => {
  const value = Number.parseInt(hex.slice(1), 16);
  return (((value >> 16) & 255) + ((value >> 8) & 255) + (value & 255)) / 3;
};

/** いちばん外側 (最初) の rect の塗りと高さ。 */
const firstRect = (svg: string): { readonly fill: string; readonly height: number } => {
  const rect = /<rect [^>]*>/.exec(svg)?.[0] ?? '';
  return {
    fill: /fill="(#[0-9a-f]{6})"/i.exec(rect)?.[1] ?? '',
    height: Number(/height="([\d.]+)"/.exec(rect)?.[1] ?? 0),
  };
};

describe('フェライトビーズの胴', () => {
  test('has a body of its own, different from the coil and the resistor', () => {
    const bead = drawBody(part('ferrite-bead'), 60);

    expect(hasBody('ferrite-bead')).toBe(true);
    expect(bead).not.toBe(drawBody(part('inductor'), 60));
    expect(bead).not.toBe(drawBody(part('resistor'), 60));
  });

  test('is a dark cylinder with no colour bands', () => {
    const bead = drawBody(part('ferrite-bead', { value: '600R@100M' }), 60);

    expect(brightness(firstRect(bead).fill)).toBeLessThan(96);
    // 帯にすると抵抗に見える。値は字で書く。
    expect(bead).not.toMatch(/#(?:8b4513|ff0000|ffa500)/i);
  });

  test('reports a size as thick as a resistor and keeps its marks inside it', () => {
    for (const span of [12, 40, 90]) {
      const size = bodySize(part('ferrite-bead'), span);
      const svg = drawBody(part('ferrite-bead'), span);
      for (const [, x, w] of svg.matchAll(/<rect x="(-?[\d.]+)"[^>]*?\swidth="([\d.]+)"/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(-size.width / 2 - 0.01);
        expect(Number(x) + Number(w)).toBeLessThanOrEqual(size.width / 2 + 0.01);
      }
      expect(size.height).toBeGreaterThanOrEqual(11);
    }
  });
});
