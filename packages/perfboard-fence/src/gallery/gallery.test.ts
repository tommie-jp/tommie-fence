import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { boardPartNames, discreteTable, moduleTable, pinoutTable } from 'fence-kit';
import { extractPerfboardFences } from '../core/fences.ts';
import { renderPerfboard } from '../core/index.ts';
import { placeableNames, variantTable } from '../core/parts/types.ts';
import { galleryFiles } from './gallery.ts';

/**
 * 部品ギャラリー (examples/13〜16) は表から書き出した物。**表に部品を足して
 * 書き出し直さないと、ここが落ちる** (`npm run gallery` → `npm run examples`)。
 */
const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));

const files = galleryFiles();
const all = files.map((file) => file.markdown).join('\n');
const fences = files.flatMap((file) => extractPerfboardFences(file.markdown).map((fence) => [file.name, fence.source] as const));

/** `ID: 種類` の行に、その種類が書かれているか。 */
const placesType = (token: string): boolean => new RegExp(`^ {2}[A-Z]+\\d+: ${token.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[ /]`, 'm').test(all);

describe('部品ギャラリー', () => {
  test.each(files.map((file) => [file.name, file] as const))('%s は書き出した中身と一致する', (name, file) => {
    expect(readFileSync(`${EXAMPLES}${name}`, 'utf8'), `${name} が古い。npm run gallery で書き出し直す`).toBe(file.markdown);
  });

  test('種類を全部置く', () => {
    expect(placeableNames().filter((type) => !placesType(type))).toEqual([]);
  });

  test('姿を全部置く (dipN の姿は dip8 で見せる)', () => {
    const missing = variantTable()
      .filter(([type]) => !/^dip\d+$/.test(type) || type === 'dip8')
      .flatMap(([type, looks]) => looks.map((look) => `${type}/${look}`))
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

  test.each(fences)('%s の図は読め、何も言わない', (_name, source) => {
    const { errors, notices } = renderPerfboard(source);
    expect(errors).toEqual([]);
    expect(notices).toEqual([]);
  });

  test.each(fences)('%s の部品の胴は重ならない (当たり判定を掛けても言われない)', (_name, source) => {
    const { notices } = renderPerfboard(source.replace('  check: off', '  check: on'));
    expect(notices.map((notice) => notice.message)).toEqual([]);
  });
});
