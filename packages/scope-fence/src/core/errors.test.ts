import { describe, expect, test } from 'vitest';
import { attachSourceText, fenceError, locate, safeToken, snippetOf } from './errors.ts';

describe('safeToken', () => {
  test('keeps letters of any script so the report can name what was written', () => {
    expect(safeToken('抵抗')).toBe('抵抗');
    expect(safeToken('résistor')).toBe('résistor');
  });

  test('drops characters that could become markup', () => {
    expect(safeToken('<img src=x>')).toBe('img src x');
  });

  test('says so instead of returning an empty name', () => {
    expect(safeToken('@()')).toBe('(記号)');
  });

  test('cuts a long spelling by code points, not by UTF-16 units', () => {
    const cut = safeToken('𝒜'.repeat(40));
    expect([...cut]).toHaveLength(33); // 32 文字 + 省略記号
  });

  test('bounds the cost of a spelling far longer than any name could show (notes: can call this up to 50 times per fence)', () => {
    const start = performance.now();
    const cut = safeToken('a'.repeat(30_000_000));
    expect(performance.now() - start).toBeLessThan(150);
    expect(cut).toBe(`${'a'.repeat(32)}…`);
  });
});

describe('snippetOf', () => {
  test('replaces the bidi isolates (U+2066–2069) too, so the line cannot be reordered', () => {
    expect(snippetOf('a\u2066b\u2069c')).toBe('a·b·c');
  });

  test('replaces invisible characters one for one so the caret stays aligned', () => {
    expect(snippetOf('a​b')).toBe('a·b');
    expect(snippetOf('a\tb')).toBe('a b');
  });

  test('bounds the cost of a line far longer than any snippet could show', () => {
    const start = performance.now();
    const cut = snippetOf('a'.repeat(30_000_000));
    expect(performance.now() - start).toBeLessThan(150);
    expect(cut).toBe(`${'a'.repeat(120)}…`);
  });
});

describe('locate', () => {
  test('points at a spelling that occurs exactly once', () => {
    expect(locate('  R1: resistr b3 b7', 'resistr')).toEqual({ column: 6, length: 7 });
  });

  test('points at nothing when the spelling occurs twice', () => {
    expect(locate('resistr: resistr b3', 'resistr')).toBeNull();
  });

  test('counts columns in code points', () => {
    expect(locate('図: あああ x', 'x')).toEqual({ column: 7, length: 1 });
  });
});

describe('attachSourceText', () => {
  const source = ['board: akizuki-c', 'parts:', '  R1: resistr b3 b7'].join('\n');

  test('adds the line and the mark for the spelling', () => {
    const [reported] = attachSourceText([fenceError('知らない部品です', 3, 'resistr')], source);

    expect(reported?.text).toBe('  R1: resistr b3 b7');
    expect(reported?.at).toEqual({ column: 6, length: 7 });
  });

  test('leaves an error without a line untouched', () => {
    const [reported] = attachSourceText([fenceError('フェンスが空です', null)], source);

    expect(reported?.text).toBeUndefined();
  });
});
