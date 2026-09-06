import { describe, expect, test } from 'vitest';
import { drawGlyph, glyphOf, glyphSpan, glyphSpanBack, glyphTall } from './mapGlyphs.ts';
import { partTypeNames } from '../parts.ts';

/**
 * その markup に矢の頭が入っているか。`arrow()` は頭の羽 2 本を先端から
 * 引くので、**同じ点から始まる `M` が 2 つ**あれば矢が付いている。
 */
/**
 * 矢の頭の座標。`arrow()` は `M軸元 L頭 M頭 L羽 M頭 L羽` の形で書き出すので、
 * **同じ点への `L` の直後に、その点からの `M` が続く**ところが頭。
 * 素の足の線は 1 本の `L` の連なりで書くので、この形にはならない。
 */
const headsOf = (markup: string): { readonly x: number; readonly y: number }[] =>
  [...markup.matchAll(/L(-?[\d.]+),(-?[\d.]+) M\1,\2 L/g)]
    .map((found) => ({ x: Number(found[1]), y: Number(found[2]) }));

const hasArrow = (markup: string): boolean => headsOf(markup).length > 0;

describe('glyphOf', () => {
  test('gives the common passives their own shape', () => {
    expect(glyphOf('resistor').name).toBe('resistor');
    expect(glyphOf('capacitor').name).toBe('capacitor');
    expect(glyphOf('inductor').name).toBe('inductor');
  });

  test('folds a family onto one shape when only the detail differs', () => {
    // 落とすのは**同じ記号の中の細部**だけ。ショットキーと普通のダイオードは
    // 棒の折れ方の差で、この大きさでは読めない…わけではないので描き分ける。
    // ここに残っているのは、図が同じ形で描いている組。
    expect(glyphOf('thermistor').name).toBe(glyphOf('varistor').name);
    expect(glyphOf('buzzer').name).toBe(glyphOf('speaker').name);
  });

  test('tells the enhancement FET from the depletion one by the channel', () => {
    // 実機で「pmos-e と pmos-d の区別が付くように実線と破線で分ける」。
    // 図 (circuitikz の nigfete / nigfetd) と同じで、**切れているのは
    // チャネルの棒**で、増強形が切れて空乏形はつながる。ゲートの棒は両方とも
    // 1 本のまま (そちらを切ると別の記号になる)。
    for (const [enhancement, depletion] of [['nmos-e', 'nmos-d'], ['pmos-e', 'pmos-d']] as const) {
      expect(glyphOf(enhancement).name, enhancement).not.toBe(glyphOf(depletion).name);
      const broken = drawGlyph(glyphOf(enhancement).name);
      const solid = drawGlyph(glyphOf(depletion).name);
      // 空乏形のチャネルは端から端までの 1 本。増強形にはその 1 本が無い。
      expect(solid, depletion).toContain('M-3.5,-7 L-3.5,7');
      expect(broken, enhancement).not.toContain('M-3.5,-7 L-3.5,7');
      // 増強形は 3 つに切れている (図が描いているのと同じ数)。
      expect([...broken.matchAll(/M-3\.5,-?[\d.]+ L-3\.5,-?[\d.]+/g)], enhancement).toHaveLength(3);
      // ゲートの棒はどちらも 1 本。
      for (const [shape, type] of [[broken, enhancement], [solid, depletion]] as const) {
        expect(shape, type).toContain('M-7,-7 L-7,7');
      }
    }
  });

  test('turns the arrow around for the p-type of every transistor family', () => {
    // 実機で「トランジスタ・FET の矢印を回路図と同じに」と言われた回。
    // **矢の向きが n 形と p 形を分ける**ので、同じ形に落とすと図と食い違う。
    for (const [n, p] of [['npn', 'pnp'], ['njfet', 'pjfet'], ['nigbt', 'pigbt'],
      ['nmos', 'pmos'], ['nmos-e', 'pmos-e']] as const) {
      expect(glyphOf(n).name, n).not.toBe(glyphOf(p).name);
      expect(drawGlyph(glyphOf(n).name), n).not.toBe(drawGlyph(glyphOf(p).name));
    }
  });

  test('reads the pn-junction arrows and the current arrow by their own rules', () => {
    // **FET の矢は意味が 2 通りある**ので、n 形でも向きが揃わない。
    // 実機で「nmos の矢印が逆」と見えたのはこれが理由で、調べ直して
    // 一般の回路図どおりに戻した (2026-09-06)。
    //
    // - 接合形のゲートの矢と `-e` / `-d` の基板の矢 → **pn 接合の向き**
    //   (P から N へ)。n 形はチャネルの棒を指す。
    // - 簡易記号 `nmos` / `pmos` のソースの矢 → **電流の向き**
    //   (バイポーラのエミッタと同じ読み方)。n 形は棒から離れる。
    //
    // チャネルの棒は x=-3.5 (接合形だけ 1 本の棒で x=-4)。
    const heads = (type: string): number[] =>
      headsOf(drawGlyph(glyphOf(type).name)).map((head) => head.x);

    for (const [type, bar] of [['njfet', -4], ['nmos-e', -3.5], ['nmos-d', -3.5]] as const) {
      expect(heads(type), type).toContain(bar);
    }
    for (const [type, bar] of [['pjfet', -4], ['pmos-e', -3.5], ['pmos-d', -3.5]] as const) {
      expect(heads(type), type).not.toContain(bar);
    }
    // 簡易記号だけ逆。n はソースの足の外側 (x=3) に、p は棒の上に頭が来る。
    expect(heads('nmos')).toEqual([3]);
    expect(heads('pmos')).toEqual([-3.5]);
  });

  test('gives every FET an arrow, so n and p read apart at a glance', () => {
    // 実機で「FET の図形に必ず矢印を入れる」。簡易記号の nmos / pmos は
    // ゲートの丸 1 つしか違いが無く、升目の大きさでは n と p を読めなかった。
    // 図 (circuitikz の arrowmos) と同じで、**矢はソースの足に付く**。
    for (const type of ['nmos', 'pmos', 'njfet', 'pjfet',
      'nmos-e', 'pmos-e', 'nmos-d', 'pmos-d'] as const) {
      expect(hasArrow(drawGlyph(glyphOf(type).name)), type).toBe(true);
    }
    // 矢を数える目のほうも確かめる。矢の無い記号では立たない。
    expect(hasArrow(drawGlyph('capacitor'))).toBe(false);
  });

  test('draws the diodes the figure draws differently as different shapes', () => {
    // 実機で図と升目を並べて見つけた組。**別の記号なので落とさない** —
    // ショットキーは棒が S 字に折れ、受光は光の矢が内へ入る。
    expect(glyphOf('schottky').name).toBe('schottky');
    expect(glyphOf('photodiode').name).toBe('photodiode');
    expect(drawGlyph('schottky')).not.toBe(drawGlyph('diode'));
    expect(drawGlyph('photodiode')).not.toBe(drawGlyph('led'));
  });

  test('tells the three gate kinds apart, because the figure does', () => {
    // 絶縁ゲート (棒が離れる) / 接合形 (チャネルが 1 本の棒) /
    // IGBT (絶縁ゲート + 出口の矢) は別の記号。
    expect(glyphOf('nmos').name).toBe('fet');
    expect(glyphOf('njfet').name).toBe('jfet');
    expect(glyphOf('nigbt').name).toBe('igbt');
    expect(new Set([drawGlyph('fet'), drawGlyph('jfet'), drawGlyph('igbt')]).size).toBe(3);
  });

  test('gives the shapes that really differ their own drawing', () => {
    // 実機で「回路図となるべく同じ図形に」と言われて描き分けた組。
    expect(glyphOf('ecap').name).toBe('ecap');
    expect(glyphOf('led').name).toBe('led');
    expect(glyphOf('zener').name).toBe('zener');
    expect(glyphOf('npn').name).toBe('bjt');
    expect(glyphOf('nmos').name).toBe('fet');
    expect(glyphOf('opamp').name).toBe('opamp');
    expect(glyphOf('crystal').name).toBe('crystal');
    expect(glyphOf('varicap').name).toBe('varicap');
    expect(glyphOf('battery').name).toBe('battery');
    expect(glyphOf('diac').name).toBe('diac');
  });

  test('draws the supply rails as the arrows the figure draws, up and down', () => {
    // 上下がその記号の意味なので、回すのを断っている。形も向きで分ける。
    expect(glyphOf('vcc').name).toBe('supply-up');
    expect(glyphOf('vee').name).toBe('supply-down');
    expect(drawGlyph('supply-up')).not.toBe(drawGlyph('supply-down'));
  });

  test('draws the parts the figure boxes as boxes, not as a zigzag', () => {
    // サーミスタとバリスタは IEC の箱、感光は箱に光の矢。抵抗だけが折れ線。
    expect(glyphOf('thermistor').name).toBe('resistor-iec');
    expect(glyphOf('varistor').name).toBe('resistor-iec');
    expect(glyphOf('photoresistor').name).toBe('photoresistor');
    expect(glyphOf('resistor').name).toBe('resistor');
  });

  test('tells the gates apart by the back, and the inverting twin by the bubble', () => {
    // 図が背の形で分けているので、こちらも形で分ける (字は入れない)。
    expect(glyphOf('and')).toEqual({ name: 'and', mark: null });
    expect(glyphOf('or').name).toBe('or');
    expect(glyphOf('xor').name).toBe('xor');
    expect(drawGlyph('and')).not.toBe(drawGlyph('or'));
    expect(drawGlyph('xor')).toContain(drawGlyph('or'));
    expect(drawGlyph('and-inv')).toContain(drawGlyph('and'));
    expect(drawGlyph('and-inv')).not.toBe(drawGlyph('and'));
  });

  test('draws every meter as one circle, told apart by the letter inside', () => {
    expect(glyphOf('ammeter')).toEqual({ name: 'meter', mark: { text: 'A' } });
    expect(glyphOf('voltmeter')).toEqual({ name: 'meter', mark: { text: 'V' } });
    expect(glyphOf('ohmmeter')).toEqual({ name: 'meter', mark: { text: 'Ω' } });
  });

  test('draws the parts the figure has its own symbol for, not a box', () => {
    // 実機で「SMA コネクタ、升目の表示も回路図に寄せる」。
    expect(glyphOf('sma').name).toBe('coax');
    // ブザーは図がスピーカーの記号で描く。スライドスイッチは切り替えと同じ。
    expect(glyphOf('buzzer').name).toBe('speaker');
    expect(glyphOf('slide-switch').name).toBe('spdt');
  });

  test('keeps the box where the figure draws a box too', () => {
    // レギュレータとピンヘッダは図でも箱。名前は足のほうが示す。
    expect(glyphOf('regulator').name).toBe('box');
    expect(glyphOf('sip4').name).toBe('box');
  });

  test('falls back to a box, so a type with no shape still shows up', () => {
    // 名前は箱の中に出るので、どの部品かは分かる。
    // DIP は箱が**正しい姿**でもあるので、落ちたままにしてある。
    expect(glyphOf('dip8').name).toBe('box');
    expect(glyphOf('nonsuch').name).toBe('box');
  });

  test('has a shape for every part type the fence accepts', () => {
    // 箱に落ちるのは構わない。**落ちる先が無い**のが困る。
    for (const type of partTypeNames()) {
      expect(() => drawGlyph(glyphOf(type).name)).not.toThrow();
    }
  });
});

describe('drawGlyph', () => {
  test('draws around the origin, so the caller can place and rotate it', () => {
    // 折れ線は原点をまたいで ±10 に伸びる (回路図の抵抗と同じ姿)。
    expect(drawGlyph('resistor')).toContain('d="M-10,0');
    expect(drawGlyph('resistor')).toContain('L10,0"');
    expect(drawGlyph('box')).toContain('x="-13"');
  });

  test('draws nothing for a short, which is only a line', () => {
    expect(drawGlyph('short')).toBe('');
  });
});

describe('直流電源の ＋ − (回路図に合わせる)', () => {
  // 図 (circuitikz) は丸の中に ＋ と − を横に並べる。マップだけ真ん中に ＋ を
  // 1 つ置いていたので、同じ図を見ているのに記号が違って見えた (実機で頼まれた)。
  test('draws both signs, not a single centred plus', () => {
    const svg = drawGlyph('dc-source');

    // 中に置く字ではなく**記号の一部**として描く。字にすると回しても
    // 上を向いたままで、縦置きの電源で ＋ が上に来ない
    expect(glyphOf('vsource')).toEqual({ name: 'dc-source', mark: null });
    expect(svg).toContain('<circle');
    // ＋ は横棒と縦棒、− は横棒 1 本
    expect(svg.match(/<path/g)).toHaveLength(2);
  });

  test('keeps the signs clear of the outline', () => {
    // 「記号が図形と重ならないようにする」。丸の縁 (r=9、線幅 1.5) の内側に
    // 余裕を持って収める
    const svg = drawGlyph('dc-source');
    // 記号の外接枠の角までを測る (実際の端より必ず遠いので安全側)。
    // M は x,y / H は x だけ / V は y だけを取る
    let [maxX, maxY] = [0, 0];
    for (const [, cmd, args] of svg.matchAll(/([MHV])(-?[\d.]+(?:,-?[\d.]+)?)/g)) {
      const nums = (args ?? '').split(',').map(Number);
      const [a, b] = [Math.abs(nums[0] ?? 0), Math.abs(nums[1] ?? 0)];
      if (cmd === 'M') [maxX, maxY] = [Math.max(maxX, a), Math.max(maxY, b)];
      else if (cmd === 'H') maxX = Math.max(maxX, a);
      else maxY = Math.max(maxY, a);
    }

    expect(maxX).toBeGreaterThan(0);
    expect(Math.hypot(maxX, maxY)).toBeLessThan(9 - 1.5);
  });

  test('draws the other sources with the wave the figure draws, not a letter', () => {
    // **字ではなく形で描く。** 字は回さない作りなので、縦置きの電源で
    // 波が向きを失う (`dc-source` と同じ理由。実機で図と並べて見つけた)。
    expect(glyphOf('sine')).toEqual({ name: 'ac-source', mark: null });
    expect(glyphOf('square')).toEqual({ name: 'square-source', mark: null });
    expect(glyphOf('triangle')).toEqual({ name: 'tri-source', mark: null });
    expect(glyphOf('isource')).toEqual({ name: 'i-source', mark: null });
    expect(new Set([drawGlyph('ac-source'), drawGlyph('square-source'),
      drawGlyph('tri-source'), drawGlyph('i-source')]).size).toBe(4);
    // 素の丸は計器だけが使う (中の字で描き分ける)。
    expect(drawGlyph('source')).not.toContain('<path');
  });

  test('names the thermistor kinds, which the figure tells apart only by the letters', () => {
    // 箱と斜めの線は 3 種とも同じ。図は箱の下に品種を書いて分けている。
    expect(glyphOf('thermistor-ntc')).toEqual({ name: 'resistor-iec', mark: { text: 'NTC', below: true } });
    expect(glyphOf('thermistor-ptc').mark?.text).toBe('PTC');
    expect(glyphOf('thermistor').mark).toBe(null);
  });
});

/**
 * 図と並べて見つかった形の違い。**実機で 1 つずつ指摘された回**
 * (2026-09-06)。どれも「回路図の図形に近づける」が理由。
 */
describe('図に寄せた形', () => {
  /** `d` の中の数を全部拾って、原点からの張り出しを測る。 */
  const spread = (svg: string): { readonly x: number; readonly y: number } => {
    let [x, y] = [0, 0];
    for (const [, d] of svg.matchAll(/ d="([^"]+)"/g)) {
      for (const [, px, py] of (d ?? '').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
        [x, y] = [Math.max(x, Math.abs(Number(px))), Math.max(y, Math.abs(Number(py)))];
      }
    }
    return { x, y };
  };

  test('winds the coil as tall as the resistor, which the figure draws that way', () => {
    // 実機で「inductor のコイルの高さを増やす。抵抗の高さと同じぐらいにする」。
    // 山は上へだけ出るので、抵抗の折れ線の片側 (5) と同じ高さにする。
    expect(glyphTall('inductor')).toBe(glyphTall('resistor'));
    // 山 4 つを同じ幅のまま高くするので、弧は円ではなく楕円になる。
    expect(drawGlyph('inductor')).toContain('a2.5,5');
  });

  test('drives the variable resistor arrow steeply through the middle, as the figure does', () => {
    // 実機で「resistor-var, 回路図の図形に近づける」。図は折れ線の**真ん中**を
    // 立った矢が貫く。45 度で端から端まで引くと、別の記号に見える。
    const arrowOnly = drawGlyph('resistor-var').replace(drawGlyph('resistor'), '');
    const { x, y } = spread(arrowOnly);

    // 立っている (縦の張り出しが横より大きい)。
    expect(y).toBeGreaterThan(x * 2);
    // 折れ線の上下へ突き抜ける。
    expect(y).toBeGreaterThan(glyphTall('resistor'));
  });

  test('leaves a gap between the light arrows and the body, as the figure does', () => {
    // 実機で「photoresistor, 矢印と本体に隙間を開ける」。
    const arrows = drawGlyph('photoresistor').replace(/<rect[^>]*>/, '');
    const nearest = [...arrows.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
      .map(([, , py]) => Number(py))
      .reduce((best, py) => Math.max(best, py), -Infinity);

    // 箱の上の縁は -5 (線幅 1.5 の半分で -5.75 まで)。矢はそれより上で止まる。
    expect(nearest).toBeLessThan(-5.75 - 1);
  });

  test('lays the closed switch as one bar across the line, as the figure does', () => {
    // 実機で「switch-nc, 回路図の形に近づける」。図は閉じた線を短い棒が
    // 1 本斜めに横切るだけ。倒れたレバーと横切る棒の 2 本は図に無い。
    const svg = drawGlyph('switch-nc');
    const moves = [...svg.matchAll(/M-?[\d.]+,-?[\d.]+/g)];

    // 閉じた線 1 本と、横切る棒 1 本。
    expect(moves).toHaveLength(2);
    expect(svg).toContain('M-9,0 L9,0');
  });

  test('closes the button with a bar under its contacts, as the figure does', () => {
    // 実機で「button-nc, 回路図の形に近づける」、続けて「スイッチの下線が◯の下に
    // 接続するようにする」。図では閉じる棒が**接点の下の縁**を通り、軸はその
    // 反対 (上) へ伸びる。棒を接点の上に置くと、a 接点の浮いた押し板に見える。
    const nc = drawGlyph('button-nc');
    const open = drawGlyph('button');
    const plateY = (svg: string): number => Number(/M-6,(-?[\d.]+)/.exec(svg)?.[1] ?? NaN);
    const stemTop = (svg: string): number => Number(/M0,-?[\d.]+ L0,(-?[\d.]+)/.exec(svg)?.[1] ?? NaN);

    // 接点 (r=1.6) の下の縁。線の下 = y が正。
    expect(plateY(nc)).toBe(1.6);
    // a 接点は逆に、接点から離れた上に浮く。
    expect(plateY(open)).toBeLessThan(-1.6);
    // 軸はどちらも上へ。
    expect(stemTop(nc)).toBeLessThan(0);
    expect(stemTop(open)).toBeLessThan(0);
  });

  test('reaches the body on both sides, since some shapes are not symmetric', () => {
    // 実機で「配線と部品の間を接続する」。1 つの数で両端を切っていたので、
    // 前後で形の違う記号 (反転の丸が前にしか付かないゲート、ツェナーの棒、
    // 電解の曲がった極板) では**短いほうの側に隙間**が空いていた。
    for (const [name, back] of [
      ['ecap', 3], ['zener', 6], ['schottky', 6], ['varicap', 7],
      ['opamp', 7], ['spdt', 9],
      ['or', 6], ['or-inv', 6], ['and', 8], ['and-inv', 8],
      ['xor', 9.6], ['xor-inv', 9.6], ['buffer', 7], ['buffer-inv', 7],
    ] as const) {
      expect([name, glyphSpanBack(name)]).toEqual([name, back]);
    }
    // 前後が同じ形は今までどおり 1 つの数。
    for (const name of ['resistor', 'capacitor', 'diode', 'box'] as const) {
      expect([name, glyphSpanBack(name)]).toEqual([name, glyphSpan(name)]);
    }
  });

  test('draws the line through the fuse, since that is what the symbol means', () => {
    // 実機で「fuse は中心線を表示する」。線は箱を貫く形なので `SPAN` は 0 だが、
    // 箱を地の色で塗るので、下を通る引き込み線が隠れていた。記号の側で引く。
    expect(drawGlyph('fuse')).toContain('M-8,0 L8,0');
  });

  test('stops the wiper arrow above the zigzag, as the figure does', () => {
    // 実機で「potentiometer, 矢印を図形とかぶらないようにする」。図では矢先が
    // 折れ線の山の手前で止まる。中まで下ろすと歯の間に刺さって見える。
    const wiper = drawGlyph('potentiometer').replace(drawGlyph('resistor'), '');
    const lowest = [...wiper.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
      .map(([, , py]) => Number(py))
      .reduce((best, py) => Math.max(best, py), -Infinity);

    // 折れ線の山は -5 (線幅 1.5 の外側で -5.75)。矢はそれより上で止まる。
    expect(lowest).toBeLessThan(-5.75 - 0.5);
  });

  test('keeps the light arrows off the diode body, as the figure does', () => {
    // 実機で「led の矢印が図形とかぶらないように矢印をずらす」。矢が陰極の棒を
    // 横切り、三角の上の辺にも乗っていた。**受光 (photodiode) も同じ形**なので
    // 一緒に離す。
    //
    // 胴は三角 (-6,-7)-(6,0)-(-6,7) と、陰極の棒 (x=6 の縦線)。
    // 三角の上の辺は x が 1 進むごとに 7/12 下がる。
    const edgeAt = (x: number): number => -7 + ((x + 6) / 12) * 7;

    for (const name of ['led', 'photodiode'] as const) {
      const arrows = drawGlyph(name).replace(drawGlyph('diode'), '');
      const points = [...arrows.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
        .map(([, px, py]) => ({ x: Number(px), y: Number(py) }));

      expect(points.length).toBeGreaterThan(0);
      for (const { x, y } of points) {
        // 棒 (x=6、線幅 1.5) に触れない。
        expect([name, x, x < 6 - 1]).toEqual([name, x, true]);
        // 三角の上の辺より上に、読める隙間を空けて乗る。
        expect([name, x, y, y < edgeAt(x) - 1]).toEqual([name, x, y, true]);
      }
    }
  });

  test('opens the coax shield where the core lead comes in, as the figure does', () => {
    // 実機で「SMA の図が間違っている。アースは中心に接続しない」。図と同じで、
    // 外皮の丸は中心導体の入る側 (左) を開ける。閉じた丸だと中心へつながって見える。
    const svg = drawGlyph('coax');

    expect(svg).not.toContain('<circle class="cf-glyph" cx="0" cy="0" r="8"');
    expect(svg).toContain('A8,8');
  });
});
