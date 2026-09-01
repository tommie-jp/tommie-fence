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
    expect(html).toContain('body:not(.cf-nodes) .cf-dot { pointer-events: none;');
    expect(html).toContain('body.cf-nodes .cf-chip { pointer-events: none;');
  });
});
