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
  test('puts the map inside', () => {
    expect(html).toContain('<table></table>');
  });

  test('locks the webview down: nothing loads from outside, only our script runs', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123"');
  });

  test('loads the script as a bundled file, so what it does can be tested', () => {
    // 文字列に書いたスクリプトは「その字が入っているか」しか試せない。
    // 中身は webview/mapState.ts にあり、node のテストに掛かっている。
    expect(html).toContain('src="vscode-resource://dist/map.js"');
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  test('escapes what it is given, so a source cannot break out of an attribute', () => {
    const sneaky = shell({ cspSource: '"><script>x</script>', nonce: 'n' });

    expect(sneaky.match(/<script/g)).toHaveLength(1);
    expect(sneaky).toContain('&quot;&gt;&lt;script&gt;');
  });

  test('tells the reader how to use it', () => {
    expect(html).toContain('<b>選ぶ</b>: ドラッグして置きたい交点で放す');
    expect(html).toContain('クリックは選ぶだけ');
  });

  test('says what the keys do, so they can be found without the docs', () => {
    expect(html).toContain('<b>R</b> で回し');
    expect(html).toContain('<b>Delete</b> で消します');
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

describe('道具の帯', () => {
  test('offers the three tools, with the key each answers to', () => {
    expect(html).toContain('value="select" checked');
    expect(html).toContain('value="wire"');
    expect(html).toContain('value="node"');
    expect(html).toContain('<kbd>W</kbd>');
  });

  test('starts on picking, and says so on the body for the CSS to read', () => {
    expect(html).toContain('<body data-tool="select"');
  });

  test('lets only what the tool grabs take the click', () => {
    // 部品の升にも節点は立つ。どちらも掴めると、掴んだつもりと違うものが動く。
    expect(html).toContain('body:not([data-tool="node"]) .cf-marks { pointer-events: none;');
    expect(html).toContain('body[data-tool="node"] .cf-parts { pointer-events: none;');
    expect(html).toContain('body:not([data-tool="select"]) .cf-wire-hits { pointer-events: none; }');
  });

  test('turns the crossings on for the wire and part tools before anything is pressed', () => {
    // 配線も部品も交点を指して置く。押した時点で升を読めないと始まりが決まらない。
    expect(html).toContain('body[data-tool="wire"] .cf-hits,\n  body[data-tool="part"] .cf-hits { pointer-events: all; }');
    expect(html).toContain('.cf-cell.cf-from');
  });

  test('says what each tool does', () => {
    expect(html).toContain('<b>配線</b>: 交点から交点へドラッグ');
    expect(html).toContain('<b>Shift</b> を押しながら放すと先に横へ折ります');
  });
});

describe('置き先の当たり判定', () => {
  test('turns the drop targets on only while something is held', () => {
    // いつも効かせると部品を掴めず、いつも切ると埋まった升へ置けない。
    expect(html).toContain('.cf-hits { pointer-events: none; }');
    expect(html).toContain('body.cf-holding .cf-hits,');
  });

  test('lays a fat invisible line over each wire, since 1.5px is too thin to hit', () => {
    expect(html).toContain('.cf-wire-hit { stroke: transparent; stroke-width: 8;');
    // 箱から出る足。向きを書いたことが目で分かる唯一の手掛かり。
    expect(html).toContain('.cf-pin { stroke: var(--cf-ink);');
  });
});

describe('元に戻す・やり直す (自前の履歴)', () => {
  test('offers both buttons, off until there is something to undo', () => {
    expect(html).toContain('<button class="cf-undo" disabled');
    expect(html).toContain('<button class="cf-redo" disabled');
  });

  test('marks the page as keeping its own history, which the script reads', () => {
    // パネルにフォーカスがあると activeTextEditor が無く、VS Code の undo は届かない。
    expect(html).toContain('<body data-tool="select" class="cf-own-undo">');
  });
});

describe('元に戻す・やり直す (VS Code に頼む)', () => {
  const native = shell({ undo: 'vscode', nonce: 'n' });

  test('does not claim its own history, so Ctrl+Z goes through to VS Code', () => {
    expect(native).not.toContain('cf-own-undo"');
  });

  test('keeps the buttons on, since VS Code holds the history', () => {
    expect(native).toContain('<button class="cf-undo" title=');
    expect(native).not.toContain('<button class="cf-undo" disabled');
  });
});

describe('フェンスを選ぶ', () => {
  test('puts the picker in the head, so a document with several fences can choose', () => {
    const many = shell({ view: { html: '', picker: '<select class="cf-fence"></select>', issues: '' } });

    expect(many).toContain('<p class="cf-fences"><select class="cf-fence"></select></p>');
  });
});

describe('部品のパレット', () => {
  test('puts what the fence handed it into the head', () => {
    // **中身は殻の持ち物ではない** (置ける部品はフェンスごとに違う)。
    // 組むのは `FenceEditor.palette`。ここは受け取って入れるだけ。
    expect(html).toContain('<details class="cf-palette"></details>');
  });

  test('shows which one is being placed, like the tool band shows the tool', () => {
    expect(html).toContain('.cf-pick.cf-chosen');
  });

  test('gives the search box a place to hide rows', () => {
    expect(html).toContain('.cf-types li.cf-hidden { display: none; }');
  });

  test('says how placing works', () => {
    expect(html).toContain('<b>部品を置く</b>: パレットで選ぶと置く道具になります');
  });
});

describe('欄 (インスペクタ)', () => {
  test('has a field for each thing one line of the grammar carries', () => {
    // 1 部品 = 1 行なので、欄もその行の綴りに 1 対 1 で並ぶ。
    expect(html).toContain('<input class="cf-field" name="id"');
    expect(html).toContain('<input class="cf-field" name="type"');
    expect(html).toContain('<input class="cf-field" name="value"');
    expect(html).toContain('<input class="cf-field" name="label"');
  });

  test('stays out of the way until a part is picked', () => {
    expect(html).toContain('<form class="cf-inspector" hidden>');
  });

  test('offers the type names the fence handed it', () => {
    // 種類の名前もフェンスの持ち物。欄の `list` と同じ名札を指していればよい。
    expect(html).toContain('<datalist id="cf-type-names"></datalist>');
    expect(html).toContain('list="cf-type-names"');
  });

  test('greys out a field the part has no room for', () => {
    expect(html).toContain('.cf-field:disabled');
  });

  test('says how the form is used', () => {
    expect(html).toContain('<b>F2</b> で名前へ');
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

describe('印の色', () => {
  test('lights what the editor cursor points at in its own colour', () => {
    // 掴んでいる印と同じ色にすると、持っているものと触れているものを取り違える。
    expect(html).toContain('.cf-aim .cf-glyph');
    expect(html).toContain('cf-wire.cf-aim');
  });

  test('marks what is held, wires included', () => {
    expect(html).toContain('.cf-held .cf-glyph');
    expect(html).toContain('.cf-wire.cf-held');
  });

  test('keeps the error mark on when the cursor points at that symbol', () => {
    // 同じ強さの規則は後に書いたほうが勝つ。読めなかったのは文書の事実なので、
    // 触れている印・持っている印 (どちらも一時のもの) より後に置く。
    expect(html.indexOf('.cf-bad .cf-glyph')).toBeGreaterThan(html.indexOf('.cf-aim .cf-glyph'));
    expect(html.indexOf('.cf-bad .cf-glyph')).toBeGreaterThan(html.indexOf('.cf-held .cf-glyph'));
  });
});

describe('読めなかったところの帯', () => {
  const band = '<ul class="cf-issues"><li class="cf-issue cf-error" data-line="5">5 行目</li></ul>';

  test('puts the band under the map, where the editing is happening', () => {
    // 図の下の帯はプレビューにしか出ない。掴んでいる間はプレビューが隠れている。
    const withIssues = shell({ view: { html: '<svg></svg>', picker: '', issues: band } });

    expect(withIssues).toContain(`<div class="cf-band">${band}</div>`);
    expect(withIssues.indexOf('cf-band')).toBeGreaterThan(withIssues.indexOf('class="cf-body"'));
  });

  test('keeps the band empty when the fence reads cleanly', () => {
    expect(html).toContain('<div class="cf-band"></div>');
  });

  test('offers no pointer on a row that carries no line', () => {
    expect(html).toContain('.cf-issue[data-line] { cursor: pointer;');
  });

  test('tells errors and notices apart, since a notice is not a mistake', () => {
    expect(html).toContain('.cf-issue.cf-error');
    expect(html).toContain('.cf-issue.cf-notice');
  });
});
