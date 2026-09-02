import { describe, expect, test } from 'vitest';
import { nodeSpans } from './point.ts';
import { partSpans } from './move.ts';
import { aimAt } from './map.ts';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';

const at = (written: string): Address => parseAddress(written) as Address;

const SOURCE = [
  'points:',            // 1
  '  fb: c3',           // 2
  'parts:',             // 3
  '  R1: resistor a1 a3 10k', // 4
  '  C1: capacitor a3 fb',    // 5
  'wires:',             // 6
  '  - a1 -- b1',       // 7
  '',
].join('\n');

const textAt = (source: string, span: { line: number; column: number; length: number }): string =>
  (source.split('\n')[span.line - 1] ?? '').slice(span.column, span.column + span.length);

describe('partSpans', () => {
  test('points at the part name, so the editor can show which one is held', () => {
    const spans = partSpans(SOURCE, 'R1');

    expect(spans[0]).toMatchObject({ line: 4 });
    expect(textAt(SOURCE, spans[0]!)).toBe('R1');
  });

  test('points at every terminal the part was written with', () => {
    expect(partSpans(SOURCE, 'R1').map((span) => textAt(SOURCE, span))).toEqual(['R1', 'a1', 'a3']);
  });

  test('follows a terminal written as a points: name', () => {
    expect(partSpans(SOURCE, 'C1').map((span) => textAt(SOURCE, span))).toEqual(['C1', 'a3', 'fb']);
  });

  test('finds each part written on one flow-style line', () => {
    const flow = 'parts: {R1: resistor a1 b1, R2: resistor a1 c1}\n';

    expect(partSpans(flow, 'R2').map((span) => textAt(flow, span))).toEqual(['R2', 'a1', 'c1']);
  });

  test('gives nothing for a part that is not there', () => {
    expect(partSpans(SOURCE, 'Q9')).toEqual([]);
  });

  test('gives nothing for a fence it cannot read, rather than guessing', () => {
    expect(partSpans('parts: [', 'R1')).toEqual([]);
  });
});

describe('nodeSpans', () => {
  test('points at every place the address is written', () => {
    const spans = nodeSpans(SOURCE, at('a1'));

    expect(spans.map((span) => span.line).sort()).toEqual([4, 7]);
    expect(spans.every((span) => textAt(SOURCE, span) === 'a1')).toBe(true);
  });

  test('points at the points: line for a named node, and at bare spellings too', () => {
    const spans = nodeSpans(SOURCE, at('c3'));

    // `fb: c3` の行き先と、`R1` の a3… ではなく c3 を書いた場所だけ。
    expect(spans.map((span) => span.line)).toContain(2);
    expect(spans.every((span) => textAt(SOURCE, span) === 'c3')).toBe(true);
  });

  test('does not point at a part name that is spelled like the address', () => {
    const written = 'parts:\n  C1: capacitor c1 d3\n';

    expect(nodeSpans(written, at('c1')).map((span) => textAt(written, span))).toEqual(['c1']);
  });

  test('gives nothing for a crossing nothing is written at', () => {
    expect(nodeSpans(SOURCE, at('z9'))).toEqual([]);
  });
});

describe('aimAt', () => {
  const aim = (line: number, column: number) => aimAt(SOURCE, line, column);

  test('names the part when the cursor is on its name', () => {
    expect(aim(4, 2)).toEqual({ kind: 'part', id: 'R1' });
  });

  test('names the part when the cursor is anywhere else on its line', () => {
    // 値の上でも「その部品」。行の上のどこでも同じ答えになるほうが読みやすい。
    expect(aim(4, 21)).toEqual({ kind: 'part', id: 'R1' });
  });

  test('names the node when the cursor is on a terminal', () => {
    expect(aim(4, 15)).toEqual({ kind: 'node', address: at('a1') });
  });

  test('names the node when the cursor is on a wire end', () => {
    expect(aim(7, 4)).toEqual({ kind: 'node', address: at('a1') });
  });

  test('names the wire line when the cursor is between its ends', () => {
    expect(aim(7, 7)).toEqual({ kind: 'wire', line: 7 });
  });

  test('names the node a points: line sends a name to', () => {
    expect(aim(2, 7)).toEqual({ kind: 'node', address: at('c3') });
  });

  test('aims at nothing on a line that holds neither', () => {
    expect(aim(1, 0)).toBeNull();
    expect(aim(3, 0)).toBeNull();
  });

  test('aims at nothing in a fence it cannot read', () => {
    expect(aimAt('parts: [', 1, 0)).toBeNull();
  });
});

describe('aimAt が見ない行', () => {
  // `title:` `notes:` `style:` は番地に見える字を持てるが、指してはいない。
  // (point.ts が「実際に踏んだ」と書いている罠と同じ根。)
  const NOTED = [
    'title: a1 から見る',                 // 1
    'parts:',                             // 2
    '  C1: capacitor c1 d3',              // 3
    'notes:',                             // 4
    '  - circle C1 red',                  // 5
    '  - text b3 hello',                  // 6
    'style:',                             // 7
    '  grid-to: e5',                      // 8
    '',
  ].join('\n');

  test('aims at nothing on a title line', () => {
    expect(aimAt(NOTED, 1, 8)).toBeNull();
  });

  test('aims at nothing on a note that names a part like an address', () => {
    expect(aimAt(NOTED, 5, 11)).toBeNull();
  });

  test('aims at nothing on a note that puts text at an address', () => {
    expect(aimAt(NOTED, 6, 9)).toBeNull();
  });

  test('aims at nothing on a style line', () => {
    expect(aimAt(NOTED, 8, 12)).toBeNull();
  });

  test('still aims at the part on its own line', () => {
    expect(aimAt(NOTED, 3, 3)).toEqual({ kind: 'part', id: 'C1' });
  });
});
