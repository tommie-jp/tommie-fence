import { describe, expect, test } from 'vitest';
import { drawGlyph, glyphOf } from './mapGlyphs.ts';
import { partTypeNames } from '../parts.ts';

describe('glyphOf', () => {
  test('gives the common passives their own shape', () => {
    expect(glyphOf('resistor').name).toBe('resistor');
    expect(glyphOf('capacitor').name).toBe('capacitor');
    expect(glyphOf('inductor').name).toBe('inductor');
  });

  test('folds a family onto one shape when only the detail differs', () => {
    // 落とすのは**同じ記号の中の細部**だけ。増強形と空乏形はチャネルの
    // 切れ方の差で、この大きさでは読めない。
    expect(glyphOf('nmos-d').name).toBe(glyphOf('nmos-e').name);
    expect(glyphOf('pmos-d').name).toBe(glyphOf('pmos-e').name);
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
