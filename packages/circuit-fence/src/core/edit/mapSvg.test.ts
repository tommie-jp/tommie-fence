import { describe, expect, test } from 'vitest';
import { gridMap } from './map.ts';
import { renderMapHtml } from './mapSvg.ts';

const draw = (source: string): string => renderMapHtml(gridMap(source));

describe('renderMapHtml が描くもの', () => {
  test('draws one svg that scales to the panel', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 ');
  });

  test('draws a line for every wire', () => {
    expect(draw('wires:\n  - a1 -- a3\n')).toContain('class="cf-wire"');
  });

  test('dashes a wire whose end was only approximated', () => {
    // ピンの足の位置は TeX しか知らない。実線で引くと嘘の精度になる。
    const svg = draw('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a4\n');

    expect(svg).toContain('cf-approx');
  });

  test('draws the part between its two ends, not in one cell', () => {
    // 2 端子は両端の間に胴を置いて回す。片方の升に押し込めない。
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-lead"');
    expect(svg).toMatch(/rotate\(/);
  });

  test('names every part next to its shape', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('>R1</text>');
  });

  test('marks the crossings, so the grid reads as places to drop on', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('cf-grid-dot');
  });

  test('labels the rows and columns, so an address can be counted off', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-axis"');
    expect(svg).toContain('>a</text>');
  });

  test('lays a drop target over every crossing', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-cell" data-address="a1"');
    expect(svg).toContain('data-address="b2"');
  });

  test('offsets two parts spanning the same pair, so neither hides the other', () => {
    // 並列の RC は普通に書く。ぴったり重ねると後ろの 1 つを掴めない。
    const svg = draw('parts:\n  R1: resistor a1 c1\n  C1: capacitor a1 c1\n');
    const bodies = svg.match(/translate\([-\d.]+,[-\d.]+\) rotate\(/g) ?? [];

    expect(bodies).toHaveLength(2);
    expect(new Set(bodies).size).toBe(2);
  });

  test('offsets a pair written end-for-end, which is the same two crossings', () => {
    // `a1 a3` と `a3 a1` は同じ 2 交点。並びで鍵を作ると別物になり、重なる。
    const svg = draw('parts:\n  R1: resistor a1 c1\n  C1: capacitor c1 a1\n');
    const bodies = svg.match(/translate\([-\d.]+,[-\d.]+\) rotate\(/g) ?? [];

    expect(new Set(bodies).size).toBe(2);
  });

  test('offsets two standing parts on one crossing, so neither hides the other', () => {
    const svg = draw('parts:\n  IN: port a1\n  G1: ground a1\n');

    expect(svg).toContain('data-part="IN"');
    expect(svg).toContain('data-part="G1"');
    expect(svg).toContain('translate(0,7)');
  });

  test('escapes what came from the fence, in text and in attributes', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3 "<img src=x>"\n');

    expect(svg).not.toContain('<img');
  });

  test('says so when the fence cannot be read, instead of an empty grid', () => {
    expect(draw('parts: [')).toContain('読めません');
  });
});
