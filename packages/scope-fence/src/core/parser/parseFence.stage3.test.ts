import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

/** 段 3a の読み — 式・Math・XY (52 の docs/99)。 */
const messages = (source: string): readonly string[] => parseFence(source).errors.map((error) => error.message);

describe('parseFence — expressions on a channel line', () => {
  test('reads = on the line and in the map form', () => {
    const { doc, errors } = parseFence('ch1: sine 1kHz 1V\nch2: = ch1 * 2\nch3: {wave: = 2V * (1 - exp(-t/1ms)), range: 1V/div}');
    expect(errors).toEqual([]);
    expect(doc.channels.map((channel) => channel.source.kind)).toEqual(['wave', 'expr', 'expr']);
    expect(doc.channels[2]?.range).toBe(1);
  });

  test('says a channel the expression needs did not read', () => {
    expect(messages('ch1: sine 1000 1\nch2: = 1V + ch1 * 2')).toEqual([
      '周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます',
      'ch1 が読めないので ch2 も描けません',
    ]);
  });
});

describe('parseFence — math:', () => {
  test('reads a plain expression, unit V unless written', () => {
    const { doc, errors } = parseFence('ch1: sine 1kHz 1V\nch2: ch1 | rc 1ms\nmath: ch1 * ch2 / 10');
    expect(errors).toEqual([]);
    expect(doc.math).toMatchObject({ refs: ['ch1', 'ch2'], unit: 'V', unitWritten: false, range: null, position: null, line: 3 });
  });

  test('reads the map form with unit, range and position', () => {
    const { doc, errors } = parseFence('ch1: sine 1kHz 1V\nmath: {expr: ch1 * ch1, unit: W, range: 200mW/div, position: -2div}');
    expect(errors).toEqual([]);
    expect(doc.math).toMatchObject({ unit: 'W', unitWritten: true, range: 0.2, position: -2 });
    expect(parseFence('ch1: sine 1kHz 1V\nmath: {expr: ch1 / 1V, unit: 1, range: 0.5/div}').doc.math).toMatchObject({ unit: '1', range: 0.5 });
  });

  test.each([
    ['math: sine 1kHz 1V', 'math: は式で書きます (波は ch の行に書きます。例: math: ch1 * ch2 / 10)'],
    ['math: = ch1 * 2', 'math: は = を付けずに式を書きます (例: math: ch1 * ch2 / 10)'],
    ['math: ch3 * 2', 'ch3 は参照できません (参照できるのは ch1)'],
    ['math: {unit: W}', 'math: を並びで書くときは expr: が要ります (例: {expr: ch1 * ch2 / 10, unit: W})'],
    ['math: {expr: ch1, unit: A}', 'unit: は V / W / 1 のどれかです (1 は無次元)'],
    ['math: {expr: ch1, unit: W, range: 1V/div}', 'range: は 200mW/div のように W の /div で書きます'],
    ['math: {expr: ch1, range: 1V}', 'range: は 500mV/div / 2V/div のように /div を付けます'],
    ['math: {expr: ch1, position: 2}', 'position: は 0 V の基準の位置を -2div のように書きます (中央が 0、上が正)'],
    ['math: {expr: ch1, wave: sine 1kHz 1V}', '知らない項目です: wave (書けるのは expr / unit / range / position)'],
    ['math:', 'math: には式を 1 行で書きます (例: math: ch1 * ch2 / 10)'],
  ])('%s is refused with how to write it', (line, message) => {
    expect(messages(`ch1: sine 1kHz 1V\n${line}`)).toEqual([message]);
  });

  test('says a channel math needs did not read', () => {
    expect(messages('ch1: sine 1000 1\nmath: ch1 * 2')).toEqual([
      '周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます',
      'ch1 が読めないので math: も描けません',
    ]);
  });
});

describe('parseFence — view: xy', () => {
  test('reads view: xy with its axes, math allowed', () => {
    const { doc, errors } = parseFence('view: xy\nch1: sine 1kHz 1V\nmath: ch1 * 2\nxy: ch1 math');
    expect(errors).toEqual([]);
    expect(doc.view).toBe('xy');
    expect(doc.xy).toEqual({ x: 'ch1', y: 'math', line: 4 });
  });

  test('takes ch1 across and ch2 up when xy: is not written, and says so', () => {
    const { doc, errors } = parseFence('view: xy\nch1: sine 1kHz 1V\nch2: sine 2kHz 1V');
    expect(doc.xy).toEqual({ x: 'ch1', y: 'ch2', line: null });
    expect(errors).toEqual([{ message: 'xy: が無いので 横 CH1・縦 CH2 で描いています', line: 1, notice: true }]);
  });

  test.each([
    ['time: 1ms/div', 'time'],
    ['trigger: ch1 rising', 'trigger'],
    ['cursors: [0, 1ms]', 'cursors'],
    ['measure: [vpp]', 'measure'],
    ['data: x.csv', 'data'],
  ])('refuses %s under view: xy', (line, key) => {
    const { doc, errors } = parseFence(`view: xy\nch1: sine 1kHz 1V\nch2: ch1\nxy: ch1 ch2\n${line}`);
    expect(errors.map((error) => error.message)).toEqual([`view: xy では ${key}: は書けません (${key === 'data' ? '実測の XY はまだ重ねられません' : 'XY には時間軸がありません。読み値は各軸の Vpp・Vmax・Vmin です'})`]);
    expect(errors[0]?.line).toBe(5);
    expect(doc.trigger).toBeNull();
    expect(doc.cursors).toEqual([]);
    expect(doc.data).toBeNull();
  });

  test.each([
    ['view: time\nxy: ch1 ch2', 'xy: は view: xy のときだけ書けます'],
    ['xy: ch1 ch2', 'xy: は view: xy のときだけ書けます'],
    ['view: xy\nxy: ch1', 'xy: は横と縦を 2 つ書きます (例: xy: ch1 ch2。書けるのは ch1 / ch2 / ch3 / ch4 / math)'],
    ['view: xy\nxy: ch1 ch9', 'xy: は横と縦を 2 つ書きます (例: xy: ch1 ch2。書けるのは ch1 / ch2 / ch3 / ch4 / math)'],
    ['view: xy\nxy: ch1 ch3', 'xy: の ch3 が書かれていません'],
    ['view: xy\nxy: ch1 math', 'xy: の math が書かれていません'],
    ['view: xy\nxy: ch1 ch1', 'xy: の横と縦は別の ch にします'],
  ])('%s is refused', (head, message) => {
    expect(messages(`ch1: sine 1kHz 1V\nch2: ch1\n${head}`)).toEqual([message]);
  });

  test('says an axis that did not read', () => {
    expect(messages('view: xy\nch1: sine 1kHz 1V\nch2: sine 1000 1\nxy: ch1 ch2')).toEqual([
      '周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます',
      'xy: の ch2 が読めないので XY を描けません',
    ]);
  });
});
