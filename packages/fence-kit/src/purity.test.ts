import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// fence-kit は 3 つのフェンスに束ねられて配られる。**ここに依存を 1 つ足すと
// 3 つ全部が重くなる**ので、外から持ってくるものを持たない。
// DOM も Node の API も使わない (VS Code のプレビュー・web 版・CLI・
// サーバー側描画のどこから呼んでも同じ結果になるため)。
//
// 禁じたいものを並べる形にすると、並べ忘れたものが素通りする。
// **許すものだけを並べて、それ以外は落とす** (circuit-fence の purity.test.ts と同じ形)。
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

/** fence-kit が外から持ってきてよいもの。**空のまま保つ**。 */
const ALLOWED = new Set<string>();

// import と export の両方、静的も動的も、引用符はどちらも拾う。
//
// **`from` と引用符の間に空白を要る**ことにしてある。詰めて書けるのは
// 括弧を挟む動的 import だけなので、これで綴りは減らない。緩めると
// `'.cf-from'` のような**字の中の from** を指し先と読んでしまう
// (webview の class 名で実際に踏んだ)。
const SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const specifiersOf = (source: string): string[] =>
  [...source.matchAll(SPECIFIER)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');

describe('fence-kit の依存', () => {
  const files = sourceFiles(SRC_DIR);

  test('ファイルを 1 つ以上見ている', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test('禁じたい import を実際に見つけられる', () => {
    const samples = [
      "import { readFileSync } from 'node:fs';",
      'const fs = await import("node:fs");',
      "import { parse } from 'yaml';",
      "import * as vscode from 'vscode';",
    ];

    for (const sample of samples) {
      const outside = specifiersOf(sample).filter(
        (name) => !name.startsWith('.') && !ALLOWED.has(name),
      );
      expect(outside.length, sample).toBeGreaterThan(0);
    }
  });

  test('字の中の from を指し先と読まない', () => {
    // webview の class 名 `.cf-from` で実際に踏んだ。詰めて書かれた `from'`
    // は指し先ではない (指し先の前には必ず空白が要る)。
    const sample = "for (const el of document.querySelectorAll('.cf-from')) el.remove();";

    expect(specifiersOf(sample)).toEqual([]);
  });

  test.each(files.map((path) => [path.slice(SRC_DIR.length), path]))(
    '%s は自分の中のファイルしか import しない',
    (_label, path) => {
      const specifiers = specifiersOf(readFileSync(path, 'utf8'));

      for (const specifier of specifiers) {
        const allowed = specifier.startsWith('.') || ALLOWED.has(specifier);
        expect(allowed, `${specifier} を import している`).toBe(true);
      }
    },
  );
});
