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
    customEditors?: { viewType: string; displayName: string; selector: { filenamePattern: string }[]; priority: string }[];
    commands?: { command: string }[];
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

  test('builds the web bundle that the manifest points at', () => {
    const build = readText('esbuild.mjs');

    expect(build).toContain(`outfile: '${manifest.browser.replace(/^\.\//, '')}'`);
    expect(build).toContain("platform: 'browser'");
  });

  test('contributes a preview stylesheet so the extension folder is a resource root', () => {
    expect(manifest.contributes['markdown.previewStyles']).toEqual(['./media/breadboard.css']);
  });

  test('injects the syntax highlighting grammar into markdown', () => {
    const grammar = manifest.contributes.grammars?.[0];

    expect(grammar?.injectTo).toEqual(['text.html.markdown']);
    expect(grammar?.embeddedLanguages).toEqual({ 'meta.embedded.block.yaml': 'yaml' });
  });

  test('offers the map as a way to open markdown, without taking the default away', () => {
    // タブの頭の開き方の一覧 (と Reopen Editor With...) は custom editor の登録から作られる。
    const editor = manifest.contributes.customEditors?.[0];

    expect(editor?.viewType).toBe('breadboard-fence.map');
    expect(editor?.displayName).toBe('breadboard Editor');
    expect(editor?.priority).toBe('option');
  });

  test('registers the map for *.md files, not for everything', () => {
    // `*` は「未設定の汎用エディタ」として一覧から除かれる (VS Code の editorTypePicker)。
    expect(manifest.contributes.customEditors?.[0]?.selector).toEqual([{ filenamePattern: '*.md' }]);
  });

  test('offers a command that opens the map beside the editor', () => {
    expect(manifest.contributes.commands?.some((one) => one.command === 'breadboard-fence.openMap')).toBe(true);
  });

  test('builds the webview bundle the map loads', () => {
    // パネルは `dist/map.js` を `asWebviewUri` で読み込む。作られていないと真っ白になる。
    expect(readText('esbuild.mjs')).toContain("outfile: 'dist/map.js'");
  });

  test('points at a grammar whose scope name matches the manifest', () => {
    const grammar = manifest.contributes.grammars?.[0];
    const syntax = read(grammar!.path) as { scopeName: string; injectionSelector: string };

    expect(syntax.scopeName).toBe(grammar?.scopeName);
    expect(syntax.injectionSelector).toBe('L:text.html.markdown');
  });
});
