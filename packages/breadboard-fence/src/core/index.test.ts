import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { textWidth } from './render/textFit.ts';
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

/** 図の中の 1 つのキャプションを x・字の大きさ・中身に割る。 */
const caption = (svg: string, prefix: string): RegExpMatchArray | undefined =>
  [...svg.matchAll(/<text[^>]*x="([\d.-]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .find((match) => (match[3] ?? '').startsWith(prefix));

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

  test('draws a ceramic capacitor as a different shape from the film one', () => {
    const ceramic = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/ceramic b5 b12 0.1u\n');
    const film = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/film b5 b12 0.1u\n');

    expect(ceramic.errors).toEqual([]);
    expect(film.errors).toEqual([]);
    expect(ceramic.svg).not.toBe(film.svg);
  });

  test('draws a capacitor with no look written the way it always was', () => {
    // 既に書かれた図の見え方は変えない。省略時はピン名だけで箱と缶を選び分ける。
    const box = 'parts-list: none\nparts:\n  C1: capacitor b5 b12 1uF\n';
    const can = 'parts-list: none\nparts:\n  C1: capacitor b5(+) b12(-) 47uF\n';

    expect(renderBreadboard(box).svg).toBe(
      renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/film b5 b12 1uF\n').svg,
    );
    expect(renderBreadboard(can).svg).toBe(
      renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/electrolytic b5(+) b12(-) 47uF\n').svg,
    );
  });

  test('lists the chosen look beside the type under the drawing', () => {
    const { svg } = renderBreadboard('parts:\n  C1: capacitor/ceramic b5 b12 0.1u\n');
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

    expect(texts).toContain('capacitor/ceramic');
  });

  test('reports a look that the part cannot be drawn as', () => {
    const { errors } = renderBreadboard('parts:\n  C1: capacitor/mica b5 b12 47uF\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
  });

  test('draws the 5mm led as it always was and the 3mm one smaller', () => {
    const plain = renderBreadboard('parts-list: none\nparts:\n  D1: led b5(A) b8(K) red\n');
    const five = renderBreadboard('parts-list: none\nparts:\n  D1: led/5mm b5(A) b8(K) red\n');
    const three = renderBreadboard('parts-list: none\nparts:\n  D1: led/3mm b5(A) b8(K) red\n');

    expect(three.errors).toEqual([]);
    expect(five.svg).toBe(plain.svg);
    expect(three.svg).not.toBe(plain.svg);
  });

  test('draws the to92 transistor as it always was and the to220 differently', () => {
    const legs = 'h9(B) h10(C) h11(E) 2SC1815';
    const plain = renderBreadboard(`parts-list: none\nparts:\n  Q1: transistor ${legs}\n`);
    const to92 = renderBreadboard(`parts-list: none\nparts:\n  Q1: transistor/to92 ${legs}\n`);
    const to220 = renderBreadboard(`parts-list: none\nparts:\n  Q1: transistor/to220 ${legs}\n`);

    expect(to220.errors).toEqual([]);
    expect(to92.svg).toBe(plain.svg);
    expect(to220.svg).not.toBe(plain.svg);
  });

  test('marks the plus side of a tantalum, not the minus side like an electrolytic', () => {
    // 電解はマイナス側に帯、タンタルはプラス側に印。逆に読むと部品を壊す。
    const tantalum = renderBreadboard('parts:\n  C1: capacitor/tantalum b5(+) b8(-) 10u\n');
    const electrolytic = renderBreadboard('parts:\n  C1: capacitor/electrolytic b5(+) b8(-) 10u\n');
    const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

    expect(tantalum.errors).toEqual([]);
    expect(texts(tantalum.svg)).toContain('+');
    expect(texts(electrolytic.svg)).toContain('\u2212');
  });

  test('puts the electrolytic band on the lead left unmarked', () => {
    // `(+)` だけを書いても、2 本足なら反対側が - と決まる。
    const left = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/electrolytic b5 b8(+) 10u\n');
    const right = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/electrolytic b5(+) b8 10u\n');

    expect(left.errors).toEqual([]);
    expect(right.errors).toEqual([]);
    expect(left.svg).not.toBe(right.svg);
  });

  test('reads an electrolytic written without polarity as plus on the first hole', () => {
    const bare = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/electrolytic b5 b8 10u\n');
    const marked = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/electrolytic b5(+) b8(-) 10u\n');

    expect(bare.errors).toEqual([]);
    expect(bare.svg).toBe(marked.svg);
  });

  test('marks a tantalum written without polarity on the first hole, not the second', () => {
    // 電解の帯とタンタルの印は逆側に付く。既定を「常に 2 本目」にすると、
    // 印を書かなかったタンタルだけ向きが逆になる。
    const bare = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/tantalum b5 b8 10u\n');
    const marked = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/tantalum b5(+) b8(-) 10u\n');

    expect(bare.errors).toEqual([]);
    expect(bare.svg).toBe(marked.svg);
  });

  test('folds a shorthand into the full type name before anything else sees it', () => {
    const short = renderBreadboard('parts:\n  R1: r a5 a10 10k\n');
    const full = renderBreadboard('parts:\n  R1: resistor a5 a10 10k\n');

    expect(short.errors).toEqual([]);
    // 図も部品リストも正式名で出るので、略記で書いてもバイト単位で同じになる。
    expect(short.svg).toBe(full.svg);
  });

  test('opens the shorthand that carries a look into both halves', () => {
    const short = renderBreadboard('parts-list: none\nparts:\n  C1: ec b5(+) b8(-) 100u\n');
    const full = renderBreadboard('parts-list: none\nparts:\n  C1: capacitor/electrolytic b5(+) b8(-) 100u\n');

    expect(short.errors).toEqual([]);
    expect(short.svg).toBe(full.svg);
  });

  test('reports a look written after a shorthand that already carries one', () => {
    const { errors } = renderBreadboard('parts:\n  C1: ec/tantalum b5(+) b8(-) 100u\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('capacitor/electrolytic');
  });

  test('still draws the button under the name published in 0.2.0', () => {
    const old = renderBreadboard('parts:\n  SW1: pushbutton @ e5\n');
    const now = renderBreadboard('parts:\n  SW1: button @ e5\n');

    expect(old.errors).toEqual([]);
    expect(old.svg).toBe(now.svg);
  });

  test('draws every part type the grammar knows', () => {
    const twoLead = [
      'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
      'zener', 'schottky', 'photodiode', 'varicap', 'diac', 'reed', 'fuse', 'lamp',
    ];

    for (const [index, type] of twoLead.entries()) {
      const { svg, errors } = renderBreadboard(`parts:\n  X${index}: ${type} a5 a8\n`);

      expect(errors, type).toEqual([]);
      expect(svg, type).toContain('<svg');
    }
  });

  test('draws the thyristor and the triac on three legs, in either package', () => {
    for (const type of ['thyristor', 'triac']) {
      const to92 = renderBreadboard(`parts:\n  Q1: ${type} a5(A) a6(G) a7(K)\n`);
      const to220 = renderBreadboard(`parts:\n  Q1: ${type}/to220 a5(A) a6(G) a7(K)\n`);

      expect(to92.errors, type).toEqual([]);
      expect(to220.errors, type).toEqual([]);
      expect(to220.svg, type).not.toBe(to92.svg);
    }
  });

  test('offers the nearest name when a type is misspelled', () => {
    const { errors } = renderBreadboard('parts:\n  R1: resistr a5 a10 10k\n');

    expect(errors[0]?.message).toContain('resistor のことですか');
  });

  test('lets a wire refer to a pin named after its polarity', () => {
    const { netlist, errors } = renderBreadboard(
      ['parts:', '  C1: capacitor b5(-) b12(+) 47uF', 'wires:', '  - C1.+ -- -t12 black'].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(netlist.find((net) => net.name === '-t')?.refs).toContain('C1.+');
  });

  test('lists the parts under the drawing by default', () => {
    const { svg } = renderBreadboard(led);
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

    expect(texts).toContain('R1');
    expect(texts).toContain('resistor');
    expect(texts).toContain('led');
  });

  test('leaves the parts list out, and the room it took, when the fence turns it off', () => {
    const listed = renderBreadboard(led);
    const bare = renderBreadboard(`parts-list: none\n${led}`);
    const heightOf = (svg: string) => Number(/<svg[^>]*height="([\d.]+)"/.exec(svg)?.[1]);

    expect(bare.errors).toEqual([]);
    expect(bare.svg).not.toContain('>resistor<');
    expect(heightOf(bare.svg)).toBeLessThan(heightOf(listed.svg));
  });

  test('lists only the parts it could place, so a broken one is reported and not listed twice', () => {
    const { svg, errors } = renderBreadboard(
      ['parts:', '  R1: resistor a5 a10 330', '  R2: resistor a99 a100 220'].join('\n'),
    );
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

    expect(errors).toHaveLength(1);
    expect(texts).toContain('R1');
    expect(texts).not.toContain('R2');
  });

  test('names an off board device in the list by the same label its box carries', () => {
    const { svg, errors } = renderBreadboard(
      [
        'parts:',
        '  AD2:',
        '    type: device',
        '    at: top',
        '    label: Analog Discovery 2',
        '    value: 波形発生器',
        '    pins: [W1, GND]',
      ].join('\n'),
    );
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

    // 機器の箱と部品リストの 2 か所に、同じ名前で出る。
    expect(texts.filter((text) => text === 'Analog Discovery 2')).toHaveLength(2);
    // value は機器のどこにも出ない。出ないものを黙って捨てず、帯で理由を言う。
    expect(texts).not.toContain('波形発生器');
    expect(errors.map((error) => error.message)).toEqual([
      expect.stringContaining('value'),
    ]);
  });

  test('cuts a caption that would run off the canvas, and marks where it cut', () => {
    const value = 'あ'.repeat(60);
    const { svg } = renderBreadboard(`parts:\n  R1: resistor a25 a30 ${value}\n`);
    const width = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)?.[1]);
    const [, x = '', size = '', text = ''] = caption(svg, 'R1 ') ?? [];
    // キャプションは部品の中心に置くので、使えるのは近いほうの端までの倍。
    const room = Math.min(Number(x), width - Number(x)) * 2;

    expect(text.endsWith('…')).toBe(true);
    expect(textWidth(text) * Number(size)).toBeLessThanOrEqual(room);
    // 切っていることそのもの: 値の 60 文字がそのまま出ていたら板の 1.2 倍になる。
    expect([...text].length).toBeLessThan([...value].length);
  });

  test('cuts a board caption that hangs off the left edge the same way', () => {
    const { svg } = renderBreadboard(`parts:\n  MCU: pico2 @ h5 ${'あ'.repeat(60)}\n`);
    const [, x = '', size = '', text = ''] = caption(svg, 'MCU ') ?? [];

    // Pico のラベルは基板の左に右揃えで置くので、伸びるのは左だけ。
    expect(text.endsWith('…')).toBe(true);
    expect(textWidth(text) * Number(size)).toBeLessThanOrEqual(Number(x));
  });

  test('keeps the error banner under the parts list so the drawing reads top to bottom', () => {
    const { svg } = renderBreadboard(
      ['parts:', '  R1: resistor a5 a10 330', 'wires:', '  - a5 -- nowhere'].join('\n'),
    );
    const texts = [...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((match) => ({
      y: Number(match[1]),
      text: match[2] ?? '',
    }));

    const listed = texts.find((item) => item.text === 'resistor');
    const banner = texts.find((item) => item.text.includes('行目'));
    expect(listed).toBeDefined();
    expect(Number(banner?.y)).toBeGreaterThan(Number(listed?.y));
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

  test('joins the two legs on the same side of a pushbutton into one net', () => {
    const { netlist, errors } = renderBreadboard(
      ['parts:', '  SW1: pushbutton @ e5', '  R1: resistor a5 a1', '  R2: resistor a7 a2'].join('\n'),
    );

    expect(errors).toEqual([]);
    // 押していなくてもつながっている足なので、e5 と e7 は同じネットに落ちる。
    const net = netlist.find((item) => item.refs.includes('SW1.1a'));
    expect(net?.refs).toEqual(expect.arrayContaining(['SW1.1b', 'R1.1', 'R2.1']));
    // 溝の向こう側は別のまま (押したときだけつながるので、図には出さない)。
    expect(net?.refs).not.toContain('SW1.2a');
  });

  test('wires to a board pin by the name printed on the pinout', () => {
    const { svg, netlist, errors } = renderBreadboard(
      [
        'board: full',
        'parts:',
        '  MCU: pico2 @ h5',
        '  R1: resistor a10 a15 330',
        'wires:',
        '  - MCU.GP1 -- a10 orange',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
    expect(svg).toContain('GP1');
    expect(netlist.find((net) => net.refs.includes('MCU.GP1'))?.refs).toContain('R1.1');
  });

  test('suggests the pins that start with the same letters when a reference misses', () => {
    const { errors } = renderBreadboard(
      ['board: full', 'parts:', '  MCU: pico @ h5', 'wires:', '  - MCU.GND -- a10'].join('\n'),
    );

    // GND は 7 本あるのでピン番号つきの名前になっている。どれを指すか案内する。
    expect(errors[0]?.message).toContain('GND3');
  });

  test('draws every part it knows, not just the ones it can place', () => {
    const ids = ['R1', 'C1', 'D2', 'L1', 'X1', 'BZ1', 'Q1', 'VR1', 'SW2', 'SW1', 'U1', 'M1', 'D1'];
    const { svg, errors } = renderBreadboard(
      [
        'board: full',
        'parts-list: none',
        'parts:',
        '  R1: resistor a1 a3 330',
        '  C1: capacitor a5 a7 100n',
        '  D2: diode a9(A) a11(K) 1N4148',
        '  L1: inductor a13 a15 100u',
        '  X1: crystal a17 a19 16MHz',
        '  BZ1: buzzer a21(+) a23(-)',
        '  Q1: transistor c25(B) c26(C) c27(E) 2SC1815',
        '  VR1: potentiometer c29 c30 c31 10k',
        '  SW2: slide-switch c33 c34 c35',
        '  SW1: pushbutton @ e37',
        '  U1: dip8 @ e41 NJM4556A',
        '  M1: sip4 @ a45 OLED',
        '  D1: led g1(A) g2(K) red',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
    // 部品リストを消してあるので、ID が図に出ていれば本体が描かれている。
    for (const id of ids) expect(svg).toContain(`>${id}`);
  });

  test('does not throw for text that has nothing to do with the grammar', () => {
    for (const source of ['', '   ', 'hello', '- - -', '{{{', 'board: half\nparts: 3']) {
      expect(() => renderBreadboard(source)).not.toThrow();
    }
  });
});
