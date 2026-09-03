import { describe, expect, test } from 'vitest';
import { leadOffsets, leadSpan, orientInserted } from './place.ts';
import type { Rewritten } from './place.ts';
import type { LineEdit } from './edits.ts';

const SOURCE = 'parts:\n  R1: resistor a1 a6\n';
const ADDED: readonly LineEdit[] = [{ kind: 'insert', line: 3, text: '  Q1: transistor b2 b3 b4' }];

/** 回す代わりに、足した行を決まった字に差し替えるだけの偽物。 */
const rewriteTo = (text: string): Rewritten<string> =>
  ({ ok: true, value: { edits: [{ line: 3, column: 0, length: 25, text }] } });
const refuse = (why: string): Rewritten<string> => ({ ok: false, error: why });
const lineOf = (placed: string): string | null => placed.split('\n')[2] ?? null;

describe('leadSpan / leadOffsets', () => {
  test('spaces a two-lead part by the span its type is usually written with', () => {
    expect(leadSpan('resistor')).toBe(5);
    expect(leadSpan('led')).toBe(1);
    expect(leadSpan('capacitor')).toBe(3);
    expect(leadOffsets('resistor', 2)).toEqual([0, 5]);
  });

  test('puts three leads next to each other, since nothing sits between them', () => {
    expect(leadOffsets('transistor', 3)).toEqual([0, 1, 2]);
    expect(leadOffsets('button', 1)).toEqual([0]);
  });
});

describe('orientInserted', () => {
  test('leaves the lines alone when there is nothing to turn or flip', () => {
    const result = orientInserted(SOURCE, ADDED, {}, {
      turn: () => { throw new Error('回すはずがありません'); },
      flip: () => { throw new Error('反転するはずがありません'); },
      lineOf,
    });

    expect(result).toEqual({ ok: true, lines: ADDED });
  });

  test('turns and flips the trial body, then writes back the one line it made', () => {
    const seen: string[] = [];
    const result = orientInserted(SOURCE, ADDED, { turn: 1, flip: true }, {
      turn: (_placed, quarters) => { seen.push(`turn ${quarters}`); return rewriteTo('  Q1: transistor b2 c2 d2'); },
      flip: (placed) => { seen.push(`flip on ${placed.split('\n')[2]?.trim()}`); return rewriteTo('  Q1: transistor d2 c2 b2'); },
      lineOf,
    });

    // **反転は回したあとの本文に効く** (置いてから 2 回押したのと同じ順)。
    expect(seen).toEqual(['turn 1', 'flip on Q1: transistor b2 c2 d2']);
    expect(result).toEqual({ ok: true, lines: [{ kind: 'insert', line: 3, text: '  Q1: transistor d2 c2 b2' }] });
  });

  test('hands back the refusal instead of writing a line the fence would not accept', () => {
    expect(orientInserted(SOURCE, ADDED, { turn: 1 }, {
      turn: () => refuse('板の外へ出ます'),
      flip: () => rewriteTo('x'),
      lineOf,
    })).toEqual({ ok: false, error: '板の外へ出ます' });
  });

  test('rewrites the last inserted line, since the key is added before the part', () => {
    const withKey: readonly LineEdit[] = [
      { kind: 'insert', line: 1, text: 'parts:' },
      { kind: 'insert', line: 1, text: '  Q1: transistor b2 b3 b4' },
    ];

    const result = orientInserted('title: x\n', withKey, { turn: 1 }, {
      turn: () => ({ ok: true, value: { edits: [{ line: 2, column: 0, length: 25, text: '  Q1: transistor b2 c2 d2' }] } }),
      flip: () => refuse('要りません'),
      lineOf: (placed) => placed.split('\n')[1] ?? null,
    });

    expect(result).toEqual({
      ok: true,
      lines: [{ kind: 'insert', line: 1, text: 'parts:' }, { kind: 'insert', line: 1, text: '  Q1: transistor b2 c2 d2' }],
    });
  });

  test('keeps the line it wrote when the fence can no longer read the part back', () => {
    // 読み直せないのは想定外だが、**黙って壊れた行を書かない** (置いた形のまま返す)。
    expect(orientInserted(SOURCE, ADDED, { flip: true }, {
      turn: () => refuse('x'),
      flip: () => rewriteTo('  Q1: transistor b4 b3 b2'),
      lineOf: () => null,
    })).toEqual({ ok: true, lines: ADDED });
  });
});
