import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { parseCompactPart } from './parser/compact.ts';
import { drawnOverHoles } from './placement/place.ts';
import { formatAddress } from './model/address.ts';
import { spellPart } from './write/spellPart.ts';

/**
 * 名札の置き場所 (`cap=`) と、胴を半穴ずらす (`shift=`)。
 *
 * 名札は自動で胴の下に置くが、線や隣の部品に重なるときに書き手がずらせる。
 * 胴をずらすのは、ピンの間の穴 (`b5`) に挿した線が胴とリードに隠れないようにするため。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

const render = (...lines: string[]) => renderBreadboard(fence(...lines));

const errorsOf = (...lines: string[]): string => render(...lines).errors.map((one) => one.message).join('\n');

/** 名札の `<text>` (縁取りではなく字のほう) の属性。 */
const captionOf = (svg: string, text: string): string => {
  const found = [...svg.matchAll(/<text ([^>]*class="bf-caption"[^>]*)>([^<]*)<\/text>/g)]
    .filter((match) => match[2] === text && !match[1]!.includes('aria-hidden'));
  expect(found, text).toHaveLength(1);
  return found[0]![1]!;
};

const numberOf = (attributes: string, name: string): number => Number(new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attributes)?.[1]);

describe('cap= を読む', () => {
  test('reads a side and an optional shift in holes', () => {
    const read = (spec: string) => {
      const result = parseCompactPart('R1', spec, 1);
      if (!result.ok) throw new Error(result.error.message);
      return result.value.caption;
    };
    expect(read('resistor a3 a8 10k cap=above')).toMatchObject({ side: 'above', dx: 0, dy: 0 });
    expect(read('resistor a3 a8 10k cap=below:0.5,-1')).toMatchObject({ side: 'below', dx: 0.5, dy: -1 });
    // 側を省くと下。値の語に飲み込まない。
    const plain = parseCompactPart('R1', 'resistor a3 a8 10k cap=1,0', 1);
    expect(plain.ok && plain.value.caption).toMatchObject({ side: 'below', dx: 1, dy: 0 });
    expect(plain.ok && plain.value.value).toBe('10k');
  });

  test('refuses what it cannot read, instead of drawing it as a value', () => {
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k cap=middle')).toContain('cap= は above / below / left / right');
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k cap=below:20,0')).toContain('10 穴まで');
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k cap=above cap=below')).toContain('cap= が 2 回');
    // 側とずらす量の間のコロンは要る。書き落としを黙って読まない。
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k cap=above1,0')).toContain('cap= は above');
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k cap=:1,0')).toContain('cap= は above');
  });

  test('refuses it on parts whose words sit on the package', () => {
    expect(errorsOf('parts:', '  U1: dip8 @ e10 NE555 cap=above')).toContain('@ で置く部品には書けません');
    expect(errorsOf('parts:', '  J1: usb-c/female a10 a11 a12 a13 cap=above')).toContain('2 ピンと 3 ピンの部品だけ');
  });
});

describe('cap= の置き場所', () => {
  test('puts the caption above, beside or below the part, shifted by the holes written', () => {
    const below = captionOf(render('parts:', '  R1: resistor c3 c8 10k').svg, 'R1 10k');
    const above = captionOf(render('parts:', '  R1: resistor c3 c8 10k cap=above').svg, 'R1 10k');
    const right = captionOf(render('parts:', '  R1: resistor c3 c8 10k cap=right').svg, 'R1 10k');
    const nudged = captionOf(render('parts:', '  R1: resistor c3 c8 10k cap=below:1,0').svg, 'R1 10k');
    expect(numberOf(above, 'y')).toBeLessThan(numberOf(below, 'y'));
    expect(numberOf(right, 'x')).toBeGreaterThan(numberOf(below, 'x'));
    // 下へ書いても高さは自動のときと同じ。横へ 1 穴 (20) ずれるだけ。
    expect(numberOf(nudged, 'y')).toBe(numberOf(below, 'y'));
    expect(numberOf(nudged, 'x')).toBe(numberOf(below, 'x') + 20);
  });

  test('writes vertically beside an upright part, and across beside a lying one', () => {
    const upright = captionOf(render('parts:', '  R1: resistor a12 e12 47k cap=left').svg, 'R1 47k');
    expect(upright).toContain('rotate(-90)');
    const lying = captionOf(render('parts:', '  R1: resistor c3 c8 10k cap=left').svg, 'R1 10k');
    expect(lying).not.toContain('rotate');
  });

  test('works on three-lead parts too', () => {
    const { svg, errors } = render('parts:', '  Q1: transistor g20 g21 g22 2SC1815 cap=right');
    expect(errors).toEqual([]);
    expect(numberOf(captionOf(svg, 'Q1 2SC1815'), 'x')).toBeGreaterThan(0);
  });

  test('keeps other captions out of the place it took, whichever is written first', () => {
    // R2 の名札は R1 の下の行に来る。R1 の名札を下へ書いても、R2 のほうが逃げる。
    const { svg } = render('parts:', '  R1: resistor b3 b8 10k cap=below', '  R2: resistor c3 c8 22k');
    expect(numberOf(captionOf(svg, 'R2 22k'), 'y')).toBeGreaterThan(numberOf(captionOf(svg, 'R1 10k'), 'y'));
    // 先に書いた部品の自動の名札も避ける (R1 の名札を 1 行下げて、R2 の名札の所へ書いた)。
    const later = render('parts:', '  R2: resistor c3 c8 22k', '  R1: resistor b3 b8 10k cap=below:0,1').svg;
    expect(numberOf(captionOf(later, 'R2 22k'), 'y')).not.toBe(numberOf(captionOf(later, 'R1 10k'), 'y'));
  });

  test('does not cut the caption short near the board edge', () => {
    const { svg } = render('parts:', '  R1: resistor a1 e1 47k cap=left');
    captionOf(svg, 'R1 47k');
  });
});

describe('shift= で胴を半穴ずらす', () => {
  test('bends the leads from the holes and moves the body half a hole', () => {
    const { svg, errors } = render('parts:', '  R1: resistor b3 b9 68k shift=down');
    expect(errors).toEqual([]);
    expect(svg).toContain('<polyline');
    const plain = render('parts:', '  R1: resistor b3 b9 68k').svg;
    expect(plain).not.toContain('<polyline');
    // 名札も胴と一緒に半穴 (10) 下がる。
    expect(numberOf(captionOf(svg, 'R1 68k'), 'y')).toBe(numberOf(captionOf(plain, 'R1 68k'), 'y') + 10);
  });

  test('frees the holes between the pins, so a wire can end there', () => {
    const placed = (spec: string) => {
      const result = render('parts:', `  R1: resistor ${spec}`);
      expect(result.errors).toEqual([]);
      return result;
    };
    placed('b3 b9 68k shift=down');
    const parsed = parseCompactPart('R1', 'resistor b3 b9 68k shift=down', 1);
    expect(parsed.ok && parsed.value.shift).toBe('down');
    const holes = (shift: 'down' | null) => drawnOverHoles({
      id: 'R1', type: 'resistor', written: 'resistor', variant: null, kind: 'two-lead', bridges: [],
      pins: [
        { name: '1', address: { kind: 'hole', row: 'b', col: 3 } },
        { name: '2', address: { kind: 'hole', row: 'b', col: 9 } },
      ],
      value: '68k', label: null, at: null, shift, line: 1,
    }).map(formatAddress);
    expect(holes(null)).toContain('b5');
    expect(holes('down')).toEqual(['b3', 'b9']);
  });

  test('only moves across the leads, never along them', () => {
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k shift=left')).toContain('寝かせた部品の shift= は up か down');
    expect(errorsOf('parts:', '  R1: resistor a12 e12 10k shift=up')).toContain('縦に立てた部品の shift= は left か right');
    expect(errorsOf('parts:', '  R1: resistor a20 c22 10k shift=up')).toContain('斜めの部品には書けません');
    expect(errorsOf('parts:', '  Q1: transistor g20 g21 g22 2SC1815 shift=up')).toContain('2 ピンの部品だけ');
    expect(errorsOf('parts:', '  R1: resistor a3 a8 10k shift=sideways')).toContain('up / down / left / right');
    // 缶がリードを持つ水晶は、曲げたリードを描けないので断る。
    expect(errorsOf('parts:', '  Y1: crystal b3 b5 16M shift=down')).toContain('shift= は書けません');
  });

  test('treats a part lying along one rail as lying', () => {
    expect(errorsOf('parts:', '  R1: resistor +t3 +t8 10k shift=down')).toBe('');
  });
});

describe('書き戻し', () => {
  test('keeps cap= and shift= as written', () => {
    for (const line of [
      'R1: resistor b3 b9 68k shift=down',
      'D1: diode i17(A) i14(K) 1N4148 cap=below:1,0',
      'R2: resistor a12 e12 47k cap=left shift=right',
    ]) {
      const [id, spec] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)];
      const parsed = parseCompactPart(id, spec, 1);
      if (!parsed.ok) throw new Error(parsed.error.message);
      expect(spellPart(parsed.value)).toBe(line);
    }
  });
});
