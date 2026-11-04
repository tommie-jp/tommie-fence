import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { boardPartNames, discreteTable, moduleTable, pinoutTable } from 'fence-kit';
import { typesWithVariants, variantsOf } from '../core/parts/variants.ts';
import { knownPartTypes } from '../core/placement/footprints.ts';
import { galleryFiles } from './gallery.ts';

/**
 * 部品ギャラリー (examples/18〜21) は表から書き出した物。**表に部品を足して
 * 書き出し直さないと、ここが落ちる** (`npm run gallery` → `npm run examples`)。
 */
const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));

const files = galleryFiles();
const all = files.map((file) => file.markdown).join('\n');

/** `ID: 種類` の行に、その種類が書かれているか。 */
const placesType = (token: string): boolean => new RegExp(`^ {2}[A-Z]+\\d+: ${token.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[ /]`, 'm').test(all);

describe('部品ギャラリー', () => {
  test.each(files.map((file) => [file.name, file] as const))('%s は書き出した中身と一致する', (name, file) => {
    expect(readFileSync(`${EXAMPLES}${name}`, 'utf8'), `${name} が古い。npm run gallery で書き出し直す`).toBe(file.markdown);
  });

  test('種類を全部置く (dipN・sipN は型番の節で置く)', () => {
    const missing = knownPartTypes().filter((type) => !['dipN', 'sipN', 'device'].includes(type) && !placesType(type));
    expect(missing).toEqual([]);
  });

  test('姿を全部置く', () => {
    const missing = typesWithVariants()
      .flatMap((type) => (type === 'dipN' ? variantsOf('dip8').map((variant) => `dip8/${variant}`) : variantsOf(type).map((variant) => `${type}/${variant}`)))
      .filter((token) => !placesType(token));
    expect(missing).toEqual([]);
  });

  test('ピンの名前の表の型番を全部置く', () => {
    const missing = pinoutTable().map((row) => row.models[0] ?? '').filter((model) => !all.includes(` ${model}\n`));
    expect(missing).toEqual([]);
  });

  test('3 ピンの型番を全部置く', () => {
    const missing = discreteTable().map((row) => row.models[0] ?? '').filter((model) => !all.includes(` ${model}\n`));
    expect(missing).toEqual([]);
  });

  test('ボードと機器を全部置く', () => {
    expect(boardPartNames().filter((name) => !placesType(name))).toEqual([]);
    expect(moduleTable().map((row) => row.models[0] ?? '').filter((model) => !all.includes(`model: ${model}\n`))).toEqual([]);
  });
});
