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
    // 記号として形が違うものは描き分け、細部だけが違うものは同じ形に落とす。
    // ショットキーの棒の先や pnp の矢の向きは、この大きさでは読めない。
    expect(glyphOf('schottky').name).toBe('diode');
    expect(glyphOf('photodiode').name).toBe('diode');
    expect(glyphOf('pnp').name).toBe(glyphOf('npn').name);
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
    expect(glyphOf('ammeter')).toEqual({ name: 'meter', mark: 'A' });
    expect(glyphOf('voltmeter')).toEqual({ name: 'meter', mark: 'V' });
    expect(glyphOf('ohmmeter')).toEqual({ name: 'meter', mark: 'Ω' });
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
