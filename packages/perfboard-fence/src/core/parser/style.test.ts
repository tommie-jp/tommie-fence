import { describe, expect, test } from 'vitest';
import { EMPTY_STYLE, parseStyle } from './style.ts';

const read = (entries: Record<string, unknown>) => parseStyle(entries, 1);

describe('parseStyle', () => {
  test('takes a bare theme name, the short way most fences write it', () => {
    expect(parseStyle('dark', 1).style.theme).toBe('dark');
  });

  test('takes the keys it knows', () => {
    const { style, errors } = read({ theme: 'mono', width: 800, stamp: true, debug: false });

    expect(errors).toEqual([]);
    expect(style).toMatchObject({ theme: 'mono', width: 800, stamp: true, debug: false });
  });

  test('leaves what was not written alone', () => {
    expect(read({ theme: 'dark' })).toMatchObject({ style: { ...EMPTY_STYLE, theme: 'dark' } });
  });

  test('names a theme it does not have, and lists the ones it does', () => {
    const { errors } = read({ theme: 'neon' });

    expect(errors[0]?.message).toContain('neon');
    expect(errors[0]?.message).toContain('light');
  });

  test('names a key it does not know', () => {
    expect(read({ colour: 'red' }).errors[0]?.message).toContain('colour');
  });

  test('refuses a width outside what a drawing can be', () => {
    expect(read({ width: 10 }).errors.length).toBe(1);
    expect(read({ width: 100000 }).errors.length).toBe(1);
    expect(read({ width: 800 }).errors).toEqual([]);
  });

  test('refuses a value of the wrong shape, rather than guessing', () => {
    expect(read({ debug: 'yes' }).errors.length).toBe(1);
    expect(read({ width: 'wide' }).errors.length).toBe(1);
  });

  test('reads on and off, the spelling the syntax guide tells people to use', () => {
    // YAML 1.2 では `on` / `off` は真偽値ではなく字。受けずに
    // 「on か off で書きます」と返すと、**いま断った綴りを書けと言う**ことになる。
    expect(read({ debug: 'off' })).toEqual(read({ debug: false }));
    expect(read({ stamp: 'on' })).toEqual(read({ stamp: true }));
  });

  test('keeps the line, so the report can point at it', () => {
    expect(parseStyle({ theme: 'neon' }, 7).errors[0]?.line).toBe(7);
  });

  test('says so when style: is not a name or a mapping', () => {
    expect(parseStyle(42, 1).errors.length).toBe(1);
  });
});
