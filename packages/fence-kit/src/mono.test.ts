import { describe, expect, test } from 'vitest';
import {
  monoBandHeight, monoBaseline, monoLinesSize, monoTableLines, monoTableSize, monoText, renderMonoLines, renderMonoTable,
} from './mono.ts';

const BOARD = { leading: 1.15, pad: 8 };
const SCREEN = { leading: 1.35, pad: 6 };

describe('mono band', () => {
  test('measures height from the number of rows and the spacing', () => {
    expect(monoBandHeight(0, 10, BOARD)).toBe(0);
    expect(monoBandHeight(1, 10, BOARD)).toBe(26);
    expect(monoBandHeight(3, 10, SCREEN)).toBeCloseTo(10 * 1.35 * 2 + 10 + 12, 9);
    expect(monoBaseline(100, 10, 1, SCREEN)).toBeCloseTo(100 + 6 + 8 + 13.5, 9);
  });

  test('keeps spaces and cuts a line to the room it is given', () => {
    const svg = monoText(0, 0, 'a  b', { fill: '#000', size: 10 });
    expect(svg).toContain('xml:space="preserve"');
    expect(monoText(0, 0, 'x'.repeat(100), { fill: '#000', size: 10, room: 50 })).toContain('…');
  });

  test('sizes and draws whole lines', () => {
    expect(monoLinesSize([], 10, BOARD)).toEqual({ width: 0, height: 0 });
    const size = monoLinesSize(['abc', 'abcdef'], 10, BOARD);
    expect(size.width).toBeGreaterThan(0);
    const svg = renderMonoLines(['abc', 'abcdef'], { x: 0, y: 0, ...size }, { size: 10, fill: '#123', spacing: BOARD });
    expect(svg.match(/<text/g)).toHaveLength(2);
    expect(svg).not.toContain('…');
  });

  test('lines a table up by terminal columns and draws the heading in its own colour', () => {
    const rows = [['CH', 'Vpp'], ['CH1', '2.00 V']];
    expect(monoTableLines(rows, (text) => text.length)).toEqual(['CH   Vpp', 'CH1  2.00 V']);
    expect(monoTableSize([], 10, SCREEN)).toEqual({ width: 0, height: 0 });
    const size = monoTableSize(rows, 10, SCREEN);
    const svg = renderMonoTable(rows, { x: 0, y: 0, ...size }, { size: 10, head: '#aaa', body: '#111', spacing: SCREEN });
    expect(svg.match(/fill="#aaa"/g)).toHaveLength(2);
    expect(svg.match(/fill="#111"/g)).toHaveLength(2);
  });
});
