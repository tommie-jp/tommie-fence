import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// core は「YAML → 検証 → 中間モデル → TeX 生成」までの同期の純関数に保つ
// (CLAUDE.md 設計上の約束 1)。VS Code のプレビュー・CLI・サーバー側描画の
// どこから呼んでも同じ結果になることが、この分け方の存在理由。
// 実行時の依存も増やさない (約束 2。スキーマ検証ライブラリは
// 圧縮後 320KB 増えたので手書きに戻した経緯がある)。
//
// 禁じたいものを並べる形にすると、並べ忘れたものが素通りする。
// **許すものだけを並べて、それ以外は落とす**。
const CORE_DIR = fileURLToPath(new URL('.', import.meta.url));

/** core が外から持ってきてよいもの。 */
const ALLOWED = new Set(['yaml']);

// import と export の両方、静的も動的も、引用符はどちらも拾う。
const SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const specifiersOf = (source: string): string[] =>
  [...source.matchAll(SPECIFIER)].map((match) => match[1] ?? '');

describe('core の依存', () => {
  const files = sourceFiles(CORE_DIR);

  test('コアのファイルを 1 つ以上見ている', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test('禁じたい import を実際に見つけられる', () => {
    const samples = [
      "import { readFileSync } from 'node:fs';",
      'const fs = await import("node:fs");',
      "import Ajv from 'ajv';",
      "import * as vscode from 'vscode';",
      "export { x } from '../host/texSvg.ts';",
    ];

    for (const sample of samples) {
      const outside = specifiersOf(sample).filter((name) => !name.startsWith('.') && !ALLOWED.has(name));
      const upward = specifiersOf(sample).filter((name) => /^\.\.\/(host|extension|cli)\//.test(name));
      expect([...outside, ...upward].length, sample).toBeGreaterThan(0);
    }
  });

  test.each(files.map((path) => [path.slice(CORE_DIR.length), path]))(
    '%s は yaml と自分の中のファイルしか import しない',
    (_label, path) => {
      const specifiers = specifiersOf(readFileSync(path, 'utf8'));

      for (const specifier of specifiers) {
        const allowed = specifier.startsWith('.')
          ? !/^\.\.\/(host|extension|cli)\//.test(specifier)
          : ALLOWED.has(specifier);
        expect(allowed, `${specifier} を import している`).toBe(true);
      }
    },
  );
});
