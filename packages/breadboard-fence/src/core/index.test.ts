import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { DEFAULT_LED_COLOR, DEFAULT_WIRE_COLOR } from './render/palette.ts';

const led = `board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
  - c13 -- -t13 black
`;

describe('renderBreadboard', () => {
  test('renders the led example as a standalone svg', () => {
    const { svg, errors } = renderBreadboard(led);

    expect(errors).toEqual([]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  test('derives the three nets of the led example from the holes and wires', () => {
    const { netlist } = renderBreadboard(led);

    expect(netlist.map((net) => ({ name: net.name, refs: net.refs }))).toEqual([
      { name: '+t', refs: ['R1.1'] },
      { name: 'N1', refs: ['R1.2', 'D1.A'] },
      { name: '-t', refs: ['D1.K'] },
    ]);
  });

  test('joins a part pin and a hole that the same wire touches', () => {
    const { netlist } = renderBreadboard(
      ['parts:', '  U1: dip8 @ e5 NJM4556A', '  R1: resistor a1 a2', 'wires:', '  - U1.1 -- a1'].join('\n'),
    );

    const joined = netlist.find((net) => net.refs.includes('U1.1'));
    expect(joined?.refs).toContain('R1.1');
  });

  test('places an off board device and wires it to the board', () => {
    const { svg, errors } = renderBreadboard(
      [
        'parts:',
        '  AD2:',
        '    type: device',
        '    at: top',
        '    label: Analog Discovery 2',
        '    pins: [W1, GND]',
        'wires:',
        '  - AD2.W1 -- a5 yellow',
        '  - AD2.GND -- -t5 black',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(svg).toContain('Analog Discovery 2');
  });

  test('resolves a device pin whose name carries a plus or minus sign', () => {
    const { netlist, errors } = renderBreadboard(
      [
        'parts:',
        '  AD2:',
        '    type: device',
        '    at: top',
        '    pins: [V+, V-, 1+]',
        'wires:',
        '  - AD2.V+ -- +t2 red',
        '  - AD2.1+ -- a5 orange',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.name === '+t')?.refs).toEqual(['AD2.V+']);
  });

  test('draws every part type the grammar knows', () => {
    const { svg, errors } = renderBreadboard(
      [
        'parts:',
        '  R1: resistor a1 a4 10k',
        '  C1: capacitor b6 b9 1uF',
        '  D1: led c11(K) c12(A) green',
        '  Q1: transistor j20(B) j21(C) j22(E) 2SC1815',
        '  U1: dip14 @ f1 LM324',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(svg).toContain('10k');
    expect(svg).toContain('1uF');
    expect(svg).toContain('LM324');
    expect(svg).toContain('2SC1815');
    // 抵抗のカラーコード (茶黒橙) が値から出ていること。
    expect(svg).toContain('#6b4423');
  });

  test('prints the leg names next to a transistor so it can be inserted the right way round', () => {
    const { svg } = renderBreadboard('parts:\n  Q1: transistor h9(B) h10(C) h11(E) 2SC1815\n');

    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
    for (const leg of ['B', 'C', 'E']) {
      expect(texts).toContain(leg);
    }
  });

  test('marks the negative end of a capacitor that is given a polarity', () => {
    const polarised = renderBreadboard('parts:\n  C1: capacitor b5(-) b12(+) 47uF\n');
    const plain = renderBreadboard('parts:\n  C1: capacitor b5 b12 47uF\n');

    expect(polarised.errors).toEqual([]);
    expect(polarised.svg).not.toBe(plain.svg);
    expect(polarised.svg).toContain('−');
  });

  test('lets a wire refer to a pin named after its polarity', () => {
    const { netlist, errors } = renderBreadboard(
      ['parts:', '  C1: capacitor b5(-) b12(+) 47uF', 'wires:', '  - C1.+ -- -t12 black'].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.name === '-t')?.refs).toContain('C1.+');
  });

  test('reports the parse error and still returns a drawable error card', () => {
    const { svg, errors } = renderBreadboard('parts:\n  R1: [unclosed\n');

    expect(errors.length).toBeGreaterThan(0);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
  });

  test('reports a wire endpoint that names a part pin which does not exist', () => {
    const { errors } = renderBreadboard('wires:\n  - U9.1 -- a5\n');

    expect(errors[0]?.message).toContain('U9.1');
    expect(errors[0]?.line).toBe(2);
  });

  test('draws the board even when one wire is broken so the rest stays readable', () => {
    const { svg, errors } = renderBreadboard(
      ['parts:', '  R1: resistor a5 a10 330', 'wires:', '  - a5 -- nowhere'].join('\n'),
    );

    expect(errors).toHaveLength(1);
    expect(svg).toContain('<svg');
  });

  test('escapes markup that a label smuggles into the drawing', () => {
    const { svg } = renderBreadboard('parts:\n  U1: dip8 @ e5 </svg><script>alert(1)</script>\n');

    expect(svg).not.toContain('<script>');
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
  });

  test('ignores a wire colour that is not a known name instead of writing it into the markup', () => {
    const { svg, errors } = renderBreadboard(
      ['parts:', '  R1: resistor a5 a10', 'wires:', '  - a5 -- b5 red";onload=alert(1)'].join('\n'),
    );

    expect(errors).toHaveLength(1);
    expect(svg).not.toContain('onload');
  });

  test('keeps a part caption off the column numbers printed along the edges', () => {
    const { svg } = renderBreadboard('parts:\n  R1: resistor a5 a10 330\n  R2: resistor j5 j10 330\n');

    const captions = [...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>(R\d 330)<\/text>/g)];
    const rowA = Number([...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>a<\/text>/g)][0]?.[1]);
    const rowJ = Number([...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>j<\/text>/g)][0]?.[1]);

    expect(captions).toHaveLength(2);
    // 上ブロックの部品は下へ、下ブロックの部品は上へ、どちらも溝側に逃がす。
    expect(Number(captions[0]?.[1])).toBeGreaterThan(rowA);
    expect(Number(captions[1]?.[1])).toBeLessThan(rowJ);
  });

  test('treats a colour name inherited from Object.prototype as unknown', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      const { svg, errors } = renderBreadboard(
        ['parts:', '  R1: resistor a5 a10', 'wires:', `  - a5 -- b5 ${name}`].join('\n'),
      );

      expect(errors).toHaveLength(1);
      expect(svg).toContain(`stroke="${DEFAULT_WIRE_COLOR}"`);
      expect(svg).not.toContain('native code');
    }
  });

  test('falls back to the default colour when an led names one it does not know', () => {
    const { svg } = renderBreadboard('parts:\n  D1: led a1(A) a2(K) toString\n');

    expect(svg).toContain(DEFAULT_LED_COLOR);
    expect(svg).not.toContain('native code');
  });

  test('turns the cathode bar with the part when an led straddles the ravine', () => {
    const { svg, errors } = renderBreadboard('parts:\n  D1: led e12(A) f12(K) red\n');

    expect(errors).toEqual([]);
    // 縦向きの LED なので、本体は 90 度回した入れ物の中に置かれる。
    expect(svg).toMatch(/<g transform="translate\([^"]*\) rotate\(90\)">/);
  });

  test('keeps the drawing self contained so it can be inlined anywhere', () => {
    const { svg } = renderBreadboard(led);

    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('href');
    expect(svg).not.toContain('url(');
    // 外に取りに行く URL は無く、名前空間の宣言だけが残る。
    expect(svg.match(/https?:\/\/\S+/g)).toEqual(['http://www.w3.org/2000/svg"']);
  });

  test('does not throw for text that has nothing to do with the grammar', () => {
    for (const source of ['', '   ', 'hello', '- - -', '{{{', 'board: half\nparts: 3']) {
      expect(() => renderBreadboard(source)).not.toThrow();
    }
  });
});
