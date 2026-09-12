import { describe, expect, test } from 'vitest';
import { makeNonce, panelHtml, renderFencePicker, renderSwatches } from './panelHtml.ts';

/** 帯はフェンスが組む (`FenceEditor`)。殻の試験では中身の分かる印を入れておく。 */
const CHROME = {
  palette: '<details class="cf-palette"></details>',
  typeNames: '<datalist id="cf-type-names"></datalist>',
  colorNames: '<datalist id="cf-color-names"></datalist>',
  swatches: '',
  foldsWire: false,
  fine: null,
  fineFor: 'all' as const,
};

const shell = (over: Partial<Parameters<typeof panelHtml>[0]> = {}): string => panelHtml({
  cspSource: 'vscode-resource:',
  nonce: 'abc123',
  scriptUri: 'vscode-resource://dist/map.js',
  view: { html: '<table></table>', picker: '', issues: '', chrome: CHROME },
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
    // 一覧は道具の列と同じ並びで始まり、**一覧にだけ出る道具**が後ろに付く。
    expect(inMenu.slice(0, inColumn.length)).toEqual(inColumn);
    expect(inMenu).toContain('Delete');
  });

  test('adds the copy to the menu only, since it needs a note under the cursor', () => {
    // 実機で「text を右メニューに『テキストコピー』を追加」。押せない相手の
    // ときに居座らないよう、道具の列には出さない。
    const inColumn = [...html.matchAll(/class="kc-tool"[^>]*data-key="([^"]+)"/g)].map((one) => one[1]);
    const inMenu = [...html.matchAll(/class="kc-tool kc-menu-item" data-key="([^"]+)"/g)].map((one) => one[1]);

    expect(inMenu).toContain('c');
    expect(inColumn).not.toContain('c');
    expect(html).toContain('テキストコピー');
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

  test('scrolls the canvas and keeps both bars, so the whole figure is reachable', () => {
    // **常に出す。** 図が収まっていても場所を空けておくと、拡大したときに
    // 幅が動かない (実機で頼まれた)。カーソルは KiCad と同じ十字。
    expect(html).toContain('.kc-canvas { flex: 1; min-width: 0; overflow: scroll; touch-action: none; cursor: crosshair; }');
  });

  test('keeps every hit layer live, since what is under the cursor is read from the stack', () => {
    expect(html).toContain('.cf-hits, .cf-marks, .cf-wire-hits { pointer-events: all; }');
    expect(html).toContain('.cf-wire-hit { stroke: transparent; stroke-width: 8; fill: none; }');
  });

  test('keeps the quarter box out of the hit stack, and colours it like the ghost', () => {
    // 端数の升は DOM に無いので、殻が小さい四角を足す (52 の docs/23)。掴めてはいけない。
    expect(html).toContain('.cf-fine-box { fill: var(--cf-ghost); opacity: 0.6; pointer-events: none; }');
    expect(html).toContain('.cf-fine-box-bad { fill: var(--cf-bad); }');
  });

  test('tells the script the abilities of the fence on the box that is swapped per language', () => {
    // **最初の HTML に焼かない。** 言語をまたぐと能力も変わる (52 の docs/19, 23)。
    const able = shell({ view: { html: '', picker: '', issues: '', chrome: { ...CHROME, foldsWire: true, fine: 4, fineFor: 'all' as const } } });

    expect(able).toContain('class="cf-chrome-palette" data-folds="1" data-fine="4"');
    expect(html).toContain('class="cf-chrome-palette" data-folds="0" data-fine=""');
    expect(html).not.toContain('<body data-tool="select" data-folds');
  });

  test('keeps the long how-to out: the status row says what can be done now', () => {
    expect(html).not.toContain('図は書き換えのあと数秒で描き直ります');
    expect(html).not.toContain('class="cf-note"');
  });
});

describe('道具の色', () => {
  test('paints the tools by what they do, not one colour each', () => {
    // 9 つに 9 色を配ると、色そのものが覚える手がかりにならない。
    // 増える / つなぐ / 動く / 向きが変わる / 減る、の 5 つに分ける。
    for (const [keys, color] of [
      [['a', 'd'], '--cf-adds'],
      [['w'], '--cf-joins'],
      [['m', 'g'], '--cf-moves'],
      [['r', 'x'], '--cf-turns'],
      [['Delete'], '--cf-drops'],
    ] as const) {
      for (const key of keys) expect(html).toContain(`.kc-tool[data-key="${key}"] .kc-glyph`);
      expect(html).toContain(`color: var(${color})`);
    }
  });

  test('does not take the icon colours from the theme charts, which go pale', () => {
    // グラフの系列色は明るいテーマで淡く出る (実機で「黄色は見にくい」)。
    // 白地でも黒地でも読める濃さに決め打ちする。
    for (const name of ['--cf-adds', '--cf-joins', '--cf-moves', '--cf-turns', '--cf-drops']) {
      expect(html).toMatch(new RegExp(`${name}: #[0-9a-f]{6};`));
    }
    expect(html).not.toContain('--vscode-charts-');
  });
});

describe('検査の釦', () => {
  // **釦と帯の行で印を分ける。** 帯の行は `renderIssues` が `cf-<kind>` を付けるので、
  // 釦を `cf-erc` にすると ERC の行を押したときに帯が畳まれる (押す先が混ざる)。
  test('does not take the class the ERC rows already use', () => {
    const shown = shell({ view: { html: '', picker: '', issues: '', chrome: CHROME, erc: { count: 3, open: false, html: '' } } });

    expect(shown).toContain('<button type="button" class="cf-erc-toggle"');
    expect(shown).not.toContain('class="cf-erc"');
  });

  test('says how many there are before it is opened', () => {
    const shown = shell({ view: { html: '', picker: '', issues: '', chrome: CHROME, erc: { count: 3, open: false, html: '' } } });

    expect(shown).toContain('>3</span>');
    expect(shown).toContain('aria-pressed="false"');
  });

  // 数えるものが無いフェンス (breadboard) で、常に 0 の釦を出さない。
  test('shows no button at all when the fence has no ERC', () => {
    const shown = shell();

    // CSS には印が出るので、**釦そのもの**が無いことを見る。
    expect(shown).not.toContain('<button type="button" class="cf-erc-toggle"');
  });
});

describe('道具の説明', () => {
  test('says what the tool acts on when the name alone does not tell them apart', () => {
    // 動かすと引きずるは形が同じ (どちらも持ち上げて 1 クリック) なので、
    // 名前と鍵だけでは一覧で見分けが付かない。相手を一言で言う。
    expect(html).toContain('動かす (M) — 部品だけが動く');
    expect(html).toContain('引きずる (G) — 穴に来ているものが丸ごと動く');
  });

  test('puts the same words on the right-click menu, so both places teach the same thing', () => {
    const menu = /<menu class="kc-menu"[^>]*>([\s\S]*?)<\/menu>/.exec(html)?.[1] ?? '';

    expect(menu).toContain('引きずる (G) — 穴に来ているものが丸ごと動く');
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

    expect(shell({ view: { html: '', picker, issues: '', chrome: CHROME } })).toContain(`<p class="cf-fences">${picker}</p>`);
  });

  test('adds a step button on each side, so the next fence is one click away', () => {
    // **一覧を開かずに隣へ行ける。** 図を 1 枚ずつ見ていくときの動きがこれ。
    const picker = renderFencePicker([{ line: 3, title: 'RC' }, { line: 9, title: null }], 3);

    expect(picker).toContain('data-step="prev"');
    expect(picker).toContain('data-step="next"');
  });

  test('adds ends to the steps, so the first and last fence are one click away', () => {
    // 実機で「フェンス項目の最初、最後に移動できるようにする。メディアプレーヤーの
    // アイコンを真似する」。並びも再生機と同じ ⏮ ◀ ▶ ⏭。
    const picker = renderFencePicker([{ line: 3, title: 'RC' }, { line: 9, title: null }], 3);
    const order = [...picker.matchAll(/data-step="(\w+)"/g)].map(([, name]) => name);

    expect(order).toEqual(['first', 'prev', 'next', 'last']);
  });

  test('draws the steps as solid triangles, which are easier to hit than chevrons', () => {
    // 実機で「`<`, `>` を押しやすいように ◀, ▶ にする」。端へ飛ぶ 2 つは
    // 再生機と同じ「棒 + 三角」。**絵文字ではなく字**で描く — 絵文字だと
    // 環境によって色付きの別の絵になる。
    const picker = renderFencePicker([{ line: 3, title: 'RC' }, { line: 9, title: null }], 3);

    expect(picker).toContain('>◀</button>');
    expect(picker).toContain('>▶</button>');
    expect(picker).toContain('>|◀</button>');
    expect(picker).toContain('>▶|</button>');
    expect(picker).not.toContain('‹');
  });

  test('leaves the buttons out when there is nothing to step to', () => {
    expect(renderFencePicker([{ line: 3, title: 'RC' }], 3)).toBe('');
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

  test('names each fence by its line first, then its title, and selects the current one', () => {
    // **行番号が先。** 上から順に並ぶ一覧なので、頭が揃っていると目で追える。
    const picker = renderFencePicker([{ line: 3, title: 'RC' }, { line: 9, title: null }], 9);

    expect(picker).toContain('<option value="3">003: RC</option>');
    expect(picker).toContain('<option value="9" selected>009: フェンス</option>');
  });

  test('pads the line to three digits, so the titles line up in the list', () => {
    // 実機で頼まれた形 —「行番号: 題」で、1000 行目までは 0 を先に付けて 3 桁。
    const picker = renderFencePicker(
      [{ line: 1, title: '図01' }, { line: 12, title: '図02' }, { line: 382, title: '図17' }],
      1,
    );

    expect(picker).toContain('>001: 図01<');
    expect(picker).toContain('>012: 図02<');
    expect(picker).toContain('>382: 図17<');
  });

  test('leaves a line past three digits as it is, since padding is only for lining up', () => {
    const picker = renderFencePicker([{ line: 1234, title: '図01' }, { line: 9, title: '図02' }], 9);

    expect(picker).toContain('>1234: 図01<');
  });

  test('escapes the title, which comes from the fence', () => {
    expect(renderFencePicker([{ line: 3, title: '<b>' }, { line: 9, title: null }], 3)).toContain('&lt;b&gt;');
  });
});

/**
 * 図の上に浮かぶもの (右クリックの一覧・部品の窓・囲みの帯) の置き場。
 *
 * **図の箱 (`kc-canvas`) の中には置かない。** あの箱は中身ごとスクロールする
 * ので、中に絶対配置すると図と一緒に流れ、スクロールしたぶんだけ押した所から
 * ずれる (実機で「右メニューが出ない」「範囲選択のシャドウが出ない」)。
 */
describe('浮かぶものの置き場', () => {
  /** 図の箱が閉じたところ。ここから後ろに出ていれば、一緒には流れない。 */
  const afterCanvas = (): string => html.slice(html.indexOf('</div>', html.indexOf('class="kc-canvas"')));

  test('puts the menu and the chooser after the scrolling canvas, inside the stage', () => {
    expect(html).toContain('<div class="kc-stage">');
    expect(afterCanvas()).toContain('class="kc-menu"');
    expect(afterCanvas()).toContain('class="kc-chooser"');
  });

  test('leaves the positioning to the stage, so the canvas can scroll under it', () => {
    expect(html).toContain('.kc-stage { flex: 1; min-width: 0; position: relative;');
    expect(html).not.toContain('.kc-canvas { flex: 1; min-width: 0; position: relative;');
  });
});

/**
 * 狭い画面 (スマホ) の畳み方。**図を主にする** — 属性 260px と道具 64px を
 * 据えたままだと、390px の画面では図に残る幅が 0 になる (52 の docs/32)。
 */
describe('狭いときの畳み方', () => {
  test('folds at 720px, so an iPad mini in portrait keeps the wide shape', () => {
    expect(html).toContain('@media (max-width: 720px)');
  });

  test('offers a button for the drawer, since the panel is no longer always out', () => {
    expect(html).toContain('class="kc-props-toggle"');
  });

  test('lays the drawer over the figure instead of pushing it aside', () => {
    // 押しのけると図の幅が変わって組み直され、見ていた所を見失う。
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toContain('.kc-props {');
    expect(narrow).toContain('position: absolute;');
  });

  test('turns the tool column into a strip along the bottom', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toContain('.kc-tools {');
    expect(narrow).toContain('flex-direction: row;');
  });

  /**
   * 縦並びでは図の高さが主軸になる。min-height の既定 (auto) は「中身より
   * 小さくしない」なので、図が SVG の高さのまま居座り、下の道具・帯・状態欄を
   * 画面の外へ押し出す。body は overflow: hidden なので、押し出された分は
   * **スクロールもできずに消える** (375x667 で道具が 36px 見切れた)。
   */
  /**
   * **道具は画面の下端に貼り付ける** (実機で「固定にする。スクロールで
   * 動かないようにする」)。iOS のタブ棒と同じ置き方で、帯を開いても図を
   * 流しても道具の場所が変わらない。流れから外した分は body の余白で空ける
   * (空けないと帯と状態欄が下に隠れる)。
   */
  test('pins the tool strip to the bottom edge, where a thumb can always find it', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));

    expect(narrow).toMatch(/\.kc-tools \{[^}]*position: fixed/);
    expect(narrow).toMatch(/\.kc-tools \{[^}]*bottom: 0/);
  });

  test('keeps room for the pinned strip, or the band and status hide under it', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));

    expect(narrow).toMatch(/body \{[^}]*padding-bottom: 54px/);
    expect(narrow).toMatch(/\.kc-tools \{[^}]*height: 54px/);
  });

  test('lets the figure shrink, so the bottom strip stays on the screen', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toContain('.kc-stage { min-height: 0; }');
  });

  test('stops one finger from scrolling the figure, since one finger means select', () => {
    expect(html).toContain('.kc-canvas { flex: 1; min-width: 0; overflow: scroll; touch-action: none;');
  });

  /**
   * **的の大きさと見た目の大きさは別物。** iOS のタブ棒は札が 10pt・絵が
   * 25pt と小さいまま、押せる面が 49pt ある。こちらも同じに分ける
   * (実機で「全体的にボタンやフォントが大きい」と言われた回)。
   * 字は iOS の刻みに載せ、密な道具の面なので地は註の 13px。
   */
  test('sets the text to what iOS calls a footnote, not to 15px', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toContain('body { font-size: 13px; }');
  });

  test('keeps every field at 16px, or iOS zooms the page when one is tapped', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toMatch(/\.cf-field, \.cf-search \{[^}]*font-size: 16px/);
  });

  /**
   * 道具は一番よく押すものなので、**絵と札を落としても面は 44px のまま**。
   * 一覧の行 (部品・色・右の一覧) も、隣を押すと別のものが置かれるので
   * 縮めない。落とすのは絵だけの釦 (上の帯) と、字。
   */
  test('keeps the 44px target on the tools while the glyph shrinks', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toMatch(/\.kc-tool \{[^}]*min-height: 44px/);
    expect(narrow).toMatch(/\.kc-tool \.kc-glyph \{ font-size: 17px/);
  });

  test('keeps the 44px row on the menu and the swatches, where a miss picks the wrong one', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toMatch(/\.cf-pick, \.cf-swatch, \.kc-menu-item \{[^}]*min-height: 44px/);
  });

  /**
   * 部品の一覧の行は引き出しの幅いっぱいなので、高さを詰めても押す面は
   * 36 x 300 ある (実機で「行間を狭くする」)。長押しの一覧と色見本は
   * 上の 44px のまま — 行が狭い・升が小さいので、詰めると隣を押す。
   */
  test('tightens the parts list rows, which are wide enough to keep their target', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toMatch(/\.cf-types \.cf-pick \{[^}]*min-height: 32px/);
  });

  test('drops the icon-only buttons to the 36px iOS uses for small controls', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toMatch(/\.kc-top button, \.kc-props-toggle \{[^}]*height: 36px/);
  });

  /**
   * **横向きは高さで畳む** (52 の docs/46)。横向きの iPhone は幅 667〜932px で
   * 720px の塊の両側にまたがるので、幅で決めると機種で姿が変わる。足りない
   * のは高さで、そちらは全機種 375〜430px と揃っている。
   */
  test('folds by height as well, so a phone on its side is not decided by width', () => {
    expect(html).toContain('@media (max-height: 500px)');
  });

  test('puts the tools back on the side when height is short, since width is spare', () => {
    const low = html.slice(html.indexOf('@media (max-height: 500px)'));

    expect(low).toMatch(/\.kc-main \{[^}]*flex-direction: row/);
    expect(low).toMatch(/\.kc-tools \{[^}]*grid-template-columns: repeat\(2, 1fr\)/);
  });

  /** 下端に貼ると、一番足りない高さを 54px 食う。 */
  test('unpins the bottom strip when lying down, where height is what is missing', () => {
    const low = html.slice(html.indexOf('@media (max-height: 500px)'));

    expect(low).toMatch(/body \{ padding-bottom: 0/);
    expect(low).toMatch(/\.kc-tools \{[^}]*position: static/);
  });

  /**
   * **後に書いてあるほうが勝つ。** SE の横向き (幅 667 かつ 高さ 375) は
   * 両方の塊に当たるので、順が意味を持つ。
   */
  test('lets the short-height rules win over the narrow-width ones', () => {
    expect(html.indexOf('@media (max-height: 500px)'))
      .toBeGreaterThan(html.indexOf('@media (max-width: 720px)'));
  });

  test('drops the key hints on the tools, since a phone has no keys', () => {
    const narrow = html.slice(html.indexOf('@media (max-width: 720px)'));
    expect(narrow).toContain('.kc-tool kbd { display: none; }');
    // 案内文の中の鍵は残す (消すと文が途切れる)。
    expect(narrow).not.toContain('kbd { display: none; }\n    .kc-props-hint');
  });

  /**
   * 実機の iPhone で出た 2 つ (52 の docs/40)。**どちらも iOS が
   * 自分の操作を割り込ませてくる**話で、こちらが断らないと止まらない。
   */
  test('stops the browser from zooming the map, so the tools stay put', () => {
    // 図の拡大は 2 本指で自分がやる。ブラウザにも拡大されると、道具や帯まで
    // 一緒に大きくなる (実機で「メニューアイコンは拡大対象にしないで」)。
    expect(html).toContain('html, body { touch-action: pan-x pan-y; }');
  });

  test('turns off the long-press callout and text selection', () => {
    // iOS は図の上でも「コピー / 調べる」を出し、字として選ぼうとする。
    expect(html).toContain('-webkit-touch-callout: none;');
    expect(html).toMatch(/body \{[^}]*user-select: none/s);
  });

  test('leaves the fields selectable, since they are there to be typed in', () => {
    expect(html).toMatch(/\.cf-field, \.cf-search \{[^}]*user-select: text/s);
  });

  test('says what the fingers do, next to what the mouse does', () => {
    expect(html).toContain('2 本指で移動');
    expect(html).toContain('長押しでメニュー');
  });
});

describe('配線の色見本', () => {
  test('draws a square in the real colour beside each name, so it reads without opening', () => {
    const html = renderSwatches(['red', 'black']);

    expect(html).toContain('data-color="red"');
    expect(html).toContain('background:#d33a2f');
    expect(html).toContain('<span class="cf-swatch-name">black</span>');
  });

  test('leaves out names it cannot colour, since an unpainted square says nothing', () => {
    expect(renderSwatches(['red', 'chartreuse'])).not.toContain('chartreuse');
  });

  test('draws nothing for a fence that writes no wire colours', () => {
    expect(renderSwatches([])).toBe('');
  });

  test('shows one square per colour, not one per spelling', () => {
    // `gray` と `grey` は同じ色。見本に両方出すと「どこが違うのか」になる。
    const html = renderSwatches(['gray', 'grey', 'red']);

    expect(html).toContain('data-color="gray"');
    expect(html).not.toContain('data-color="grey"');
    expect(html).toContain('data-color="red"');
  });
});
