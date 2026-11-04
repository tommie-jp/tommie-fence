import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { discreteTable, moduleTable, pinoutTable } from 'fence-kit';
import { compileCircuit, errorLine, extractCircuitFences } from '../core/index.ts';
import { icLayoutModels } from '../core/icLayouts.ts';
import { partTypeNames } from '../core/parts.ts';
import { galleryFiles } from './gallery.ts';

/**
 * 部品ギャラリー (examples/19〜23) は表から書き出した物。**表に部品を足して
 * 書き出し直さないと、ここが落ちる** (`npm run gallery` → `npm run examples`)。
 */
const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));

const files = galleryFiles();
const all = files.map((file) => file.markdown).join('\n');

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** `ID: 種類 番地` の行に、その種類が書かれているか。 */
const placesType = (type: string): boolean => new RegExp(`^ {2}[A-Z]+\\d*: ${escape(type)} `, 'm').test(all);

/** 1 行の部品に型番が書かれているか (`U1: dip8 1,1 NE555`)。 */
const placesModel = (type: string, model: string): boolean =>
  new RegExp(`^ {2}[A-Z]+\\d+: ${escape(type)} [\\d.]+,[\\d.]+ ${escape(model)}$`, 'm').test(all);

/** マップ形式の部品に型番が書かれているか (`type: device` + `model: …`)。 */
const mapsModel = (type: string, model: string): boolean =>
  new RegExp(`^ {6}type: ${escape(type)}\\n {6}at: [\\d.]+,[\\d.]+\\n {6}model: ${escape(model)}$`, 'm').test(all);

describe('部品ギャラリー', () => {
  test.each(files.map((file) => [file.name, file] as const))('%s は書き出した中身と一致する', (name, file) => {
    expect(readFileSync(`${EXAMPLES}${name}`, 'utf8'), `${name} が古い。npm run gallery で書き出し直す`).toBe(file.markdown);
  });

  test.each(files.map((file) => [file.name, file] as const))('%s の図はどれもエラーなしで描ける', (_name, file) => {
    const errors = extractCircuitFences(file.markdown).flatMap((fence) => compileCircuit(fence.source).errors.map(errorLine));
    expect(errors).toEqual([]);
  });

  test('種類を全部置く (ic と device は型番の節で置く)', () => {
    const missing = partTypeNames().filter((type) => !['ic', 'device'].includes(type) && !placesType(type));
    expect(missing).toEqual([]);
  });

  test('ピンの名前の表の型番を全部置く (DIP か機器の箱)', () => {
    const missing = pinoutTable()
      .map((row) => ({ model: row.models[0] ?? '', pins: row.names.length }))
      .filter(({ model, pins }) => !placesModel(`dip${pins}`, model) && !mapsModel('device', model));
    expect(missing).toEqual([]);
  });

  test('3 ピンの型番は ic3 でも置く', () => {
    const missing = pinoutTable().filter((row) => row.names.length === 3).map((row) => row.models[0] ?? '')
      .filter((model) => !mapsModel('ic3', model));
    expect(missing).toEqual([]);
  });

  test('ic で描ける型番を全部 ic で置く', () => {
    expect(icLayoutModels().filter((model) => !placesModel('ic', model))).toEqual([]);
  });

  test('3 ピンのトランジスタ・FET・レギュレータの型番を全部置く', () => {
    const missing = discreteTable().map((row) => row.models[0] ?? '').filter((model) => !new RegExp(` ${escape(model)}$`, 'm').test(all));
    expect(missing).toEqual([]);
  });

  test('モジュールの表の型番を全部置く', () => {
    expect(moduleTable().map((row) => row.models[0] ?? '').filter((model) => !mapsModel('device', model))).toEqual([]);
  });

  test('ID は図の中で重ならない', () => {
    const repeated = files.flatMap((file) => extractCircuitFences(file.markdown).flatMap((fence) => {
      const ids = [...fence.source.matchAll(/^ {2}([A-Za-z]+\d*):/gm)].map((match) => match[1] ?? '');
      return ids.filter((id, index) => ids.indexOf(id) !== index).map((id) => `${file.name}: ${id}`);
    }));
    expect(repeated).toEqual([]);
  });
});
