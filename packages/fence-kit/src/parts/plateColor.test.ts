import { describe, expect, test } from 'vitest';
import { CONNECTOR_PLATE } from './connectors.ts';
import { REAL_INK } from './ink.ts';
import { drawModuleOutline } from './moduleOutline.ts';
import {
  darkenColor, isLightColor, partPlateColor, plateInk, plateLook, splitPlateColor, takesPlateColor,
} from './plateColor.ts';
import { lookupPinout } from './pinouts.ts';
import { ADAPTER_BOARD } from './smdDraw.ts';

describe('partPlateColor', () => {
  test('名前は表の色に直す (大小は問わない)', () => {
    expect(partPlateColor('blue')).toBe('#1f5c9e');
    expect(partPlateColor('Blue')).toBe('#1f5c9e');
  });

  test('#RRGGBB と #RGB はそのまま (小文字に揃える)', () => {
    expect(partPlateColor('#2C5FA8')).toBe('#2c5fa8');
    expect(partPlateColor('#abc')).toBe('#abc');
  });

  test('bare (生基板) は部品の基板には無いので読まない', () => {
    expect(partPlateColor('bare')).toBeNull();
  });

  test.each(['constructor', 'toString', '__proto__', 'red" onload="x', '#12345', 'gray'])('色でない綴り %s は null', (word) => {
    expect(partPlateColor(word)).toBeNull();
  });
});

describe('takesPlateColor', () => {
  test.each([
    ['105404 のキット', { type: 'sip8', variant: null, value: '105404' }],
    ['1 列のモジュール (KY-040)', { type: 'sip5', variant: null, value: 'KY-040' }],
    ['3SK291 の変換基板', { type: 'dip4', variant: null, value: '3SK291' }],
    ['SOP の変換基板', { type: 'dip8', variant: 'sop', value: null }],
    ['SOT-23 の変換基板', { type: 'transistor', variant: 'sot23-dip', value: '2SC2712' }],
    ['USB の変換基板', { type: 'usb-c', variant: null, value: null }],
  ])('%s は色を書ける', (_, part) => {
    expect(takesPlateColor(part)).toBe(true);
  });

  test.each([
    ['抵抗', { type: 'resistor', variant: null, value: '10k' }],
    ['DIP の IC', { type: 'dip8', variant: null, value: 'NE555' }],
    ['型番の無い 1 列のヘッダ', { type: 'sip8', variant: null, value: null }],
    ['直付けの SOT', { type: 'transistor', variant: 'sot23', value: null }],
  ])('%s は色を書けない', (_, part) => {
    expect(takesPlateColor(part)).toBe(false);
  });
});

describe('splitPlateColor', () => {
  test('末尾の色を外す', () => {
    expect(splitPlateColor(['105404', 'blue'])).toEqual({ rest: ['105404'], color: 'blue' });
  });

  test('末尾が色でなければ null', () => {
    expect(splitPlateColor(['105404'])).toBeNull();
    expect(splitPlateColor([])).toBeNull();
  });
});

describe('darkenColor / isLightColor', () => {
  test('縁は塗りを暗くした色', () => {
    expect(darkenColor('#ffffff')).toBe('#a6a6a6');
    expect(darkenColor('#abc')).toBe('#6f7a85');
  });

  test('白と黄は明るく、緑と青は暗い', () => {
    expect(isLightColor('#e8eaec')).toBe(true);
    expect(isLightColor('#2c7a4b')).toBe(false);
    expect(isLightColor('#1f5c9e')).toBe(false);
  });
});

describe('plateInk', () => {
  test('変換基板の塗りと縁を書いた色に替える', () => {
    const ink = plateInk(REAL_INK, '#1f5c9e');
    expect(ink.paint(ADAPTER_BOARD.fill)).toBe('#1f5c9e');
    expect(ink.paint(ADAPTER_BOARD.edge)).toBe(darkenColor('#1f5c9e'));
    expect(ink.paint(CONNECTOR_PLATE.fill)).toBe('#1f5c9e');
  });

  test('暗い基板では白いシルクのまま、明るい基板では濃いシルク', () => {
    expect(plateInk(REAL_INK, '#1f5c9e').paint(ADAPTER_BOARD.silk)).toBe(ADAPTER_BOARD.silk);
    expect(plateInk(REAL_INK, '#e8eaec').paint(ADAPTER_BOARD.silk)).toBe('#23272e');
  });

  test('基板でない色と、名前のある色は触らない', () => {
    const ink = plateInk(REAL_INK, '#1f5c9e');
    expect(ink.paint('#c9a227')).toBe('#c9a227');
    expect(ink.paint(ADAPTER_BOARD.fill, 'green')).toBe(ADAPTER_BOARD.fill);
  });

  test('下の塗り (白黒の網など) へ差し替えた色を渡す', () => {
    const seen: string[] = [];
    const ink = plateInk({ paint: (color) => { seen.push(color); return 'x'; } }, '#1f5c9e');
    ink.paint(ADAPTER_BOARD.fill);
    expect(seen).toEqual(['#1f5c9e']);
  });
});

describe('色を書いたキットの基板', () => {
  const outline = lookupPinout('105404', 8)?.module;
  const points = Array.from({ length: 8 }, (_, index) => ({ x: 100, y: 20 + index * 10 }));

  test('書かなければ実物の緑', () => {
    if (outline === undefined) throw new Error('105404 の外形が無い');
    expect(drawModuleOutline({ points, pitch: 10, side: -1, outline })).toContain('fill="#2f7d4f"');
  });

  test('書いた色で塗り、縁は塗りから作る', () => {
    if (outline === undefined) throw new Error('105404 の外形が無い');
    const svg = drawModuleOutline({ points, pitch: 10, side: -1, outline, plate: '#1f5c9e' });
    expect(svg).toContain('fill="#1f5c9e"');
    expect(svg).toContain(`stroke="${darkenColor('#1f5c9e')}"`);
  });

  test('1 列のモジュールの胴も同じ作り方', () => {
    expect(plateLook('#1f5c9e')).toEqual({ body: '#1f5c9e', edge: darkenColor('#1f5c9e') });
  });
});
