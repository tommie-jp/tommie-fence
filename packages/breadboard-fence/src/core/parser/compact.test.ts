import { describe, expect, test } from 'vitest';
import { parseCompactPart, parseWireSpec } from './compact.ts';

describe('parseCompactPart', () => {
  test('parses the type, both holes and the value of a two lead part', () => {
    const result = parseCompactPart('R1', 'resistor a5 a10 10k', 3);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      id: 'R1',
      type: 'resistor',
      holes: [
        { addr: 'a5', tag: '1' },
        { addr: 'a10', tag: '2' },
      ],
      value: '10k',
      line: 3,
    });
  });

  test('reads uppercase addresses as holes, the same as lowercase', () => {
    const result = parseCompactPart('R1', 'resistor A5 A10 330', 1);

    expect(result.ok && result.value.holes.map((hole) => hole.addr)).toEqual(['A5', 'A10']);
    expect(result.ok && result.value.value).toBe('330');
  });

  test('a value word shaped like an address is read as a hole, in either case', () => {
    // 小文字の j5 と同じ扱い。番地の形をした語は値やラベルには使えない (syntax.md に明記)。
    const result = parseCompactPart('R1', 'resistor a5 a10 J5', 1);

    expect(result.ok && result.value.holes.map((hole) => hole.addr)).toEqual(['a5', 'a10', 'J5']);
    expect(result.ok && result.value.value).toBeNull();
  });

  test('keeps a polarity tag written in parentheses as the pin name', () => {
    const result = parseCompactPart('D1', 'led b12(A) b13(K) red', 4);

    expect(result.ok && result.value.holes).toEqual([
      { addr: 'b12', tag: 'A' },
      { addr: 'b13', tag: 'K' },
    ]);
    expect(result.ok && result.value.value).toBe('red');
  });

  test('keeps a polarity sign written as a pin name', () => {
    const result = parseCompactPart('C1', 'capacitor b5(-) b12(+) 47uF', 3);

    expect(result.ok && result.value.holes).toEqual([
      { addr: 'b5', tag: '-' },
      { addr: 'b12', tag: '+' },
    ]);
  });

  test('parses the three legs of a transistor with their names', () => {
    const result = parseCompactPart('Q1', 'transistor h9(B) h10(C) h11(E) 2SC1815', 8);

    expect(result.ok && result.value.holes.map((hole) => hole.tag)).toEqual(['B', 'C', 'E']);
    expect(result.ok && result.value.value).toBe('2SC1815');
  });

  test('parses the anchor form used to place a dip package', () => {
    const result = parseCompactPart('U1', 'dip8 @ e5 NJM4556A', 7);

    expect(result.ok && result.value).toMatchObject({
      type: 'dip8',
      holes: [{ addr: 'e5', tag: '1' }],
      label: 'NJM4556A',
    });
  });

  test('reads the off board placement written after the at sign', () => {
    const result = parseCompactPart('AD2', 'device @ top Analog Discovery 2', 9);

    expect(result.ok && result.value).toMatchObject({ at: 'top', label: 'Analog Discovery 2' });
  });

  test('reports an empty specification', () => {
    const result = parseCompactPart('R1', '   ', 2);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({ line: 2 });
  });

  test('reports an anchor form with no hole after the at sign', () => {
    expect(parseCompactPart('U1', 'dip8 @', 5).ok).toBe(false);
  });
  test('splits the look off the type so the drawing can pick a shape', () => {
    const result = parseCompactPart('C1', 'capacitor/ceramic a5 a10 0.1u', 3);

    expect(result.ok && result.value).toMatchObject({ type: 'capacitor', variant: 'ceramic', value: '0.1u' });
  });

  test('leaves the look unset when the type does not name one', () => {
    const result = parseCompactPart('C1', 'capacitor a5 a10 0.1u', 3);

    expect(result.ok && result.value.variant).toBeNull();
  });

});

describe('parseWireSpec', () => {
  test('parses both endpoints and the colour', () => {
    const result = parseWireSpec('a10 -- b12 red', 11);

    expect(result.ok && result.value).toEqual([{ from: 'a10', to: 'b12', color: 'red', hints: [], line: 11 }]);
  });

  test('leaves the colour unset when the wire does not name one', () => {
    const result = parseWireSpec('a10 -- b12', 11);

    expect(result.ok && result.value[0]?.color).toBeNull();
  });

  test('accepts a part pin reference as an endpoint', () => {
    const result = parseWireSpec('U1.7 -- +t14 red', 12);

    expect(result.ok && result.value[0]).toMatchObject({ from: 'U1.7', to: '+t14' });
  });

  test('reads a routing hint written after the colour', () => {
    const result = parseWireSpec('j20 -- -b20 black [v-20]', 14);

    expect(result.ok && result.value[0]).toMatchObject({
      from: 'j20',
      to: '-b20',
      color: 'black',
      hints: [{ axis: 'v', delta: -20 }],
    });
  });

  test('reads several hints separated by commas or spaces', () => {
    const commas = parseWireSpec('a1 -- b5 [v-20, h30]', 1);
    const spaces = parseWireSpec('a1 -- b5 [v-20 h30]', 1);

    const expected = [{ axis: 'v', delta: -20 }, { axis: 'h', delta: 30 }];
    expect(commas.ok && commas.value[0]?.hints).toEqual(expected);
    expect(spaces.ok && spaces.value[0]?.hints).toEqual(expected);
  });

  test('leaves the hints empty when the wire has none', () => {
    const result = parseWireSpec('a10 -- b12 red', 1);

    expect(result.ok && result.value[0]?.hints).toEqual([]);
  });

  test('reports a hint that is not a move along an axis', () => {
    const result = parseWireSpec('a1 -- b5 [diagonal]', 9);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.line).toBe(9);
  });

  test('reports a hint whose distance is beyond the board', () => {
    expect(parseWireSpec(`a1 -- b5 [v-${'9'.repeat(400)}]`, 3).ok).toBe(false);
    expect(parseWireSpec('a1 -- b5 [v-100000]', 3).ok).toBe(false);
  });

  test('reports a wire that is missing the double dash', () => {
    const result = parseWireSpec('a10 b12', 11);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.line).toBe(11);
  });

  test('opens a chain of endpoints into one segment per neighbouring pair', () => {
    const result = parseWireSpec('+t5 -- a5 -- a10 red', 11);

    // 1 行が 1 本の信号の道として読める。中間のモデルから先は 2 点の配線しか見ない。
    expect(result.ok && result.value).toEqual([
      { from: '+t5', to: 'a5', color: 'red', hints: [], line: 11 },
      { from: 'a5', to: 'a10', color: 'red', hints: [], line: 11 },
    ]);
  });

  test('keeps the line number of the written line on every segment', () => {
    const result = parseWireSpec('a1 -- b2 -- c3 -- d4', 7);

    expect(result.ok && result.value.map((wire) => wire.line)).toEqual([7, 7, 7]);
  });

  test('reports a routing hint on a chain, since the segment it means is not decided', () => {
    expect(parseWireSpec('a1 -- b2 -- c3 [v-20]', 11).ok).toBe(false);
    expect(parseWireSpec('a1 -- b2 [v-20]', 11).ok).toBe(true);
  });

  test('reports a chain that ends on a separator', () => {
    expect(parseWireSpec('a1 -- b2 --', 11).ok).toBe(false);
    expect(parseWireSpec('-- a1', 11).ok).toBe(false);
  });
});

describe('向きの語 (アンカー 1 つで置く形)', () => {
  const part = (spec: string) => parseCompactPart('U1', spec, 3);

  test('reads the word that sits right after the anchor, keeping the label', () => {
    const result = part('dip8 @ e5 r180 NJM4556A');

    expect(result.ok && result.value.turn).toEqual({ rotate: 180, mirror: false });
    expect(result.ok && result.value.label).toBe('NJM4556A');
  });

  test('reads it without the @ too, since the anchor can be written bare', () => {
    expect(part('dip8 e5 r180').ok && parseCompactPart('U1', 'dip8 e5 r180', 3)).toBeTruthy();
    const result = part('dip8 e5 r180');

    expect(result.ok && result.value.turn.rotate).toBe(180);
    expect(result.ok && result.value.holes.map((hole) => hole.addr)).toEqual(['e5']);
  });

  test('leaves a part with no word exactly as it was', () => {
    const result = part('dip8 @ e5 NJM4556A');

    expect(result.ok && result.value.turn).toEqual({ rotate: 0, mirror: false });
    expect(result.ok && result.value.label).toBe('NJM4556A');
  });

  test('refuses a quarter turn, saying it is the ravine that forbids it', () => {
    // 2 列は e 行と f 行に固定されている。90 度回すと同じ列に重なって挿せない。
    const result = part('dip8 @ e5 r90');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('溝をまたぐ');
  });

  test('refuses a quarter turn on a single row too, naming the short it would make', () => {
    const result = parseCompactPart('J1', 'sip4 @ a20 r270', 3);

    expect(!result.ok && result.error.message).toContain('同じ 5 穴');
  });

  test('refuses mirror, since the anchor row already says which side pin 1 is on', () => {
    // 語を足すと `dip8 @ e5 mirror` と `dip8 @ f5` が同じ置き方の 2 通りになる。
    const result = part('dip8 @ e5 mirror');

    expect(!result.ok && result.error.message).toContain('反対の行');
  });

  test('refuses a word on a part whose holes already say the direction', () => {
    const result = parseCompactPart('R1', 'resistor a5 a10 r180', 3);

    expect(!result.ok && result.error.message).toContain('穴の順そのもの');
  });

  test('refuses the same word twice, rather than letting the last one win', () => {
    expect(part('dip8 @ e5 r180 r180').ok).toBe(false);
  });

  test('refuses a word on an off board device, which is not in the board at all', () => {
    const result = parseCompactPart('X1', 'device @ top r180', 3);

    expect(!result.ok && result.error.message).toContain('板に挿していない');
  });
});

describe('向きを書けない形の断り文', () => {
  test('names the symmetry when the part is placed by an anchor but turns into itself', () => {
    // 「穴の順そのもの」では嘘になる — スイッチはアンカー 1 つで置く形。
    const result = parseCompactPart('SW1', 'button @ e5 r180', 3);

    expect(!result.ok && result.error.message).toContain('対称');
  });
});
