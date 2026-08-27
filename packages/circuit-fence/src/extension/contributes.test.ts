import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const readText = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');

const read = (name: string): unknown => JSON.parse(readText(name));

const manifest = read('package.json') as {
  main: string;
  browser: string;
  contributes: {
    grammars?: { scopeName: string; path: string; injectTo: string[]; embeddedLanguages: Record<string, string> }[];
    'markdown.previewStyles'?: string[];
    'markdown.markdownItPlugins'?: boolean;
  };
};

describe('extension manifest', () => {
  test('declares the markdown-it plugin hook', () => {
    expect(manifest.contributes['markdown.markdownItPlugins']).toBe(true);
    expect(manifest.main.endsWith('.cjs')).toBe(true);
  });

  test('declares a web entry point so vscode.dev can run the extension', () => {
    expect(manifest.browser.endsWith('.cjs')).toBe(true);
    expect(manifest.browser).not.toBe(manifest.main);
  });

  test('builds every bundle that the manifest points at', () => {
    const build = readText('esbuild.mjs');

    expect(build).toContain(`outfile: '${manifest.main.replace(/^\.\//, '')}'`);
    expect(build).toContain(`outfile: '${manifest.browser.replace(/^\.\//, '')}'`);
    expect(build).toContain("platform: 'browser'");
  });

  test('contributes a preview stylesheet so the extension folder is a resource root', () => {
    expect(manifest.contributes['markdown.previewStyles']?.[0]).toBe('./media/circuit.css');
  });

  test('serves the fonts the drawing needs from the extension folder', () => {
    // CDN からは取れない (プレビューの CSP が外部への取得を通さない)。
    const styles = manifest.contributes['markdown.previewStyles'] ?? [];

    expect(styles.some((style) => style.includes('node-tikzjax/css/fonts.css'))).toBe(true);
    expect(readText('.vscodeignore')).not.toContain('\nnode_modules/**\n');
  });

  test('injects the syntax highlighting grammar into markdown', () => {
    const grammar = manifest.contributes.grammars?.[0];

    expect(grammar?.injectTo).toEqual(['text.html.markdown']);
    expect(grammar?.embeddedLanguages).toEqual({ 'meta.embedded.block.yaml': 'yaml' });
  });

  test('points at a grammar whose scope name matches the manifest', () => {
    const grammar = manifest.contributes.grammars?.[0];
    const syntax = read(grammar!.path) as { scopeName: string; injectionSelector: string };

    expect(syntax.scopeName).toBe(grammar?.scopeName);
    expect(syntax.injectionSelector).toBe('L:text.html.markdown');
  });
});

/**
 * 配るときのファイルの選び方。
 *
 * .vsix と npm の tarball で入れるものが違うので、選び方を 2 つ持っている。
 * **`.vscodeignore` と package.json の `files` は同居できない** — vsce が
 * 「どちらの流儀か決められない」として .vsix の作成を断る (実際に止まった)。
 * npm 側は `.npmignore` で表す。vsce は `.vscodeignore` があればそちらだけを
 * 見るので、この 2 つはぶつからない。
 */
describe('配るときのファイルの選び方', () => {
  test('vsce が読む .vscodeignore がある', () => {
    expect(readText('.vscodeignore')).toContain('node_modules');
  });

  test('npm が読む .npmignore が dist だけを残している', () => {
    const rules = readText('.npmignore')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    expect(rules).toEqual(['/*', '!/dist']);
  });

  test('package.json に files を書かない (.vscodeignore と併用できない)', () => {
    expect(Object.keys(read('package.json') as object)).not.toContain('files');
  });
});
