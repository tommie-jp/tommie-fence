import { describe, expect, test } from 'vitest';
import { makeNonce, panelHtml, renderFencePicker } from './panelHtml.ts';

const html = panelHtml({
  cspSource: 'vscode-resource:',
  nonce: 'abc123',
  view: { html: '<table></table>', picker: ''},
  undo: 'own',
});

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
    const sneaky = panelHtml({ cspSource: '"><script>x</script>', nonce: 'n', view: { html: '', picker: ''}, undo: 'own' });

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

  test('moves only by dragging — a click never drops', () => {
    // 選んでから別の場所をクリックする 2 段構えは廃止した。何気ないクリックが
    // そのまま移動になり、置くつもりのない所へ飛ぶ。
    const clickHandlers = html.match(/addEventListener\('click'/g) ?? [];

    expect(clickHandlers).toHaveLength(1);        // 残るのは元に戻す / やり直すだけ
    expect(html).toContain('const cell = moved ? cellUnder(event) : null;');
  });

  test('says so, so the reader does not wait for a second click', () => {
    expect(html).toContain('<b>ドラッグして</b>置きたい交点で放す');
    expect(html).toContain('クリックは選ぶだけ');
  });
});

describe('元に戻す・やり直す (自前の履歴)', () => {
  test('offers both buttons, off until there is something to undo', () => {
    expect(html).toContain('<button class="cf-undo" disabled');
    expect(html).toContain('<button class="cf-redo" disabled');
  });

  test('takes Ctrl+Z itself, since VS Code cannot reach the editor from here', () => {
    // パネルにフォーカスがあると activeTextEditor が無く、VS Code の undo は届かない。
    expect(html).toContain('<body class="cf-own-undo">');
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

describe('元に戻す・やり直す (VS Code に頼む)', () => {
  const native = panelHtml({ cspSource: 'vscode-resource:', nonce: 'n', view: { html: '', picker: ''}, undo: 'vscode' });

  test('lets Ctrl+Z through to VS Code instead of taking it', () => {
    // カスタムエディタでは VS Code の undo がそのタブの文書へ届く。横取りすると届かなくなる。
    expect(native).not.toContain('cf-own-undo"');
    expect(native).toContain("if (!document.body.classList.contains('cf-own-undo')) return;");
  });

  test('keeps the buttons on, since VS Code holds the history', () => {
    expect(native).toContain('<button class="cf-undo" title=');
    expect(native).not.toContain('<button class="cf-undo" disabled');
  });
});

describe('フェンスを選ぶ', () => {
  test('puts the picker in the head, so a document with several fences can choose', () => {
    const many = panelHtml({
      cspSource: 'vscode-resource:',
      nonce: 'n',
      view: { html: '', picker: '<select class="cf-fence"></select>'},
      undo: 'own',
    });

    expect(many).toContain('<p class="cf-fences"><select class="cf-fence"></select></p>');
  });

  test('sends the chosen fence to the extension', () => {
    expect(html).toContain("vscode.postMessage({ kind: 'fence', line: Number(event.target.value) })");
  });

  test('swaps the picker together with the map', () => {
    expect(html).toContain("document.querySelector('.cf-fences').innerHTML = message.picker");
  });
});

describe('renderFencePicker', () => {
  const fences = [{ line: 3, title: 'RC' }, { line: 10, title: null }];

  test('is empty with one fence, since there is nothing to choose', () => {
    expect(renderFencePicker([{ line: 3, title: 'RC' }], 3)).toBe('');
  });

  test('names each fence by its title, falling back to the line', () => {
    const picker = renderFencePicker(fences, 3);

    expect(picker).toContain('<option value="3" selected>RC (3 行目)</option>');
    expect(picker).toContain('<option value="10">10 行目のフェンス</option>');
  });

  test('escapes the title, which comes from the fence', () => {
    expect(renderFencePicker([{ line: 1, title: '<b>' }, { line: 5, title: null }], 1)).toContain('&lt;b&gt;');
  });
});

describe('エディタと光を合わせる', () => {
  test('tells the extension what was grabbed, so the editor can light it up', () => {
    expect(html).toContain("vscode.postMessage({ kind: 'select', what: kind, id: id })");
  });

  test('clears the light when the grab is released', () => {
    expect(html).toContain('tell();');
  });

  test('lights up what the editor cursor points at, in its own colour', () => {
    // 掴んでいる印と同じ色にすると、持っているものと触れているものを取り違える。
    expect(html).toContain("message.kind === 'aim'");
    expect(html).toContain('.cf-aim .cf-glyph');
    expect(html).toContain('cf-wire.cf-aim');
  });

  test('escapes the id before putting it in a selector', () => {
    // フェンスから来た名前がそのまま selector に入ると、壊れた selector で落ちる。
    expect(html).toContain('CSS.escape(id)');
  });
});
