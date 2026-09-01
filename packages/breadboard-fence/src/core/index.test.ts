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

  test('takes the anode mark as fixing the cathode on the other lead', () => {
    // 2 本足なので、片方に印があれば反対側は決まる。片方だけ見て決めていると、
    // 反対側だけを書いた図 (`diode a5 a10(A)`) が逆向きに描かれる。
    const marked = renderBreadboard('parts-list: none\nparts:\n  D1: diode a5 a10(A) 1N4148\n');
    const both = renderBreadboard('parts-list: none\nparts:\n  D1: diode a5(K) a10(A) 1N4148\n');
    const bare = renderBreadboard('parts-list: none\nparts:\n  D1: diode a5 a10 1N4148\n');

    expect(marked.errors).toEqual([]);
    expect(marked.svg).toBe(both.svg);
    expect(marked.svg).not.toBe(bare.svg);
  });

  test('turns the flat face of a led the same way', () => {
    const marked = renderBreadboard('parts-list: none\nparts:\n  D1: led a5 a10(A) red\n');
    const both = renderBreadboard('parts-list: none\nparts:\n  D1: led a5(K) a10(A) red\n');

    expect(marked.svg).toBe(both.svg);
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

  test('draws every kind of note without complaining', () => {
    const { svg, errors } = renderBreadboard([
      'parts:',
      '  R1: resistor a5 a10 330',
      'notes:',
      '  - circle R1',
      '  - box c3 e12 blue solid',
      '  - arrow c20 R1 green',
      '  - line +t1 +t30 orange',
      '  - text d20 large bold: ここで分圧する',
      '  - source g3 tiny tight',
      '',
    ].join('\n'));

    expect(errors).toEqual([]);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('ここで分圧する');
    // source はフェンスそのものを囲みつきで書き出す。
    expect(svg).toContain('```breadboard');
    expect(svg).toContain('R1: resistor a5 a10 330');
  });

  test('puts a source with no address in a band under the drawing', () => {
    // 板の番地はどれも実在の穴に縛られているので、板の外を指す番地が存在しない。
    // 板の上に重ねると穴と印字に重なるので、場所の語を書いたものは帯へ流す。
    const outside = renderBreadboard('parts:\n  R1: resistor a5 a10 330\nnotes:\n  - source tiny\n');
    const bare = renderBreadboard('parts:\n  R1: resistor a5 a10 330\n');
    const heightOf = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);

    expect(outside.errors).toEqual([]);
    expect(outside.svg).toContain('```breadboard');
    // 帯のぶんだけ高くなり、板そのものの高さは変わらない。
    expect(heightOf(outside.svg)).toBeGreaterThan(heightOf(bare.svg) ?? 0);
  });

  test('places text under the drawing when no address is written', () => {
    const { svg, errors } = renderBreadboard(
      'parts:\n  R1: resistor a5 a10 330\nnotes:\n  - text: 仮組み\n',
    );

    expect(errors).toEqual([]);
    expect(svg).toContain('仮組み');
  });

  test('draws the same thing whether below is written out or left off', () => {
    // `source` はフェンス自身を書き出すので、行が違えば図も違う。字で比べる。
    const bare = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - text tiny: ひとこと\n');
    const spelt = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - text below tiny: ひとこと\n');

    expect(spelt.errors).toEqual([]);
    expect(spelt.svg).toBe(bare.svg);
  });

  test('still lets a source sit on the board when an address is written', () => {
    const placed = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - source j3 tiny\n');
    const outside = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - source tiny\n');

    expect(placed.errors).toEqual([]);
    expect(placed.svg).not.toBe(outside.svg);
  });

  test('refuses a point named after the place word', () => {
    const { errors } = renderBreadboard('points:\n  below: a5\nparts:\n  R1: resistor a5 a10\n');

    expect(errors[0]?.message).toContain('場所の語');
  });

  test('keeps notes out of the circuit', () => {
    const bare = renderBreadboard('parts:\n  R1: resistor a5 a10 330\n');
    const noted = renderBreadboard(
      'parts:\n  R1: resistor a5 a10 330\nnotes:\n  - circle R1\n  - text d20: ここ\n',
    );

    // 注釈は印と字であって、板に挿すものではない。ネットにも部品リストにも入らない。
    expect(noted.netlist).toEqual(bare.netlist);
    expect(noted.svg).toContain('<ellipse');
  });

  test('reports a note pointing at nothing, and keeps drawing the rest', () => {
    const { svg, errors } = renderBreadboard(
      'parts:\n  R1: resistor a5 a10 330\nnotes:\n  - circle R9\n  - circle R1\n',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
    expect(svg).toContain('<ellipse');
  });

  test('reports a rail address used on a board that has no rails', () => {
    // 列は板の中なので「ボードの外」では直す手がかりにならない。レールが無いことを言う。
    const { errors } = renderBreadboard('board: mini\nwires:\n  - +t5 -- a5\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('レール');
  });

  test('draws a mini board with rails when the fence asks for them', () => {
    const { svg, errors } = renderBreadboard(
      'board:\n  size: mini\n  rails: "+--+"\nwires:\n  - +t5 -- a5\n',
    );

    expect(errors).toEqual([]);
    expect(svg).not.toBe('');
  });

  test('reports a note pointing outside the board', () => {
    const { errors } = renderBreadboard('parts:\n  R1: resistor a5 a10 330\nnotes:\n  - circle a99\n');

    expect(errors[0]?.message).toContain('ボードの外');
  });

  test('keeps an arrow pointing at its target even when the two rings overlap', () => {
    // 隣の行の部品どうしは中心間 20px で、囲みは上下 11px ずつ。
    // 両端を別々に引っ込めると始点が終点を追い越し、矢じりが逆を向く。
    const { svg } = renderBreadboard(
      'parts:\n  R1: resistor a5 a10\n  R2: resistor b5 b10\nnotes:\n  - arrow R1 R2\n',
    );
    const line = /<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"[^>]*stroke="#e5534b"/.exec(svg);

    // R2 は R1 より下の行なので、終点のほうが下に来る。
    expect(Number(line?.[2])).toBeGreaterThan(Number(line?.[1]));
    expect(svg).toContain('<polygon');
  });

  test('still draws an arrowhead when the target hole sits under the part', () => {
    // 部品の囲みの中にある穴を指すと、両端が同じ点に落ちて矢じりが消えていた。
    const { svg } = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - arrow R1 a5\n');

    expect(svg).toContain('<polygon');
  });

  test('reports a point whose value is not a hole where it was written', () => {
    // 置き換えてから報告すると、行のどこにも無い綴りを名指すことになる。
    const { errors } = renderBreadboard('points:\n  vin: hello\nparts:\n  R1: resistor vin a5\n');

    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.text).toContain('hello');
    expect(errors[0]?.at).toBeDefined();
  });

  test('shows a japanese spelling in the message instead of calling it punctuation', () => {
    const { errors } = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - circle 抵抗\n');

    expect(errors[0]?.message).toContain('抵抗');
  });

  test('runs the line of a note to the hole itself, not short of it', () => {
    // 穴は目的地そのものなので、手前で止めるとどの穴か分からなくなる。
    // レール 2 本のように近い 2 点を結ぶと、止めた線は消えてしまう。
    const { svg } = renderBreadboard('parts:\n  R1: resistor a5 a10 330\nnotes:\n  - line +t22 -t22\n');
    const line = /<line[^>]*stroke="#e5534b"[^>]*\/>/.exec(svg)?.[0] ?? '';
    const y1 = Number(/y1="([\d.]+)"/.exec(line)?.[1]);
    const y2 = Number(/y2="([\d.]+)"/.exec(line)?.[1]);

    expect(Math.abs(y2 - y1)).toBeGreaterThan(10);
  });

  test('puts the title above the drawing and makes the sheet taller', () => {
    const bare = renderBreadboard('parts-list: none\nparts:\n  R1: resistor a5 a10 330\n');
    const titled = renderBreadboard('title: 図01 分圧\nparts-list: none\nparts:\n  R1: resistor a5 a10 330\n');
    const heightOf = (svg: string) => Number(/height="([\d.]+)"/.exec(svg)?.[1]);

    expect(titled.errors).toEqual([]);
    expect(titled.svg).toContain('図01 分圧');
    expect(heightOf(titled.svg)).toBeGreaterThan(heightOf(bare.svg) ?? 0);
  });

  test('grows the sheet so a long source note is not cut off at the bottom', () => {
    // 板の下の行に置いた source は、フェンス全体を書き出すので板からはみ出す。
    // 切らずに画布のほうを伸ばす (切ると書き写せなくなり、この注釈の値打ちが消える)。
    const parts = Array.from({ length: 10 }, (_, index) => `  R${index}: resistor a${index + 1} c${index + 1} 330`);
    const long = ['parts:', ...parts, 'notes:', '  - source j3', ''].join('\n');
    const short = ['parts:', ...parts, ''].join('\n');
    const heightOf = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);

    expect(heightOf(renderBreadboard(long).svg)).toBeGreaterThan(heightOf(renderBreadboard(short).svg) ?? 0);
  });

  test('says how to quote a title that is only digits', () => {
    const { errors } = renderBreadboard('title: 555\nparts:\n  R1: resistor a5 a10\n');

    expect(errors[0]?.message).toContain('囲みます');
  });

  test('says how to quote a note whose text is only digits', () => {
    // `- text a5: 100` は YAML が数値にするので字として届かない。
    // 「形で書きます」だけだと、囲めば直ることに気づけない。
    const { errors } = renderBreadboard('parts:\n  R1: resistor a5 a10\nnotes:\n  - text a5: 100\n');

    expect(errors[0]?.message).toContain('囲みます');
  });

  test('reports a note written in a shape it cannot read', () => {
    const { errors } = renderBreadboard('parts:\n  R1: resistor a5 a10 330\nnotes:\n  - circle R1 crimson\n');

    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('crimson');
  });

  test('lets a name stand in for a hole everywhere a hole can be written', () => {
    const named = renderBreadboard([
      'points:',
      '  vin: a5',
      '  out: a10',
      'parts:',
      '  R1: resistor vin out 330',
      'wires:',
      '  - +t5 -- vin red',
      'notes:',
      '  - circle out',
      '',
    ].join('\n'));
    const plain = renderBreadboard([
      'parts:',
      '  R1: resistor a5 a10 330',
      'wires:',
      '  - +t5 -- a5 red',
      'notes:',
      '  - circle a10',
      '',
    ].join('\n'));

    expect(named.errors).toEqual([]);
    expect(named.svg).toBe(plain.svg);
  });

  test('puts a point name into the netlist so the circuit can be matched by name', () => {
    const { netlist } = renderBreadboard(
      'points:\n  fb: a10\nparts:\n  R1: resistor a5 a10 330\n  R2: resistor a10 a14 1k\n',
    );

    expect(netlist.map((net) => net.name)).toContain('fb');
  });

  test('keeps the rail name when a point sits on a rail net', () => {
    // レールの名前は極性そのものなので、点の名前より先に立てる。
    const { netlist } = renderBreadboard(
      'points:\n  vcc: a5\nparts:\n  R1: resistor a5 a10 330\nwires:\n  - +t5 -- b5\n',
    );

    expect(netlist.map((net) => net.name)).toContain('+t');
    expect(netlist.map((net) => net.name)).not.toContain('vcc');
  });

  test('never gives two nets the same name, even when a point is called N1', () => {
    // ネット名が重なると、図と意図した回路の突き合わせがそこで成立しなくなる。
    const { netlist } = renderBreadboard(
      'points:\n  N1: a20\nparts:\n  R1: resistor a5 a10 330\n  R2: resistor a20 a24 1k\n',
    );
    const names = netlist.map((net) => net.name);

    expect(names).toContain('N1');
    expect(new Set(names).size).toBe(names.length);
  });

  test('says when a point name ate the word that was meant as the value', () => {
    // `points: {2N3904: c1}` があると、3 本目の足が離れた c1 に生えて
    // **それ自体は正しく見える別の回路**になる。黙って通してはいけない場所。
    const { errors, notices } = renderBreadboard(
      'points:\n  "2N3904": c1\nparts:\n  Q1: transistor a5 a6 2N3904\n',
    );

    expect(errors).toEqual([]);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.message).toContain('2N3904');
    expect(notices[0]?.message).toContain('穴として読みました');
  });

  test('stays quiet when the holes are simply all written as point names', () => {
    // `points:` の本来の使い方。値の無い抵抗も普通なので、ここで鳴らすと
    // 正しい入力にお知らせが出続ける。
    const bare = renderBreadboard('points:\n  vin: a5\n  gnd: a10\nparts:\n  R1: resistor vin gnd\n');
    const mixed = renderBreadboard('points:\n  vin: a5\nparts:\n  R1: resistor vin a10\n');
    const valued = renderBreadboard('points:\n  vin: a5\nparts:\n  R1: resistor vin a10 10k\n');

    expect(bare.notices).toEqual([]);
    expect(mixed.notices).toEqual([]);
    expect(valued.notices).toEqual([]);
  });

  test('says when a label is written next to a value, since only the value is drawn', () => {
    const line = renderBreadboard('parts:\n  R1: resistor a5 a10 10k l=Load\n');
    const map = renderBreadboard(
      'parts:\n  R1:\n    type: resistor\n    holes: [a5, a10]\n    value: 10k\n    label: Load\n',
    );

    for (const result of [line, map]) {
      expect(result.errors).toEqual([]);
      expect(result.notices).toHaveLength(1);
      expect(result.notices[0]?.message).toContain('図に出るのは値');
      expect(result.svg).not.toContain('Load');
    }
  });

  test('counts the segments of a chained wire against the limit, not the lines', () => {
    // 1 行に端点を並べただけで上限を素通りすると、拡張ホストが止まるほどの
    // 図が 1 枚の Markdown から作れてしまう (実測で 19.6 秒)。
    const chain = Array.from({ length: 2001 }, (_, index) => `a${(index % 60) + 1}`).join(' -- ');
    const { errors } = renderBreadboard(`board: full\nparts:\n  R1: resistor a1 a5\nwires:\n  - ${chain}\n`);

    expect(errors.some((error) => error.message.includes('500 本まで'))).toBe(true);
  });

  test('refuses a point named with hyphens alone, which is the wire separator', () => {
    // 部品と注釈では使えるのに配線の端点でだけ使えない、という穴を塞ぐ。
    const { errors } = renderBreadboard('points:\n  "--": a1\nparts:\n  R1: resistor -- a5\n');

    expect(errors[0]?.message).toContain('ハイフン');
  });

  test('shows something in the message when the name is punctuation only', () => {
    const { errors } = renderBreadboard('points:\n  "@": a1\nparts:\n  R1: resistor a5 a10\n');

    expect(errors[0]?.message).toContain('(記号)');
  });

  test('reports a point name that is written like a hole or clashes with a part', () => {
    const address = renderBreadboard('points:\n  a5: b5\nparts:\n  R1: resistor a5 a10 330\n');
    const clash = renderBreadboard('points:\n  R1: b5\nparts:\n  R1: resistor a5 a10 330\n');

    expect(address.errors[0]?.message).toContain('番地の形');
    expect(clash.errors[0]?.message).toContain('部品 ID');
  });

  test('resolves a point defined after the parts that use it', () => {
    const { errors } = renderBreadboard('parts:\n  R1: resistor vin a10 330\npoints:\n  vin: a5\n');

    expect(errors).toEqual([]);
  });

  test('draws a chain of endpoints as one wire per neighbouring pair', () => {
    const chain = renderBreadboard(
      'parts:\n  R1: resistor a5 a10 330\nwires:\n  - +t5 -- b5 -- b10 -- -t10 red\n',
    );
    const split = renderBreadboard([
      'parts:', '  R1: resistor a5 a10 330', 'wires:',
      '  - +t5 -- b5 red', '  - b5 -- b10 red', '  - b10 -- -t10 red', '',
    ].join('\n'));

    expect(chain.errors).toEqual([]);
    expect(chain.svg).toBe(split.svg);
  });

  test('takes a label written next to the value on the one line form', () => {
    const tagged = renderBreadboard('parts:\n  M1: sip4 @ a20 l=OLED\n');
    const mapped = renderBreadboard('parts:\n  M1:\n    type: sip4\n    holes: [a20]\n    label: OLED\n');

    expect(tagged.errors).toEqual([]);
    expect(tagged.svg).toBe(mapped.svg);
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
    const { svg, errors, notices } = renderBreadboard(
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
    // value は機器のどこにも出ない。出ないものを黙って捨てず、お知らせで理由を言う。
    expect(texts).not.toContain('波形発生器');
    expect(errors).toEqual([]);
    expect(notices.map((item) => item.message)).toEqual([expect.stringContaining('value')]);
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

  test('shrinks a chip label until it fits the package body, full width or not', () => {
    // 本体の枠は `packages.ts` が chipBody を #14171c の縁で描く 1 枚だけ。
    const bodyWidth = (svg: string): number =>
      Number(/width="([\d.]+)"/.exec(/<rect[^>]*stroke="#14171c"[^>]*\/>/.exec(svg)?.[0] ?? '')?.[1]);

    for (const [source, needle] of [
      ['parts:\n  U1: dip8 @ e5 NJM4556A\n', 'NJM'],
      ['parts:\n  U1: dip8 @ e5 日本語のラベル\n', '日本語'],
      ['parts:\n  M1: sip4 @ a20 l=有機ELディスプレイ\n', '有機'],
    ] as const) {
      const { svg } = renderBreadboard(source);
      const [, size = '', text = ''] =
        [...svg.matchAll(/<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
          .find((match) => (match[2] ?? '').includes(needle)) ?? [];

      // 全角を半角の幅で数えると、字が本体の枠から飛び出す。
      expect(textWidth(text) * Number(size), text).toBeLessThanOrEqual(bodyWidth(svg));
    }
  });

  test('keeps what it could not read out of the drawing itself', () => {
    const { svg, errorHtml, errors } = renderBreadboard(
      ['parts:', '  R1: resistor a5 a10 330', 'wires:', '  - a5 -- nowhere'].join('\n'),
    );

    // 図の SVG は図だけ。GitHub や別のノートに貼っても報告が付いてこない。
    expect(svg).not.toContain('行目');
    expect(errors).toHaveLength(1);
    expect(errorHtml).toContain('breadboard-errors');
    expect(errorHtml).toContain('4 行目');
  });

  test('returns no drawing at all when the fence cannot be read, and says so in html', () => {
    const { svg, errorHtml, errors } = renderBreadboard('parts:\n  R1: [unclosed\n');

    expect(errors.length).toBeGreaterThan(0);
    expect(svg).toBe('');
    expect(errorHtml).toContain('breadboard-error-card');
  });

  test('adds the line itself and a mark under the spelling it could not read', () => {
    const { errors, errorHtml } = renderBreadboard('parts:\n  R1: resistr a5 a10 10k\n');

    expect(errors[0]?.text).toBe('  R1: resistr a5 a10 10k');
    expect(errors[0]?.at).toEqual({ column: 6, length: 7 });
    // 印は本文の下に、同じ桁で並ぶ。
    expect(errorHtml).toContain('      ^^^^^^^');
  });

  test('does not point at a spelling that appears twice on the line', () => {
    // どちらでもない場所を指すより、指さないほうがまだ正しい。
    const { errors } = renderBreadboard('parts:\n  resistr: resistr a5 a10\n');

    expect(errors[0]?.at).toBeUndefined();
  });

  test('replaces invisible characters one for one so the mark stays on its column', () => {
    const { errors } = renderBreadboard('parts:\n  R1:\u200b resistr a5 a10\n');

    expect(errors[0]?.text).toContain('·');
    expect([...(errors[0]?.text ?? '')].length).toBe(21);
  });

  test('puts what it could not read before the notices, so it is not buried', () => {
    const { errorHtml } = renderBreadboard(
      ['style:', '  text-size: 99', 'parts:', '  R1: resistr a5 a10', ''].join('\n'),
    );

    expect(errorHtml.indexOf('resistr')).toBeLessThan(errorHtml.indexOf('text-size'));
  });

  test('hides notices when debug is off, but never hides what it could not read', () => {
    const source = [
      'style:', '  debug: off', '  text-size: 99',
      'parts:', '  R1: resistor a5 a10 330', 'wires:', '  - a5 -- nowhere', '',
    ].join('\n');
    const { errorHtml, errors, notices } = renderBreadboard(source);

    expect(notices).toHaveLength(1);
    expect(errorHtml).not.toContain('text-size');
    expect(errors).toHaveLength(1);
    expect(errorHtml).toContain('nowhere');
  });

  test('reads a fence written with CRLF the same as one with newlines', () => {
    const source = 'parts:\n  R1: resistor a5 a10 330\n';

    expect(renderBreadboard(source.replace(/\n/g, '\r\n')).svg).toBe(renderBreadboard(source).svg);
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

describe('parts that share a hole with a wire endpoint', () => {
  const fence = (part: string, wire: string) =>
    ['parts:', `  ${part}`, 'wires:', `  - ${wire}`].join('\n');

  test('slides the part one row away so the wire keeps its written hole', () => {
    // 図07 の形。配線は j20 から下のレールへ直行し、Re は i 行へ寄る。
    const { svg, errors, notices } = renderBreadboard(fence('Re: resistor j17 j20 100', 'j20 -- -b20 black'));

    expect(errors).toEqual([]);
    expect(notices).toEqual([]);
    expect(svg).toContain('x1="362" y1="260" x2="422" y2="260"');
    expect(svg).toContain('M 422 280 L 422 314');
  });

  test('keeps the netlist identical to writing the slid holes by hand', () => {
    const auto = renderBreadboard(fence('Re: resistor j17 j20 100', 'j20 -- -b20 black'));
    const manual = renderBreadboard(fence('Re: resistor i17 i20 100', 'j20 -- -b20 black'));

    expect(auto.netlist).toEqual(manual.netlist);
  });

  test('a pin reference means "at that pin" and does not push the part away', () => {
    const { svg, notices } = renderBreadboard(fence('Re: resistor j17 j20 100', 'Re.2 -- -b20 black'));

    expect(notices).toEqual([]);
    expect(svg).toContain('x1="362" y1="280" x2="422" y2="280"');
    expect(svg).toContain('M 422 280 L 422 314');
  });

  test('slides symmetrically when the hinted wire is written in reverse', () => {
    // 同じ配線を逆順に書いても、経路の端から向きを読むので結果は変わらない。
    const { svg, errors, notices } = renderBreadboard(
      fence('Re: resistor j17 j20 100', '-b20 -- j20 black [v-14]'),
    );

    expect(errors).toEqual([]);
    expect(notices).toEqual([]);
    expect(svg).toContain('x1="362" y1="260" x2="422" y2="260"');
  });

  test('does not slide a part into a wire crossing from the other block', () => {
    // e10 から下のレールへの直行はブロックをまたいで f10〜j10 の上を走る。
    // その通り道へは寄せず、寄せ先が無いのでお知らせを出す。
    const { notices } = renderBreadboard([
      'parts:',
      '  R1: resistor g6 g10',
      'wires:',
      '  - g6 -- -b6 black',
      '  - e10 -- -b10 red',
    ].join('\n'));

    expect(notices).toHaveLength(1);
    expect(notices[0]?.message).toContain('g6');
  });

  test('reports a wire plugged into the same rail hole as a rail lead', () => {
    const { notices } = renderBreadboard(fence('Re: resistor j11 -b11 47', '-b11 -- j15 black'));

    expect(notices).toHaveLength(1);
    expect(notices[0]?.message).toContain('-b11');
  });

  test('reports the unbuildable hole when the part cannot make room', () => {
    // f はブロックの最上行。下のレールへ出る配線から上へは逃げられない。
    const { svg, errors, notices } = renderBreadboard(fence('Re: resistor f17 f20 100', 'f20 -- -b20 black'));

    expect(errors).toEqual([]);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.message).toContain('f20');
    // 図は書かれたまま (f 行 = y 200) 描く。
    expect(svg).toContain('x1="362" y1="200" x2="422" y2="200"');
  });
});

describe('wires that join two holes in the same row', () => {
  /**
   * その点から始まる配線の折れ線。**「まっすぐでないこと」を無いことで確かめない**:
   * 座標の定数がずれても黙って通ってしまうので、経路そのものを取り出して見る。
   */
  const wireFrom = (svg: string, start: string): string => {
    const paths = [...svg.matchAll(/ d="(M [^"]+)"/g)].map((match) => match[1]!);
    const found = paths.find((path) => path.startsWith(`M ${start} `));
    expect(found).toBeDefined();
    return found!;
  };

  test('lays one straight jumper along the row instead of climbing out to a lane', () => {
    const { svg } = renderBreadboard('wires:\n  - b10 -- b14 orange\n');

    expect(wireFrom(svg, '222 104')).toBe('M 222 104 L 302 104');
  });

  test('goes around a part whose body lies over the holes in between', () => {
    // 2 本足の部品の障害物はキャプションの帯だけなので、足の内側に収まる配線は
    // 胴の上をまっすぐ通れてしまう。塞がった穴のほうで気づく。
    const { svg } = renderBreadboard('parts:\n  R1: resistor a5 a20\nwires:\n  - a9 -- a16\n');

    // レーンへ回ると角が丸められる。まっすぐなら L が 1 つあるだけ。
    expect(wireFrom(svg, '202 84')).toContain('Q');
  });

  test('goes around a part standing upright in a hole it would cover', () => {
    // a5–c5 の抵抗は b5 の上に胴を描く。足の並びを 1 行に限ると、そこを突き抜ける。
    const { svg } = renderBreadboard('parts:\n  R1: resistor a5 c5\nwires:\n  - b1 -- b10\n');

    expect(wireFrom(svg, '42 104')).toContain('Q');
  });

  test('goes around a part that was slid into the holes it would cover', () => {
    // R1 は a9 の配線に押されて b 行へ寄る。寄った先はまっすぐな配線の下。
    const { svg } = renderBreadboard(
      'parts:\n  R1: resistor a9 a10\nwires:\n  - a9 -- +t9\n  - b8 -- b11\n',
    );

    expect(wireFrom(svg, '182 104')).toContain('Q');
  });

  test('goes around a part whose legs both sit on the same rail', () => {
    // レールは行の格子に乗らないので、足の間の穴を別に数えないと胴を突き抜ける。
    const { svg } = renderBreadboard('parts:\n  R1: resistor +t5 +t20\nwires:\n  - +t8 -- +t15\n');

    expect(wireFrom(svg, '182 30')).toContain('Q');
  });
});
