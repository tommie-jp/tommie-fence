import { escapeMarkup } from '../markup.ts';
import type { FenceEntry } from './fenceEditor.ts';

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
  /* KiCad の配置を借りる (52 の docs/17): 上に道具の帯、右に道具の列、左に属性、
     下に状態行。色は VS Code のテーマに従う (KiCad 自身もテーマで色を変える)。 */
  html, body { height: 100%; margin: 0; }
  body {
    font-family: var(--vscode-font-family); font-size: 12px;
    display: flex; flex-direction: column; overflow: hidden;
    color: var(--vscode-foreground, CanvasText); background: var(--vscode-editor-background, Canvas);
    /* 記号の地。線の上に載る字の縁取りにも使う (図側から色名で引ける)。 */
    --cf-paper: var(--vscode-editor-background, Canvas);
    --cf-ink: var(--vscode-foreground, CanvasText);
    --cf-node: var(--vscode-charts-blue, var(--vscode-focusBorder));
    --cf-bad: var(--vscode-editorError-foreground, #f14c4c);
    --cf-iffy: var(--vscode-editorWarning-foreground, #cca700);
    --cf-ghost: var(--vscode-charts-green, #4caf50);
    --kc-line: var(--vscode-panel-border, #444);
    /* **最後はシステム色で受ける。** 変数の無い所 (VS Code の外) で
       透けると、浮かぶものが図の上で読めなくなる。 */
    --kc-chrome: var(--vscode-sideBar-background, var(--vscode-editor-background, Canvas));
  }
  button { font: inherit; color: inherit; }
  kbd {
    font: inherit; font-size: 10px; padding: 0 3px; opacity: 0.75;
    border: 1px solid var(--kc-line); border-radius: 3px;
  }

  /* 上の帯: 戻す・やり直す、ズーム、フェンスの一覧。 */
  .kc-top {
    display: flex; align-items: center; gap: 6px; padding: 4px 8px;
    border-bottom: 1px solid var(--kc-line); background: var(--kc-chrome);
  }
  .kc-top .kc-group { display: flex; gap: 2px; padding-right: 6px; border-right: 1px solid var(--kc-line); }
  .kc-top button {
    min-width: 26px; height: 24px; padding: 0 6px; border: 1px solid transparent; border-radius: 3px;
    background: none; cursor: pointer;
  }
  .kc-top button:hover { border-color: var(--vscode-focusBorder); }
  .kc-top button:disabled { opacity: 0.35; cursor: default; }
  .kc-title { margin-left: auto; opacity: 0.7; }
  .cf-fences { margin: 0; }
  .cf-fences select {
    font: inherit; padding: 1px 4px;
    background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
  }

  /* 真ん中: 左に属性、図、右に道具の列。 */
  .kc-main { flex: 1; min-height: 0; display: flex; }
  .kc-props {
    width: 170px; flex: none; padding: 8px; overflow-y: auto;
    border-right: 1px solid var(--kc-line); background: var(--kc-chrome);
  }
  .kc-props h2 { margin: 0 0 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; opacity: 0.7; }
  .kc-props-hint { margin: 0; opacity: 0.7; line-height: 1.5; }
  .cf-inspector { display: flex; flex-direction: column; gap: 6px; margin: 0; }
  /* display: flex は hidden 属性の既定に勝つので、明示して隠す。 */
  .cf-inspector[hidden] { display: none; }
  .cf-inspector label { display: flex; flex-direction: column; gap: 2px; color: var(--vscode-descriptionForeground); }
  .cf-field {
    padding: 2px 4px; font: inherit;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  /* その部品には書けない欄 (1 端子の値、多端子の l=)。消さずに触れなくする。 */
  .cf-field:disabled { opacity: 0.4; }

  .kc-canvas { flex: 1; min-width: 0; position: relative; overflow: hidden; cursor: crosshair; }
  .cf-body { transform-origin: 0 0; will-change: transform; }
  /* 図の根 (どのフェンスの SVG も)。ズーム 1 で箱の幅に収める。 */
  .cf-body > svg { display: block; width: 100%; height: auto; user-select: none; touch-action: none; }
  .cf-note { margin: 8px; color: var(--vscode-descriptionForeground); }

  /* 右の道具の列 (KiCad の右ツールバー)。鍵を知らなくても押せる。 */
  .kc-tools {
    width: 64px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 6px 4px;
    border-left: 1px solid var(--kc-line); background: var(--kc-chrome); overflow-y: auto;
  }
  .kc-tool {
    display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 5px 2px;
    border: 1px solid transparent; border-radius: 4px; background: none; cursor: pointer;
  }
  .kc-tool .kc-glyph { font-size: 16px; line-height: 1; }
  .kc-tool kbd { font-size: 9px; }
  .kc-tool:hover { border-color: var(--vscode-focusBorder); }
  body[data-tool="select"] .kc-tool[data-tool="select"],
  body[data-tool="wire"] .kc-tool[data-tool="wire"],
  body[data-tool="place"] .kc-tool[data-tool="place"] {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  /* 右クリックの一覧。図の上に浮かぶ (webview には既定のメニューが無い)。 */
  .kc-menu {
    position: absolute; z-index: 2; margin: 0; padding: 3px; list-style: none; min-width: 150px;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background, var(--kc-chrome)));
    color: var(--vscode-menu-foreground, CanvasText);
    border: 1px solid var(--vscode-menu-border, var(--kc-line)); border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .kc-menu[hidden] { display: none; }
  .kc-menu li { display: block; }
  .kc-menu-item {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 3px 8px;
    flex-direction: row; border-radius: 3px;
  }
  .kc-menu-item .kc-glyph { width: 1.2em; text-align: center; }
  .kc-menu-item kbd { margin-left: auto; }
  .kc-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, inherit);
    border-color: transparent;
  }

  /* 部品を選ぶ窓 (KiCad の Choose Symbol)。図の上に浮かぶ。 */
  .kc-chooser {
    position: absolute; top: 8px; left: 8px; width: 260px; max-height: calc(100% - 16px);
    display: flex; flex-direction: column; cursor: default;
    background: var(--vscode-editorWidget-background, var(--kc-chrome));
    border: 1px solid var(--vscode-editorWidget-border, var(--kc-line)); border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .kc-chooser[hidden] { display: none; }
  .kc-chooser header {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px;
    border-bottom: 1px solid var(--kc-line); font-weight: 600;
  }
  .kc-chooser-close { margin-left: auto; border: 0; background: none; cursor: pointer; }
  .kc-chooser .cf-palette { padding: 6px 8px; overflow-y: auto; }
  .kc-chooser summary { display: none; }
  .cf-icons { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
  .cf-pick {
    padding: 2px 6px; border: 1px solid transparent; border-radius: 3px;
    background: none; color: inherit; cursor: pointer; text-align: left;
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
    width: 100%; box-sizing: border-box; font: inherit; padding: 3px 6px; margin: 0 0 4px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  .cf-types { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
  .cf-types li .cf-pick { width: 100%; }
  .cf-types code { opacity: 0.7; font-size: 11px; }
  .cf-types li.cf-hidden { display: none; }

  /* 帯: 読めなかったところとお知らせ。折り畳める。 */
  .kc-band { flex: none; max-height: 30%; overflow-y: auto; border-top: 1px solid var(--kc-line); background: var(--kc-chrome); }
  .kc-band summary { padding: 3px 8px; cursor: pointer; user-select: none; opacity: 0.8; }
  .cf-issues { list-style: none; margin: 0; padding: 0 8px 6px; }
  .cf-issue { margin-top: 2px; padding: 3px 8px; border-left: 3px solid var(--kc-line); }
  .cf-issue.cf-error {
    border-left-color: var(--cf-bad);
    background: var(--vscode-inputValidation-errorBackground, transparent);
  }
  .cf-issue.cf-notice {
    border-left-color: var(--cf-iffy);
    background: var(--vscode-inputValidation-warningBackground, transparent);
  }
  /* 行の分かっているものだけが押せる。 */
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

  /* 下の状態行 (KiCad のステータスバー): 左にいまできること、右に穴とズーム。 */
  .kc-status {
    flex: none; display: flex; align-items: center; gap: 12px; padding: 3px 8px; min-height: 1.5em;
    border-top: 1px solid var(--kc-line); background: var(--vscode-statusBar-background, var(--kc-chrome));
    color: var(--vscode-statusBar-foreground, inherit);
  }
  .cf-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kc-cell { min-width: 3em; font-family: var(--vscode-editor-font-family, monospace); }
  .kc-zoom { min-width: 3.5em; text-align: right; }

  /* ---- 図の中の層 ---- */
  /* 見えるだけの層は当たり判定を持たない。 */
  .cf-grid, .cf-axes, .cf-wires { pointer-events: none; }
  /* 掴む層。**全部いつも効かせる** — カーソルの下は elementsFromPoint で重なりごと
     読むので、道具ごとに層を切り替える必要が無い。 */
  .cf-hits, .cf-marks, .cf-wire-hits { pointer-events: all; }
  .cf-wire-hit { stroke: transparent; stroke-width: 8; fill: none; }
  .cf-cell { fill: transparent; }
  .cf-grid-dot { fill: var(--vscode-panel-border); }
  .cf-axis { fill: var(--vscode-descriptionForeground); font-size: 9px; }

  .cf-wire, .cf-lead { stroke: var(--cf-ink); stroke-width: 1.5; fill: none; }
  /* ピンの端は近似。実線で引くと持っていない精度を約束することになる。 */
  .cf-wire.cf-approx { stroke-dasharray: 3 3; opacity: 0.6; }

  .cf-glyph { fill: var(--cf-paper); stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-glyph-line { fill: none; stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-name { fill: var(--cf-ink); font-size: 10px; }
  .cf-pin { stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-pin-name { fill: var(--vscode-descriptionForeground); font-size: 8px; }
  .cf-mark { fill: var(--cf-ink); font-size: 9px; }
  .cf-dot-mark { fill: var(--cf-node); }
  .cf-dot-name { fill: var(--cf-node); font-size: 9px; }
  /* 節点の点は、鍵の対象になるときだけ目立たせる (いつも濃いと図がうるさい)。 */
  .cf-marks { opacity: 0.45; }

  /* カーソルの下で鍵の対象になるもの。薄く縁取る (押す前に何に効くかが分かる)。 */
  .cf-hover .cf-glyph, .cf-hover .cf-glyph-line, .cf-hover .cf-lead, .cf-hover .cf-pin,
  .cf-wire.cf-hover { stroke: var(--vscode-focusBorder); stroke-width: 2.5; opacity: 0.9; }
  .cf-hover .cf-dot-mark { stroke: var(--vscode-focusBorder); stroke-width: 3; }

  /* エディタのカーソルが指しているもの。掴んでいる印とは別の色。 */
  .cf-aim .cf-glyph, .cf-aim .cf-glyph-line, .cf-aim .cf-lead, .cf-aim .cf-pin,
  .cf-wire.cf-aim { stroke: var(--vscode-charts-orange, var(--cf-node)); stroke-width: 2.5; }
  .cf-aim .cf-name { fill: var(--vscode-charts-orange, var(--cf-node)); }
  .cf-aim .cf-dot-mark { stroke: var(--vscode-charts-orange, var(--cf-node)); stroke-width: 3; }

  /* 選んだもの。 */
  .cf-held .cf-glyph, .cf-held .cf-glyph-line, .cf-held .cf-lead,
  .cf-held .cf-pin { stroke: var(--vscode-focusBorder); stroke-width: 2.5; }
  .cf-held .cf-name { fill: var(--vscode-focusBorder); }
  .cf-held .cf-dot-mark { stroke: var(--vscode-focusBorder); stroke-width: 3; }
  .cf-wire.cf-held { stroke: var(--vscode-focusBorder); stroke-width: 2.5; }

  /* 読めなかった行に書かれたもの。**触れている印・持っている印より後に置く**。 */
  .cf-bad .cf-glyph, .cf-bad .cf-glyph-line, .cf-bad .cf-lead,
  .cf-wire.cf-bad { stroke: var(--cf-bad); }
  .cf-bad .cf-name { fill: var(--cf-bad); }

  /* 穴に触れているとき (配線・持ち物のあいだ) は穴を薄く見せる。 */
  body[data-tool="wire"] .cf-cell:hover, body.cf-carrying .cf-cell:hover {
    fill: var(--vscode-editor-inactiveSelectionBackground);
  }
  /* ゴースト: 置く・動かす先の穴。置けないときは赤。**触れている印より後に、
     同じ強さで置く** — カーソルの真下の穴 (まさに押そうとしている穴) が薄い色に
     負けると、1 穴で置く部品はゴーストがまったく見えない。 */
  body.cf-carrying .cf-cell.cf-ghost, .cf-cell.cf-ghost { fill: var(--cf-ghost); opacity: 0.45; }
  body.cf-carrying .cf-cell.cf-ghost-bad, .cf-cell.cf-ghost-bad { fill: var(--cf-bad); opacity: 0.45; }
  /* 配線の 1 点目。 */
  body[data-tool="wire"] .cf-cell.cf-from, .cf-cell.cf-from {
    fill: var(--vscode-focusBorder); opacity: 0.35;
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
  /** 配線を `Shift` で折れるか (`FenceEditor.foldsWire`)。案内文に出す。 */
  readonly foldsWire?: boolean;
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

/** 右の道具の列。**鍵と同じ一覧** — 押すと同じ鍵を押したことになる。 */
type ToolButton = {
  /** 状態を持つ道具 (押している間ハイライトする)。 */
  readonly tool?: string;
  readonly key: string;
  /** `Ctrl` を押しながらの鍵か (複製)。 */
  readonly modifier?: boolean;
  readonly glyph: string;
  readonly name: string;
  readonly kbd: string;
};

const TOOLS: readonly ToolButton[] = [
  { tool: 'select', key: 'Escape', glyph: '↖', name: '選ぶ', kbd: 'Esc' },
  { tool: 'place', key: 'a', glyph: '▣', name: '部品', kbd: 'A' },
  { tool: 'wire', key: 'w', glyph: '─', name: '配線', kbd: 'W' },
  { key: 'm', glyph: '✥', name: '動かす', kbd: 'M' },
  { key: 'g', glyph: '⤡', name: '引きずる', kbd: 'G' },
  { key: 'r', glyph: '↻', name: '回す', kbd: 'R' },
  { key: 'x', glyph: '⇔', name: '反転', kbd: 'X' },
  { key: 'd', modifier: true, glyph: '⧉', name: '複製', kbd: 'Ctrl+D' },
  { key: 'Delete', glyph: '✕', name: '消す', kbd: 'Del' },
];

/**
 * 右クリックの一覧。**道具の列と同じ表から組む** — 押せることが 2 通りの
 * 並びで違って見えると、鍵を覚える手がかりにならない。
 */
const renderMenu = (): string => `<menu class="kc-menu" hidden>${TOOLS.map((one) => (
  `<li><button type="button" class="kc-tool kc-menu-item" data-key="${one.key}"`
  + `${one.modifier === true ? ' data-modifier="1"' : ''}>`
  + `<span class="kc-glyph">${one.glyph}</span><span>${one.name}</span><kbd>${one.kbd}</kbd></button></li>`
)).join('')}</menu>`;

const renderTools = (): string => TOOLS.map((one) => (
  `<button type="button" class="kc-tool"${one.tool === undefined ? '' : ` data-tool="${one.tool}"`}`
  + ` data-key="${one.key}"${one.modifier === true ? ' data-modifier="1"' : ''}`
  + ` title="${one.name} (${one.kbd})">`
  + `<span class="kc-glyph">${one.glyph}</span><span>${one.name}</span><kbd>${one.kbd}</kbd></button>`
)).join('');

export const panelHtml = ({ cspSource, nonce, scriptUri, view, chrome, undo, foldsWire = false }: PanelHtmlOptions): string => {
  const own = undo === 'own';
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none';`
    + ` style-src ${escapeMarkup(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeMarkup(nonce)}';">`
    + `<style>${STYLE}</style><title>図を掴んで動かす</title></head>`
    + `<body data-tool="select" data-folds="${foldsWire ? '1' : '0'}"${own ? ' class="cf-own-undo"' : ''}>`
    + `<header class="kc-top">`
    + `<span class="kc-group">`
    + `<button class="cf-undo"${own ? ' disabled' : ''} title="元に戻す (Ctrl+Z)">↶</button>`
    + `<button class="cf-redo"${own ? ' disabled' : ''} title="やり直す (Ctrl+Shift+Z)">↷</button></span>`
    + `<span class="kc-group">`
    + `<button class="kc-zoom-out" title="縮小 (-)">−</button>`
    + `<button class="kc-zoom-in" title="拡大 (+)">＋</button>`
    + `<button class="kc-fit" title="全体 (Home)">⤢</button></span>`
    + `<p class="cf-fences">${view.picker}</p>`
    + `<span class="kc-title">ホイールで拡大・縮小、中ボタン (か Space + ドラッグ) で移動</span>`
    + `</header>`
    + `<div class="kc-main">`
    + `<aside class="kc-props"><h2>属性</h2>`
    + `<form class="cf-inspector" hidden>`
    + `<label>名前 <input class="cf-field" name="id" size="8" title="E"></label>`
    + `<label>種類 <input class="cf-field" name="type" size="12" list="${TYPE_LIST_ID}"></label>`
    + `<label>値 <input class="cf-field" name="value" size="8"></label>`
    + `<label>ラベル <input class="cf-field" name="label" size="8"></label>`
    + `</form>`
    + `<p class="kc-props-hint">部品をクリック (か <kbd>E</kbd>) すると、名前・種類・値・ラベルの欄が出ます。`
    + `<kbd>Enter</kbd> か欄を離れたときに行へ当たります。</p>`
    + `</aside>`
    + `<div class="kc-canvas"><div class="cf-body">${view.html}</div>`
    + renderMenu()
    + `<div class="kc-chooser" hidden><header>部品を置く <kbd>Enter</kbd> で先頭を持つ`
    + `<button type="button" class="kc-chooser-close" title="閉じる (Esc)">✕</button></header>`
    + chrome.palette
    + `</div></div>`
    + `<nav class="kc-tools">${renderTools()}</nav>`
    + `</div>`
    + `<details class="kc-band" open><summary>読めなかった行とお知らせ</summary>`
    + `<div class="cf-band">${view.issues}</div></details>`
    + `<footer class="kc-status"><span class="cf-status"></span>`
    + `<span class="kc-cell"></span><span class="kc-zoom">100 %</span></footer>`
    + chrome.typeNames
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
