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
