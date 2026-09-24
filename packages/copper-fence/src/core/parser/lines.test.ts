import { describe, expect, test } from 'vitest';
import { parseNoteLine } from './notes.ts';
import { takeOrient } from './orient.ts';
import { parseStyle } from './style.ts';
import { parseWireLine } from './wires.ts';

describe('parseWireLine', () => {
  test('joins two ends, with an optional colour', () => {
    expect(parseWireLine('P1 -- P2')).toEqual({ ok: true, value: { from: 'P1', to: 'P2', color: null } });
    expect(parseWireLine('P1 -- 20,5 Red')).toEqual({ ok: true, value: { from: 'P1', to: '20,5', color: 'red' } });
  });

  test('says what went wrong', () => {
    const say = (text: string): string => {
      const result = parseWireLine(text);
      return result.ok ? '' : result.error.message;
    };
    expect(say('P1 - P2')).toMatch(/端 -- 端/);
    expect(say('P1 -- 1.234,5')).toMatch(/小数は 2 桁まで/);
    expect(say('P1 -- P2 plaid')).toMatch(/線の色として読めません/);
    expect(say('P1 -- P2 red again')).toMatch(/読めない語です/);
  });
});

describe('parseNoteLine', () => {
  test('reads marks, boxes, arrows, dimensions and lists', () => {
    expect(parseNoteLine('mark 20,10 red', null)).toMatchObject({ ok: true, value: { kind: 'mark', from: { x: 20, y: 10 }, color: 'red' } });
    expect(parseNoteLine('dim 0,22 40,22', null)).toMatchObject({ ok: true, value: { kind: 'dim', to: { x: 40, y: 22 } } });
    expect(parseNoteLine('parts', null)).toMatchObject({ ok: true, value: { kind: 'parts', from: null } });
    expect(parseNoteLine('text 5,5 blue r90', '切る')).toMatchObject({ ok: true, value: { kind: 'text', text: '切る', turn: 90, color: 'blue' } });
  });

  test('says what went wrong', () => {
    const say = (head: string, text: string | null = null): string => {
      const result = parseNoteLine(head, text);
      return result.ok ? '' : result.error.message;
    };
    expect(say('circle 1,1')).toMatch(/知らない注釈です/);
    expect(say('box 1,1')).toMatch(/点を 2 つ書きます/);
    expect(say('mark 1.234,1')).toMatch(/小数は 2 桁まで/);
    expect(say('mark 1,1 r90')).toMatch(/注釈の知らない語です: r90/);
    expect(say('text 1,1')).toMatch(/字を : の後ろに/);
    expect(say('mark 1,1', 'x')).toMatch(/字は書けません/);
  });
});

describe('takeOrient', () => {
  test('picks the turn and the mirror out of the words', () => {
    expect(takeOrient(['r270', 'MIRROR', '10p'])).toEqual({ orient: { turn: 270, mirror: true }, rest: ['10p'] });
    expect(takeOrient(['10p'])).toEqual({ orient: null, rest: ['10p'] });
    expect(takeOrient(['mirror'])).toEqual({ orient: { turn: 0, mirror: true }, rest: [] });
  });
});

describe('parseStyle', () => {
  test('takes a theme name alone or a map of items', () => {
    expect(parseStyle('dark', 1).style.theme).toBe('dark');
    expect(parseStyle({ grid: 'off', check: false, width: 640.4, stamp: 'on' }, 1).style)
      .toMatchObject({ grid: false, check: false, width: 640, stamp: true });
  });

  test('names what it cannot read, on the line of the item', () => {
    const read = parseStyle({ theme: 'sepia', grid: 'maybe', width: 10, nope: 1 }, 1, new Map([['grid', 3]]));
    const messages = read.errors.map((error) => error.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringMatching(/知らないテーマです/), expect.stringMatching(/grid は on か off/),
      expect.stringMatching(/width は 120〜4000/), expect.stringMatching(/知らない style の項目です: nope/),
    ]));
    expect(read.errors.find((error) => error.message.startsWith('grid'))?.line).toBe(3);
    expect(parseStyle('sepia', 2).errors[0]?.message).toMatch(/知らないテーマ/);
    expect(parseStyle([1], 2).errors[0]?.message).toMatch(/テーマの名前か/);
    expect(parseStyle({ theme: 3 }, 2).errors[0]?.message).toMatch(/名前で書きます/);
    expect(parseStyle({ width: 'wide' }, 2).errors[0]?.message).toMatch(/数で書きます/);
  });
});

test('refuses a dimension, box or arrow whose two points are the same', () => {
  const said = parseNoteLine('dim 5,5 5,5', null);
  expect(said.ok ? '' : said.error.message).toMatch(/2 点が同じ/);
});
