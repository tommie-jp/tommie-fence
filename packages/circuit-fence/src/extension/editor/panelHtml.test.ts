import { describe, expect, test } from 'vitest';
import { makeNonce, panelHtml } from './panelHtml.ts';

const html = panelHtml({ cspSource: 'vscode-resource:', nonce: 'abc123', mapHtml: '<table></table>' });

describe('panelHtml', () => {
  test('puts the map inside', () => {
    expect(html).toContain('<table></table>');
  });

  test('locks the webview down: nothing loads from outside, only our script runs', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
  });

  test('has no script tag without the nonce', () => {
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  test('escapes what it is given, so a source cannot break out of an attribute', () => {
    const sneaky = panelHtml({ cspSource: '"><script>x</script>', nonce: 'n', mapHtml: '' });

    expect(sneaky.match(/<script/g)).toHaveLength(1);
    expect(sneaky).toContain('&quot;&gt;&lt;script&gt;');
  });

  test('tells the reader how to use it', () => {
    expect(html).toContain('置きたい交点');
  });
});

describe('makeNonce', () => {
  test('is long enough to be worth calling a nonce', () => {
    expect(makeNonce()).toHaveLength(32);
  });

  test('uses only characters that are safe in an attribute', () => {
    expect(makeNonce()).toMatch(/^[a-z0-9]{32}$/);
  });

  test('is different each time', () => {
    expect(makeNonce()).not.toBe(makeNonce());
  });
});

describe('持ち方の切り替え', () => {
  const html = panelHtml({ cspSource: 'vscode-resource:', nonce: 'n0nce', mapHtml: '<table></table>' });

  test('offers both things to grab, since they do not mean the same move', () => {
    expect(html).toContain('value="part"');
    expect(html).toContain('value="node"');
  });

  test('starts on parts, which is the move that was there first', () => {
    expect(html).toContain('value="part" checked');
  });

  test('lets only the thing being grabbed take the click', () => {
    // 部品の升にも節点は立つ。どちらも掴めると、掴んだつもりと違うものが動く。
    expect(html).toContain('body:not(.cf-nodes) .cf-marks { pointer-events: none;');
    expect(html).toContain('body.cf-nodes .cf-parts { pointer-events: none;');
  });
});

describe('置き先の当たり判定', () => {
  test('turns the drop targets on only while something is held', () => {
    // いつも効かせると部品を掴めず、いつも切ると埋まった升へ置けない。
    expect(html).toContain('.cf-hits { pointer-events: none; }');
    expect(html).toContain('body.cf-holding .cf-hits { pointer-events: all; }');
  });

  test('watches the pointer instead of HTML drag, which SVG does not support', () => {
    expect(html).toContain("addEventListener('pointerdown'");
    expect(html).toContain("addEventListener('pointerup'");
    expect(html).not.toContain('dragstart');
  });
});

describe('元に戻す・やり直す', () => {
  test('offers both buttons, off until there is something to undo', () => {
    expect(html).toContain('<button class="cf-undo" disabled');
    expect(html).toContain('<button class="cf-redo" disabled');
  });

  test('takes Ctrl+Z itself, since VS Code cannot reach the editor from here', () => {
    // パネルにフォーカスがあると activeTextEditor が無く、VS Code の undo は届かない。
    expect(html).toContain("if (!event.ctrlKey && !event.metaKey) return;");
    expect(html).toContain("step('undo')");
    expect(html).toContain("step('redo')");
  });

  test('asks the extension, which is the side that holds the document', () => {
    expect(html).toContain('vscode.postMessage({ kind: kind })');
  });

  test('turns the buttons on and off from what the extension reports', () => {
    expect(html).toContain("message.kind === 'history'");
    expect(html).toContain('disabled = !message.canUndo');
  });
});
