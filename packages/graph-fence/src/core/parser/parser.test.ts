import { describe, expect, test } from 'vitest';
import { parseAxis } from './axes.ts';
import { parseLineExpr, parseLineKey, parsePoint } from './lines.ts';
import { parseNoteLine, splitValue } from './notes.ts';
import { parseFence } from './parseFence.ts';

const message = (read: { readonly ok: boolean; readonly error?: { readonly message: string } }): string =>
  (read.ok ? '' : read.error?.message ?? '');

describe('parseAxis', () => {
  test('reads name, unit, log and range from the end', () => {
    expect(parseAxis('周波数 Hz log 2k..32k', 'x')).toEqual({ ok: true, value: { name: '周波数', unit: 'Hz', log: true, range: [2000, 32000] } });
    expect(parseAxis('mA', 'y')).toEqual({ ok: true, value: { name: null, unit: 'mA', log: false, range: null } });
    expect(parseAxis('利得 dB -40dB..0', 'y')).toEqual({ ok: true, value: { name: '利得', unit: 'dB', log: false, range: [-40, 0] } });
    expect(parseAxis('出力 の 電流 mA 0..30', 'y')).toMatchObject({ ok: true, value: { name: '出力 の 電流' } });
  });

  test('names the vna-style range and a missing unit', () => {
    expect(message(parseAxis('周波数 Hz log 2k-32k', 'x'))).toContain('.. で区切ります');
    expect(message(parseAxis('0..10', 'x'))).toContain('単位がありません');
    expect(message(parseAxis('', 'x'))).toContain('名前 単位');
    expect(message(parseAxis('Hz log 周波数', 'x'))).toContain('log は単位の後ろ');
  });

  test('refuses a range that goes backwards, starts at 0 on log, or spans too far', () => {
    expect(message(parseAxis('Hz 32k..2k', 'x'))).toContain('大きく');
    expect(message(parseAxis('mA log 0..10', 'y'))).toContain('0 より大きい');
    expect(message(parseAxis('Hz log 1p..10T', 'x'))).toContain('12 桁');
    expect(message(parseAxis('Hz 2k..abc', 'x'))).toContain('終わりが読めません');
    expect(message(parseAxis('Hz abc..2k', 'x'))).toContain('始めが読めません');
    expect(message(parseAxis('Hz 1..2..3', 'x'))).toContain('.. で区切ります');
    expect(message(parseAxis('Hz 0..1e20', 'x'))).toContain('大きすぎます');
  });
});

describe('parseLineKey, parseLineExpr, parsePoint', () => {
  test('takes the last word as the unit', () => {
    expect(parseLineKey('出力 50Ω mA')).toEqual({ ok: true, value: { name: '出力 50Ω', unit: 'mA' } });
    expect(message(parseLineKey('mA'))).toContain('名前 単位');
    expect(message(parseLineKey('電流 20'))).toContain('単位が数');
  });

  test('reads an expression or says why not', () => {
    expect(parseLineExpr('2*x').ok).toBe(true);
    expect(message(parseLineExpr('2x'))).toContain('式が読めません');
  });

  test('reads a point with or without the axis units', () => {
    expect(parsePoint('2k 0.38', 'Hz', 'mA')).toEqual({ ok: true, value: { x: 2000, y: 0.38 } });
    expect(parsePoint('2kHz 0.38mA', 'Hz', 'mA')).toEqual({ ok: true, value: { x: 2000, y: 0.38 } });
    expect(message(parsePoint('2k', 'Hz', 'mA'))).toContain('- x y');
    expect(message(parsePoint('2kV 1', 'Hz', 'mA'))).toContain('x が読めません');
    expect(message(parsePoint('2k 1A', 'Hz', 'mA'))).toContain('y が読めません');
    expect(message(parsePoint('1e20 1', 'Hz', 'mA'))).toContain('大きすぎ');
  });
});

describe('parseNoteLine', () => {
  test('reads the six kinds', () => {
    expect(parseNoteLine('mark 1.59k', null, 'Hz')).toEqual({ ok: true, value: { kind: 'mark', x: 1590 } });
    expect(parseNoteLine('level -3dB', null, 'Hz')).toEqual({ ok: true, value: { kind: 'level', y: -3, unit: 'dB' } });
    expect(parseNoteLine('level 0.707', null, 'Hz')).toEqual({ ok: true, value: { kind: 'level', y: 0.707, unit: null } });
    expect(parseNoteLine('band 14k 18k', 'LED が点く', 'Hz')).toEqual({ ok: true, value: { kind: 'band', from: 14000, to: 18000, text: 'LED が点く' } });
    expect(parseNoteLine('band 14k 18k', null, 'Hz')).toEqual({ ok: true, value: { kind: 'band', from: 14000, to: 18000, text: null } });
    expect(parseNoteLine('text 16k 27mA', 'f₀', 'Hz')).toEqual({ ok: true, value: { kind: 'text', x: 16000, y: 27, unit: 'mA', text: 'f₀' } });
    expect(parseNoteLine('peak', null, 'Hz')).toEqual({ ok: true, value: { kind: 'peak' } });
    expect(parseNoteLine('source', null, 'Hz')).toEqual({ ok: true, value: { kind: 'source' } });
  });

  test('says how to write each kind', () => {
    expect(message(parseNoteLine('peak now', null, 'Hz'))).toContain('何も書きません');
    expect(message(parseNoteLine('mark', null, 'Hz'))).toContain('mark 1.59k');
    expect(message(parseNoteLine('mark abc', null, 'Hz'))).toContain('x が読めません');
    expect(message(parseNoteLine('level', null, 'Hz'))).toContain('level -3dB');
    expect(message(parseNoteLine('level dB', null, 'Hz'))).toContain('値が読めません');
    expect(message(parseNoteLine('band 14k', null, 'Hz'))).toContain('band 14k 18k');
    expect(message(parseNoteLine('band 18k 14k', null, 'Hz'))).toContain('始めより大きく');
    expect(message(parseNoteLine('band x 14k', null, 'Hz'))).toContain('x が読めません');
    expect(message(parseNoteLine('band 1k y', null, 'Hz'))).toContain('x が読めません');
    expect(message(parseNoteLine('text 16k', 'a', 'Hz'))).toContain('text 16k 27mA');
    expect(message(parseNoteLine('text 16k zz', 'a', 'Hz'))).toContain('値が読めません');
    expect(message(parseNoteLine('text 16k 27mA', null, 'Hz'))).toContain('コロンの後ろ');
    expect(message(parseNoteLine('text q 27mA', 'a', 'Hz'))).toContain('x が読めません');
    expect(message(parseNoteLine('circle 1k', null, 'Hz'))).toContain('注釈は');
  });

  test('splits a value from its unit', () => {
    expect(splitValue('-45deg')).toEqual({ value: -45, unit: 'deg' });
    expect(splitValue('1.5k')).toEqual({ value: 1500, unit: null });
    expect(splitValue('dB')).toBeNull();
  });
});

describe('parseFence', () => {
  const read = (source: string) => parseFence(source);
  const messages = (source: string): string => read(source).errors.map((error) => `${error.line}: ${error.message}`).join('\n');

  test('reads a whole fence', () => {
    const { doc, errors } = read([
      'title: 図3',
      'x: 周波数 Hz log 2k..32k',
      'y:',
      '  - 電流 mA 0..30',
      'lines:',
      '  出力 mA:',
      '    - 2k 0.38',
      '    - 15.9k 17.6',
      '  式 mA: 2*x/1k',
      'data: 9-1.csv',
      'notes:',
      '  - mark 15.9k',
      '  - band 14k 18k: LED',
      'style: dark',
    ].join('\n'));
    expect(errors).toEqual([]);
    expect(doc.title).toBe('図3');
    expect(doc.x).toMatchObject({ unit: 'Hz', log: true, line: 2 });
    expect(doc.y).toHaveLength(1);
    expect(doc.lines.map((line) => `${line.name} ${line.unit} ${line.source.kind} ${line.line}`)).toEqual(['出力 mA points 6', '式 mA expr 9']);
    expect(doc.data).toEqual({ name: '9-1.csv', label: '実測', line: 10 });
    expect(doc.notes.map((note) => `${note.kind} ${note.line}`)).toEqual(['mark 12', 'band 13']);
    expect(doc.style.theme).toBe('dark');
  });

  test('says the fence is empty, and what the outside must be', () => {
    expect(messages('')).toContain('graph フェンスが空です');
    expect(messages('- a')).toContain('キーと値');
    expect(messages('x: [')).toContain('YAML の構文エラー');
  });

  test('names unknown and doubled keys', () => {
    expect(messages('time: 1ms/div')).toContain('知らないキーです: time');
    expect(messages('x: Hz\nx: V')).toContain('x: が 2 つあります');
    expect(messages('? [a]\n: 1')).toContain('キーは文字で書きます');
  });

  test('puts each broken line on its own line number', () => {
    const said = messages([
      'x: 周波数 Hz 0..10',
      'y:',
      '  - mA',
      '  - mA',
      'lines:',
      '  電流 mA:',
      '    - 2k',
      '  式 mA: 2x',
      '  mA: 1',
      '  空 mA:',
      '  並び mA: []',
      '  電流 mA: 1',
      'notes: mark 1',
      'data: ../x.csv',
      'title: [1]',
    ].join('\n'));
    expect(said).toContain('4: y: に mA が 2 つあります');
    expect(said).toContain('7: 点は「- x y」');
    expect(said).toContain('8: 式が読めません');
    expect(said).toContain('9: 線は「名前 単位:」');
    expect(said).toContain('10: 線の値には式を 1 行で');
    expect(said).toContain('11: 点の並びが空です');
    expect(said).toContain('12: 線 電流 mA が 2 つあります');
    expect(said).toContain('13: notes: は');
    expect(said).toContain('14: data: には');
    expect(said).toContain('15: title: には');
  });

  test('refuses points on the same x and lines: that is not a map', () => {
    expect(messages('x: Hz 0..10\nlines:\n  a mA:\n    - 1 2\n    - 1 3')).toContain('x = 1 の点が 2 つあります');
    expect(messages('lines: 1')).toContain('lines: は');
  });

  test('reads a note written as a one-item map, and names a broken one', () => {
    const { doc } = read('notes:\n  - text 1 2mA: 字\n  - [1]');
    expect(doc.notes).toEqual([{ kind: 'text', x: 1, y: 2, unit: 'mA', text: '字', line: 2 }]);
    expect(messages('notes:\n  - [1]')).toContain('注釈は');
    expect(messages('notes:\n  - mark 1k: 字')).toContain('mark は');
  });

  test('stops at the limits', () => {
    const lines = Array.from({ length: 9 }, (_, index) => `  l${index} mA: ${index}`).join('\n');
    expect(messages(`x: Hz 0..1\nlines:\n${lines}`)).toContain('線は 8 本までです');
    const notes = Array.from({ length: 51 }, () => '  - peak').join('\n');
    expect(messages(`notes:\n${notes}`)).toContain('注釈が多すぎます');
    const marks = Array.from({ length: 9 }, (_, index) => `  - mark ${index}`).join('\n');
    expect(read(`notes:\n${marks}`).errors.some((error) => error.notice === true && error.message.includes('mark は 8 本'))).toBe(true);
    const points = Array.from({ length: 1002 }, (_, index) => `    - ${index} 1`).join('\n');
    expect(messages(`x: Hz 0..2000\nlines:\n  a mA:\n${points}`)).toContain('1001 個まで');
  });

  test('reads style: as a map and names what it cannot read', () => {
    expect(read('style:\n  theme: mono\n  width: 600').doc.style).toMatchObject({ theme: 'mono', width: 600 });
    expect(messages('style:\n  size: 3')).toContain('知らない style の項目です');
  });
});
