import { describe, expect, it } from 'vitest';
import { lookupIcPinout } from '../icLayouts.ts';
import { icBox, icShapeTex, icStepOf } from './icShape.ts';

const pinout555 = () => {
  const pinout = lookupIcPinout('TLC555');
  if (pinout === null) throw new Error('TLC555');
  return pinout;
};

describe('IC の箱 (ic)', () => {
  it('ピンを働きの辺に、実物の番号のまま置く', () => {
    // Act
    const box = icBox(pinout555(), 0.5);

    // Assert
    const sideOf = (pin: number) => box.places.find((place) => place.pin === pin)?.side;
    expect(sideOf(8)).toBe('top');
    expect(sideOf(4)).toBe('top');
    expect(sideOf(7)).toBe('left');
    expect(sideOf(3)).toBe('right');
    expect(sideOf(1)).toBe('bottom');
  });

  it('ピンは中心から間隔の刻み — 奇数本は中心に揃え、偶数本は 1 本目が中心', () => {
    // Act
    const box = icBox(pinout555(), 0.5);

    // Assert
    const alongOf = (pin: number) => box.places.find((place) => place.pin === pin)?.along;
    expect([alongOf(7), alongOf(6), alongOf(2)]).toEqual([0.5, 0, -0.5]);
    expect([alongOf(8), alongOf(4)]).toEqual([0, 0.5]);
    expect(alongOf(3)).toBe(0);
  });

  it('箱はピンの名前と型番が重ならない大きさ', () => {
    // Act
    const box = icBox(pinout555(), 0.5);

    // Assert — 左の列 `7 DISCH` (0.7 cm) と型番 `TLC555` の半分が横に並ぶ
    expect(box.halfWidth).toBeGreaterThanOrEqual(0.1 + 0.7 + 0.15 + 0.45);
    // 上の `4 RESET` と下の `5 CONT` が縦に伸びても型番に届かない
    expect(box.halfHeight).toBeGreaterThanOrEqual(0.1 + 0.7 + 0.15 + 0.15);
  });

  it('`_` を含む名前は 2 字に数え、型番の横の `OUT_A 4` が型番に食い込まない (SA612)', () => {
    // Arrange
    const pinout = lookupIcPinout('SA612');
    if (pinout === null) throw new Error('SA612');

    // Act
    const box = icBox(pinout, 0.5);

    // Assert — `4 OUT_A` は 7 字だが `_` を 2 字に数えて 8 字 (1.12 cm)、型番 `SA612` の半分は 0.375 cm
    expect(box.halfWidth).toBeGreaterThanOrEqual(0.1 + 8 * 0.14 + 0.15 + 0.375);
  });

  it.each([[1, 0.5], [1.2, 0.6], [2, 1], [0.6, 0.6], [3, 0.75]])('pitch %s のピンの間隔は %s cm (番地の刻みに乗る)', (pitch, step) => {
    expect(icStepOf(pitch)).toBeCloseTo(step);
  });

  it('宣言に 8 本ぶんのピンの先と縁のアンカーを書く', () => {
    // Act
    const tex = icShapeTex(icBox(pinout555(), 0.5)).join('\n');

    // Assert
    expect(tex).toContain('\\pgfdeclareshape{icTLC555s500}');
    for (let pin = 1; pin <= 8; pin += 1) {
      expect(tex).toContain(`\\anchor{pin ${pin}}`);
      expect(tex).toContain(`\\anchor{bpin ${pin}}`);
    }
  });
});
