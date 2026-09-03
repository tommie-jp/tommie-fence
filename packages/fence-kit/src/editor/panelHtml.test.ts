import { describe, expect, test } from 'vitest';
import { makeNonce, panelHtml, renderFencePicker } from './panelHtml.ts';

const shell = (over: Partial<Parameters<typeof panelHtml>[0]> = {}): string => panelHtml({
  cspSource: 'vscode-resource:',
  nonce: 'abc123',
  scriptUri: 'vscode-resource://dist/map.js',
  view: { html: '<table></table>', picker: '', issues: '' },
  // 帯はフェンスが組む (`FenceEditor`)。殻の試験では中身の分かる印を入れておく。
  chrome: { palette: '<details class="cf-palette"></details>', typeNames: '<datalist id="cf-type-names"></datalist>' },
  undo: 'own',
  ...over,
});

const html = shell();

describe('panelHtml', () => {
  test('puts the map inside the canvas, which is what zooms and pans', () => {
    expect(html).toContain('<div class="kc-canvas"><div class="cf-body"><table></table></div>');
  });

  test('locks the webview down: nothing loads from outside, only our script runs', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123" src="vscode-resource://dist/map.js">');
  });

  test('loads the script as a bundled file, so what it does can be tested', () => {
    // 文字列に書いたスクリプトはテストが「その字が入っているか」しか見られない。
    expect(html).not.toContain('acquireVsCodeApi');
    expect(html).toContain('src="vscode-resource://dist/map.js"');
  });

  test('escapes what it is given, so a source cannot break out of an attribute', () => {
    const tricky = shell({ cspSource: 'x" onload="alert(1)', nonce: 'n"x', scriptUri: 'a"b' });

    expect(tricky).not.toContain('onload="alert');
    expect(tricky).toContain('&quot;');
  });
});

describe('KiCad の配置', () => {
  test('puts the tools in a column on the right, each with the key it stands for', () => {
    expect(html).toContain('<nav class="kc-tools">');
    const keys = [['Escape', 'Esc'], ['a', 'A'], ['w', 'W'], ['m', 'M'], ['g', 'G'], ['r', 'R'], ['x', 'X'], ['d', 'Ctrl+D'], ['Delete', 'Del']];
    for (const [key, kbd] of keys) {
      expect(html).toContain(`data-key="${key}"`);
      expect(html).toContain(`<kbd>${kbd}</kbd>`);
    }
  });

  test('marks the button whose key needs Ctrl, so pressing it means the same thing', () => {
    expect(html).toContain('data-key="d" data-modifier="1"');
    expect(html).not.toContain('data-key="r" data-modifier="1"');
  });

  test('marks the three tools that have a state, so the CSS can light the current one', () => {
    expect(html).toContain('data-tool="select"');
    expect(html).toContain('data-tool="wire"');
    expect(html).toContain('data-tool="place"');
    expect(html).toContain('<body data-tool="select"');
  });

  test('has no V or N: KiCad has neither, and the shell follows KiCad', () => {
    expect(html).not.toContain('<kbd>V</kbd>');
    expect(html).not.toContain('<kbd>N</kbd>');
    expect(html).not.toContain('name="cf-tool"');
  });

  test('puts the properties on the left, with a hint while nothing is picked', () => {
    expect(html).toContain('<aside class="kc-props">');
    expect(html).toContain('<form class="cf-inspector" hidden>');
    expect(html).toContain('class="kc-props-hint"');
  });

  test('floats the chooser over the canvas, closed until A opens it', () => {
    expect(html).toContain('<div class="kc-chooser" hidden>');
    expect(html).toContain('<details class="cf-palette"></details>');
    expect(html.indexOf('kc-chooser')).toBeGreaterThan(html.indexOf('kc-canvas'));
  });

  test('offers the same list on right-click, so the keys can be found without knowing them', () => {
    expect(html).toContain('<menu class="kc-menu" hidden>');
    // 道具の列と同じ表から組む (押せることが 2 通りの並びで違って見えない)。
    const inColumn = [...html.matchAll(/class="kc-tool"[^>]*data-key="([^"]+)"/g)].map((one) => one[1]);
    const inMenu = [...html.matchAll(/class="kc-tool kc-menu-item" data-key="([^"]+)"/g)].map((one) => one[1]);
    expect(inMenu).toEqual(inColumn);
    expect(inMenu).toContain('Delete');
  });

  test('ends with a status row that shows the hint, the hole under the cursor and the zoom', () => {
    expect(html).toContain('<footer class="kc-status"><span class="cf-status"></span>');
    expect(html).toContain('<span class="kc-cell"></span>');
    expect(html).toContain('<span class="kc-zoom">100 %</span>');
  });

  test('offers zoom in, zoom out and fit at the top', () => {
    expect(html).toContain('class="kc-zoom-in"');
    expect(html).toContain('class="kc-zoom-out"');
    expect(html).toContain('class="kc-fit"');
  });

  test('uses a crosshair on the canvas, as KiCad does', () => {
    expect(html).toContain('.kc-canvas { flex: 1; min-width: 0; position: relative; overflow: hidden; cursor: crosshair; }');
  });

  test('keeps every hit layer live, since what is under the cursor is read from the stack', () => {
    expect(html).toContain('.cf-hits, .cf-marks, .cf-wire-hits { pointer-events: all; }');
    expect(html).toContain('.cf-wire-hit { stroke: transparent; stroke-width: 8; fill: none; }');
  });

  test('tells the script whether the fence can fold a wire', () => {
    expect(shell({ foldsWire: true })).toContain('data-folds="1"');
    expect(shell({ foldsWire: false })).toContain('data-folds="0"');
    expect(html).toContain('data-folds="0"');
  });

  test('keeps the long how-to out: the status row says what can be done now', () => {
    expect(html).not.toContain('図は書き換えのあと数秒で描き直ります');
    expect(html).not.toContain('class="cf-note"');
  });
});

describe('選んだものの印', () => {
  test('marks the selection without relying on what is inside the part', () => {
    // circuit のマップは記号なので中の線に色を付ければ分かるが、breadboard と
    // perfboard の .cf-chip は実物の姿そのもので、塗り替える線が無い。
    // **姿に依らない印** (光らせる・枠で囲む) が要る。
    expect(html).toContain('.cf-held {');
    expect(html).toContain('filter: drop-shadow');
    expect(html).toContain('.cf-held-box {');
  });

  test('lets the frame be clicked through, so the part under it stays grabbable', () => {
    expect(html).toMatch(/\.cf-held-box \{[^}]*pointer-events: none/s);
  });
});

describe('makeNonce', () => {
  test('is long enough to be worth calling a nonce', () => {
    expect(makeNonce().length).toBe(32);
  });

  test('uses only characters that are safe in an attribute', () => {
    expect(makeNonce()).toMatch(/^[a-z0-9]+$/);
  });

  test('is different each time', () => {
    expect(makeNonce()).not.toBe(makeNonce());
  });
});

describe('元に戻す・やり直す (自前の履歴)', () => {
  test('offers both buttons, off until there is something to undo', () => {
    expect(html).toContain('<button class="cf-undo" disabled');
    expect(html).toContain('<button class="cf-redo" disabled');
  });

  test('marks the page as keeping its own history, which the script reads', () => {
    expect(html).toContain('class="cf-own-undo"');
  });
});

describe('元に戻す・やり直す (VS Code に頼む)', () => {
  const native = shell({ undo: 'vscode' });

  test('does not claim its own history, so Ctrl+Z goes through to VS Code', () => {
    expect(native).not.toContain('cf-own-undo');
  });

  test('keeps the buttons on, since VS Code holds the history', () => {
    expect(native).toContain('<button class="cf-undo" title');
    expect(native).not.toContain('<button class="cf-undo" disabled');
  });
});

describe('フェンスを選ぶ', () => {
  test('puts the picker in the head, so a document with several fences can choose', () => {
    const picker = renderFencePicker([{ line: 3, title: 'RC' }, { line: 9, title: null }], 9);

    expect(shell({ view: { html: '', picker, issues: '' } })).toContain(`<p class="cf-fences">${picker}</p>`);
  });
});

describe('欄 (インスペクタ)', () => {
  test('has a field for each thing one line of the grammar carries', () => {
    for (const name of ['id', 'type', 'value', 'label']) {
      expect(html).toContain(`<input class="cf-field" name="${name}"`);
    }
  });

  test('offers the type names the fence handed it', () => {
    expect(html).toContain('<datalist id="cf-type-names"></datalist>');
    expect(html).toContain('list="cf-type-names"');
  });

  test('greys out a field the part has no room for', () => {
    expect(html).toContain('.cf-field:disabled { opacity: 0.4; }');
  });
});

describe('renderFencePicker', () => {
  test('is empty for a single fence, which leaves nothing to choose', () => {
    expect(renderFencePicker([{ line: 3, title: 'RC' }], 3)).toBe('');
  });

  test('names each fence by its title, or its line when it has none, and selects the current one', () => {
    const picker = renderFencePicker([{ line: 3, title: 'RC' }, { line: 9, title: null }], 9);

    expect(picker).toContain('<option value="3">RC (3 行目)</option>');
    expect(picker).toContain('<option value="9" selected>9 行目のフェンス</option>');
  });

  test('escapes the title, which comes from the fence', () => {
    expect(renderFencePicker([{ line: 3, title: '<b>' }, { line: 9, title: null }], 3)).toContain('&lt;b&gt;');
  });
});
