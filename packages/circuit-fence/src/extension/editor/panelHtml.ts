import { escapeMarkup } from 'fence-kit';
import type { FenceEntry } from 'fence-kit';

/**
 * マップのパネルの外側 (HTML の殻と見た目)。**純関数**なのでそのまま
 * テストに掛かる。
 *
 * **中で動くものはここに書かない。** 掴む・置く・消すの決め事は
 * `webview/mapState.ts` (DOM も vscode も知らない純関数。node のテストに
 * 掛かる)、DOM を触る側は `webview/map.ts` にあり、esbuild が `dist/map.js`
 * へ束ねる。文字列に書いたスクリプトはテストが「その字が入っているか」しか
 * 見られず、道具・パレット・インスペクタで膨らむ一方だった。
 *
 * webview は拡張が渡した HTML をサニタイズしないので、フェンスから来た字は
 * すべて `renderMapHtml` 側でエスケープ済みのものだけを受け取る。
 * ここが足すのは殻だけで、外から来た字を素で入れる場所は無い。
 */

const STYLE = `
  body {
    font-family: var(--vscode-font-family); padding: 8px 12px;
    /* 記号の地。線の上に載る字の縁取りにも使う (図側から色名で引ける)。 */
    --cf-paper: var(--vscode-editor-background);
    --cf-ink: var(--vscode-foreground);
    --cf-node: var(--vscode-charts-blue, var(--vscode-focusBorder));
    --cf-bad: var(--vscode-editorError-foreground, #f14c4c);
    --cf-iffy: var(--vscode-editorWarning-foreground, #cca700);
  }
  .cf-note { color: var(--vscode-descriptionForeground); margin: 6px 0; }
  .cf-map { width: 100%; height: auto; user-select: none; touch-action: none; }

  /* 見えるだけの層は当たり判定を持たない。 */
  .cf-grid, .cf-axes, .cf-wires { pointer-events: none; }
  /* 配線を掴む層 (太い透明な線)。**「選ぶ」道具のときだけ**効かせる —
     ほかの道具のときに配線が割り込むと、掴んだつもりと違うものが選ばれる。 */
  .cf-wire-hit { stroke: transparent; stroke-width: 8; fill: none; cursor: pointer; }
  body:not([data-tool="select"]) .cf-wire-hits { pointer-events: none; }
  .cf-grid-dot { fill: var(--vscode-panel-border); }
  .cf-axis { fill: var(--vscode-descriptionForeground); font-size: 9px; }

  .cf-wire, .cf-lead { stroke: var(--cf-ink); stroke-width: 1.5; fill: none; }
  /* ピンの端は近似。実線で引くと持っていない精度を約束することになる。 */
  .cf-wire.cf-approx { stroke-dasharray: 3 3; opacity: 0.6; }

  .cf-glyph { fill: var(--cf-paper); stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-glyph-line { fill: none; stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-name { fill: var(--cf-ink); font-size: 10px; }
  .cf-mark { fill: var(--cf-ink); font-size: 9px; }
  .cf-dot-mark { fill: var(--cf-node); }
  .cf-dot-name { fill: var(--cf-node); font-size: 9px; }

  /* エディタのカーソルが指しているもの。掴んでいる印とは別の色にして、
     「いま触れているもの」と「持っているもの」を取り違えないようにする。 */
  .cf-aim .cf-glyph, .cf-aim .cf-glyph-line, .cf-aim .cf-lead,
  .cf-wire.cf-aim { stroke: var(--vscode-charts-orange, var(--cf-node)); stroke-width: 2.5; }
  .cf-aim .cf-name { fill: var(--vscode-charts-orange, var(--cf-node)); }
  .cf-aim .cf-dot-mark { stroke: var(--vscode-charts-orange, var(--cf-node)); stroke-width: 3; }

  /* 選んだもの。ドラッグの間もこの印のまま (見た目を 2 通りに増やさない)。 */
  .cf-chip, .cf-dot { cursor: grab; }
  .cf-held { cursor: grabbing; }
  .cf-held .cf-glyph, .cf-held .cf-glyph-line, .cf-held .cf-lead { stroke: var(--vscode-focusBorder); }
  .cf-held .cf-name { fill: var(--vscode-focusBorder); }
  .cf-held .cf-dot-mark { stroke: var(--vscode-focusBorder); stroke-width: 3; }
  .cf-wire.cf-held { stroke: var(--vscode-focusBorder); stroke-width: 2.5; }

  /* 読めなかった行に書かれたもの。**帯と絵で同じものを指す** — 行番号だけでは
     どの記号のことか、字と突き合わせないと分からない。お知らせには印を付けない
     (読めてはいるので、同じ赤で囲むと間違いに見える)。
     **触れている印・持っている印より後に置く** (同じ強さなら後が勝つ) —
     直そうとしてカーソルを置いた瞬間に赤が消えると、どれが悪いのか見失う。 */
  .cf-bad .cf-glyph, .cf-bad .cf-glyph-line, .cf-bad .cf-lead,
  .cf-wire.cf-bad { stroke: var(--cf-bad); }
  .cf-bad .cf-name { fill: var(--cf-bad); }

  /* 置き先は**ドラッグの間だけ**効かせる。いつも効かせると部品を掴めず、
     いつも切ると埋まった升へ置けない (同じ番地に置くのは正当な操作)。
     配線と部品は交点を指して置くので、そのあいだは押す前から効かせる。 */
  .cf-cell { fill: transparent; }
  .cf-hits { pointer-events: none; }
  body.cf-holding .cf-hits,
  body[data-tool="wire"] .cf-hits,
  body[data-tool="part"] .cf-hits { pointer-events: all; }
  body.cf-holding .cf-cell:hover,
  body[data-tool="wire"] .cf-cell:hover,
  body[data-tool="part"] .cf-cell:hover { fill: var(--vscode-editor-inactiveSelectionBackground); }
  /* 引きかけの配線の、押した交点。 */
  .cf-cell.cf-from { fill: var(--vscode-focusBorder); opacity: 0.35; }

  /* 道具に合う層だけがクリックを取る。部品の升にも節点は立つので、
     どちらも掴めると掴んだつもりと違うものが動く。 */
  body:not([data-tool="node"]) .cf-marks { pointer-events: none; opacity: 0.45; }
  body[data-tool="node"] .cf-parts { pointer-events: none; opacity: 0.5; }
  .cf-fences { margin: 0 0 8px; }
  .cf-fences select {
    font: inherit; font-size: 12px; padding: 2px 6px;
    background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
  }
  .cf-tools { margin: 0 0 8px; }
  .cf-tools label { margin-right: 12px; }
  .cf-tools kbd {
    font: inherit; font-size: 11px; padding: 0 4px; opacity: 0.8;
    border: 1px solid var(--vscode-panel-border); border-radius: 3px;
  }
  .cf-history { margin: 0 0 8px; }
  .cf-history button {
    margin-right: 6px; padding: 2px 10px; border: 0; cursor: pointer; font: inherit; font-size: 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .cf-history button:disabled { opacity: 0.4; cursor: default; }
  .cf-status { margin-top: 8px; min-height: 1.4em; }

  /* 選んだ部品の欄。**1 部品 = 1 行**なので、欄も 1 行に並ぶ。 */
  .cf-inspector { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0 0; }
  .cf-inspector label { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .cf-field {
    margin-left: 4px; padding: 1px 4px; font: inherit; font-size: 12px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  /* その部品には書けない欄 (1 端子の値、多端子の l=)。消さずに触れなくする。 */
  .cf-field:disabled { opacity: 0.4; }

  /* 部品のパレット。**折り畳める**ので、閉じていれば升目が全幅になる。 */
  .cf-palette { margin: 0 0 8px; }
  .cf-palette summary { cursor: pointer; user-select: none; }
  .cf-icons { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
  .cf-pick {
    padding: 2px 6px; border: 1px solid transparent; border-radius: 3px;
    background: none; color: inherit; font: inherit; font-size: 12px; cursor: pointer;
  }
  .cf-pick:hover { border-color: var(--vscode-focusBorder); }
  /* いま置こうとしているもの。道具の帯と同じ「いまの状態」の印。 */
  .cf-pick.cf-chosen {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-hoverBackground);
  }
  .cf-icons .cf-pick { padding: 2px; }
  .cf-icon { width: 34px; height: 24px; }
  .cf-icon .cf-mark { font-size: 9px; }
  .cf-search {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; padding: 2px 6px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  .cf-types { list-style: none; margin: 6px 0 0; padding: 0; max-height: 150px; overflow-y: auto; }
  .cf-types code { opacity: 0.7; font-size: 11px; }
  .cf-types li.cf-hidden { display: none; }

  /* 読めなかったところとお知らせ。**マップと同じ窓に出す** — 図の下の帯は
     プレビューにしか出ず、掴んでいる間は隠れていることが多い。 */
  .cf-issues { list-style: none; margin: 8px 0 0; padding: 0; font-size: 12px; }
  .cf-issue {
    margin-top: 2px; padding: 3px 8px;
    border-left: 3px solid var(--vscode-panel-border);
  }
  .cf-issue.cf-error {
    border-left-color: var(--cf-bad);
    background: var(--vscode-inputValidation-errorBackground, transparent);
  }
  .cf-issue.cf-notice {
    border-left-color: var(--cf-iffy);
    background: var(--vscode-inputValidation-warningBackground, transparent);
  }
  /* 行の分かっているものだけが押せる。分からないものに指を出すと、
     押しても何も起きない行ができる (renderIssues が data-line を付けない)。 */
  .cf-issue[data-line] { cursor: pointer; }
  .cf-issue[data-line]:hover { outline: 1px solid var(--vscode-focusBorder); }
  .cf-issue code {
    display: block; margin-top: 2px; white-space: pre-wrap;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .cf-issue mark {
    background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
    color: inherit;
  }
`;

/** 升目とその頭の一覧。セッションが組む (`Session.view`)。 */
export type MapViewHtml = {
  /** `renderMapHtml` が組んだ升目 (エスケープ済み)。 */
  readonly html: string;
  /** `renderFencePicker` が組んだ一覧 (エスケープ済み。1 つなら空)。 */
  readonly picker: string;
  /** `renderIssues` が組んだ帯 (エスケープ済み。言うことが無ければ空)。 */
  readonly issues: string;
};

/** フェンスが組む帯 (`FenceEditor.palette` / `typeNames` の答え)。 */
export type PanelChrome = {
  /** 置ける部品の一覧。 */
  readonly palette: string;
  /** 種類の名前の候補 (`datalist`)。欄の `list` が指す。 */
  readonly typeNames: string;
};

/** 欄の種類が引く候補の名札。**組む側と引く側で同じ綴りを使う**ための 1 か所。 */
export const TYPE_LIST_ID = 'cf-type-names';

export type PanelHtmlOptions = {
  /** webview の CSP に載せる出所。 */
  readonly cspSource: string;
  /** スクリプトを許す 1 回きりの札。 */
  readonly nonce: string;
  /** webview から見た `dist/map.js` の在り処 (`asWebviewUri` が作る)。 */
  readonly scriptUri: string;
  readonly view: MapViewHtml;
  /**
   * フェンスが組んだ帯。**殻は中身を知らない** — 置ける部品も種類の名前も
   * フェンスごとに違うので、`FenceEditor` から受け取ってそのまま入れる。
   */
  readonly chrome: PanelChrome;
  /**
   * 戻す・やり直すを誰が持つか。`own` はパネル (VS Code の undo が届かないので
   * 自前の履歴)、`vscode` はカスタムエディタ (タブの文書へ undo が届く)。
   */
  readonly undo: 'own' | 'vscode';
};

/**
 * フェンスの一覧。**2 つ以上のときだけ**出す (1 つなら選ぶものが無い)。
 * 題があれば題、無ければ行番号で呼ぶ。題はフェンスから来た字なのでエスケープする。
 */
export function renderFencePicker(fences: readonly FenceEntry[], line: number | null): string {
  if (fences.length < 2) return '';
  const options = fences.map((fence) => {
    const label = fence.title === null ? `${fence.line} 行目のフェンス` : `${fence.title} (${fence.line} 行目)`;
    return `<option value="${fence.line}"${fence.line === line ? ' selected' : ''}>${escapeMarkup(label)}</option>`;
  }).join('');
  return `<label>フェンス <select class="cf-fence">${options}</select></label>`;
}

export const panelHtml = ({ cspSource, nonce, scriptUri, view, chrome, undo }: PanelHtmlOptions): string => {
  const own = undo === 'own';
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none';`
    + ` style-src ${escapeMarkup(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeMarkup(nonce)}';">`
    + `<style>${STYLE}</style><title>部品と節点を動かす</title></head>`
    + `<body data-tool="select"${own ? ' class="cf-own-undo"' : ''}>`
    + `<p class="cf-fences">${view.picker}</p>`
    + `<p class="cf-tools">`
    + `<label><input type="radio" name="cf-tool" value="select" checked> 選ぶ <kbd>V</kbd></label>`
    + `<label><input type="radio" name="cf-tool" value="wire"> 配線 <kbd>W</kbd></label>`
    + `<label><input type="radio" name="cf-tool" value="node"> 節点 <kbd>N</kbd></label></p>`
    + chrome.palette
    + `<p class="cf-history">`
    + `<button class="cf-undo"${own ? ' disabled' : ''} title="Ctrl+Z">元に戻す</button>`
    + `<button class="cf-redo"${own ? ' disabled' : ''} title="Ctrl+Shift+Z">やり直す</button></p>`
    + `<p class="cf-note"><b>選ぶ</b>: ドラッグして置きたい交点で放すと動きます`
    + ` (クリックは選ぶだけ — エディタの書いてある場所が光ります)。`
    + `選んでから <b>R</b> で回し、<b>M</b> で反転、<b>Delete</b> で消します`
    + ` (配線は線をクリックして選びます)。`
    + `<b>配線</b>: 交点から交点へドラッグすると 1 本引きます`
    + ` (<b>Shift</b> を押しながら放すと先に横へ折ります)。`
    + `<b>節点</b>: 交点に来ているものが丸ごと動き、接続は保たれます。`
    + `<b>部品を置く</b>: パレットで選ぶと置く道具になります`
    + ` (2 端子は交点から交点へドラッグ、ほかは交点をクリック。<b>Esc</b> でやめます)。`
    + `部品を選ぶと下に<b>欄</b>が出ます (名前・種類・値・ラベル。`
    + `<b>F2</b> で名前へ、<b>Enter</b> か欄を離れたときに当たります)。`
    + `図は書き換えのあと数秒で描き直ります。</p>`
    + `<div class="cf-body">${view.html}</div>`
    + `<form class="cf-inspector" hidden>`
    + `<label>名前 <input class="cf-field" name="id" size="8" title="F2"></label>`
    + `<label>種類 <input class="cf-field" name="type" size="12" list="${TYPE_LIST_ID}"></label>`
    + `<label>値 <input class="cf-field" name="value" size="8"></label>`
    + `<label>ラベル <input class="cf-field" name="label" size="8"></label>`
    + `</form>${chrome.typeNames}`
    + `<div class="cf-band">${view.issues}</div>`
    + `<p class="cf-status"></p>`
    + `<script nonce="${escapeMarkup(nonce)}" src="${escapeMarkup(scriptUri)}"></script></body></html>`;
};

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * スクリプトを 1 回きりで許すための札。**擬似乱数では作らない** —
 * `Math.random` は予測できるので、札の意味が薄れる。
 * `crypto` はデスクトップと web のどちらの拡張ホストにもある。
 */
export const makeNonce = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
