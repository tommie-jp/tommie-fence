import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import { readTar } from './tar.ts';

/**
 * **本物の資材で確かめる。** 自前の tar を組んで通しても、TeX の資材が
 * 読めることの証明にはならない (相手は決まった 1 つのファイル)。
 */
const texFiles = (): Map<string, Uint8Array> => {
  const require = createRequire(import.meta.url);
  const path = require.resolve('node-tikzjax/package.json').replace(/package\.json$/, 'tex/tex_files.tar.gz');
  return readTar(new Uint8Array(gunzipSync(readFileSync(path))));
};

describe('readTar', () => {
  test('TeX の資材を名前で引ける表にする', () => {
    // Act
    const files = texFiles();

    // Assert
    expect(files.size).toBeGreaterThan(100);
    expect(files.has('circuitikz.sty')).toBe(true);
    expect(files.has('pgfplots.code.tex')).toBe(true);
  });

  test('中身が元のファイルとして読める', () => {
    const found = texFiles().get('circuitikz.sty');

    expect(new TextDecoder().decode(found)).toContain('circuitikz');
  });

  test('`./` を落とした名前で入る (tar の中の綴りのまま引かない)', () => {
    const files = texFiles();

    expect([...files.keys()].every((name) => !name.startsWith('./'))).toBe(true);
  });

  test('空の tar は空の表になる', () => {
    expect(readTar(new Uint8Array(1024)).size).toBe(0);
  });

  test('大きさが読めなければ黙って飛ばさず止まる', () => {
    // Arrange: 名前だけ書いて、大きさの欄を壊したヘッダ。
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode('broken.tex'), 0);
    header.set(new TextEncoder().encode('xxxxxxx'), 124);

    // Act / Assert
    expect(() => readTar(header)).toThrow(/tar の大きさ/);
  });
});
