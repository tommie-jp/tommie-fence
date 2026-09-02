import { escapeMarkup } from 'fence-kit';

/**
 * マップのパネルの外側 (HTML の殻)。**純関数**なのでそのままテストに掛かる。
 *
 * 掴む物は 2 つ — 部品のチップと、節点の点。**同じ操作に混ぜない**ので
 * 持ち方を切り替えさせる (部品は 1 つだけ動いて接続が変わり、節点は交点ごと
 * 動いて接続が保たれる。掴む物が違えば意味も違う、で曖昧さが消える)。
 *
 * webview は拡張が渡した HTML をサニタイズしないので、フェンスから来た字は
 * すべて `renderMapHtml` 側でエスケープ済みのものだけを受け取る。
 * ここが足すのは殻とスクリプトだけで、外から来た字を素で入れる場所は無い。
 */

const STYLE = `
  body {
    font-family: var(--vscode-font-family); padding: 8px 12px;
    /* 記号の地。線の上に載る字の縁取りにも使う (図側から色名で引ける)。 */
    --cf-paper: var(--vscode-editor-background);
    --cf-ink: var(--vscode-foreground);
    --cf-node: var(--vscode-charts-blue, var(--vscode-focusBorder));
  }
  .cf-note { color: var(--vscode-descriptionForeground); margin: 6px 0; }
  .cf-map { width: 100%; height: auto; user-select: none; touch-action: none; }

  /* 見えるだけの層は当たり判定を持たない。 */
  .cf-grid, .cf-axes, .cf-wires { pointer-events: none; }
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

  .cf-chip, .cf-dot { cursor: grab; }
  .cf-held { cursor: grabbing; }
  .cf-held .cf-glyph, .cf-held .cf-glyph-line, .cf-held .cf-lead { stroke: var(--vscode-focusBorder); }
  .cf-held .cf-name { fill: var(--vscode-focusBorder); }
  .cf-held .cf-dot-mark { stroke: var(--vscode-focusBorder); stroke-width: 3; }

  /* 置き先は**掴んでいる間だけ**効かせる。いつも効かせると部品を掴めず、
     いつも切ると埋まった升へ置けない (同じ番地に置くのは正当な操作)。 */
  .cf-cell { fill: transparent; }
  .cf-hits { pointer-events: none; }
  body.cf-holding .cf-hits { pointer-events: all; }
  body.cf-holding .cf-cell:hover { fill: var(--vscode-editor-inactiveSelectionBackground); }

  /* 掴む物に合う層だけがクリックを取る。部品の升にも節点は立つので、
     どちらも掴めると掴んだつもりと違うものが動く。 */
  body:not(.cf-nodes) .cf-marks { pointer-events: none; opacity: 0.45; }
  body.cf-nodes .cf-parts { pointer-events: none; opacity: 0.5; }
  .cf-mode { margin: 0 0 8px; }
  .cf-mode label { margin-right: 12px; }
  .cf-history { margin: 0 0 8px; }
  .cf-history button {
    margin-right: 6px; padding: 2px 10px; border: 0; cursor: pointer; font: inherit; font-size: 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .cf-history button:disabled { opacity: 0.4; cursor: default; }
  .cf-status { margin-top: 8px; min-height: 1.4em; }
`;

/**
 * 掴んで置く操作。**ドラッグ中は選択の見た目だけを動かし、確定は放したとき
 * 1 回**。図の描き直しは TeX → SVG で 1 秒前後かかるので、追従させない。
 *
 * ドラッグは HTML5 の `draggable` ではなく**ポインタで見る** —
 * マップが SVG になり、`draggable` は SVG 要素に効かないため。
 */
const SCRIPT = `
  const vscode = acquireVsCodeApi();
  // 掴んでいるもの。**部品と節点は掴む物が違う**ので、種類ごと覚える。
  let held = null;
  // 押した場所。放した場所と近ければ「掴んだだけ」、離れていればドラッグ。
  let pressed = null;
  // 掴んだそのクリックで置かないための目印 (押した升がそのまま置き先になる)。
  let grabbing = false;

  const nodeMode = () => document.body.classList.contains('cf-nodes');
  const status = () => document.querySelector('.cf-status');

  /** 掴んでいる間だけ置き先の当たり判定を効かせる (CSS が見る目印)。 */
  const setHeld = (next) => {
    held = next;
    document.body.classList.toggle('cf-holding', next !== null);
    document.querySelectorAll('.cf-held').forEach((el) => el.classList.remove('cf-held'));
  };

  /** 掴んだものをエディタで光らせてもらう (拡張だけが文書を触れる)。 */
  const tell = (kind, id) => vscode.postMessage({ kind: 'select', what: kind, id: id });

  const release = () => {
    setHeld(null);
    tell();
    status().textContent = '';
  };

  const hold = (kind, id, element) => {
    setHeld({ kind: kind, id: id });
    tell(kind, id);
    element.classList.add('cf-held');
    const what = kind === 'node' ? id + ' の節点' : id;
    status().textContent = what + ' を掴みました。置きたい交点をクリックします (Esc で放す)';
  };

  const drop = (address) => {
    if (held === null) return;
    const what = held.kind === 'node' ? held.id + ' の節点' : held.id;
    vscode.postMessage(
      held.kind === 'node'
        ? { kind: 'moveNode', from: held.id, to: address }
        : { kind: 'move', part: held.id, to: address },
    );
    const said = what + ' を ' + address + ' へ…';
    setHeld(null);
    tell();
    status().textContent = said;
  };

  /** 掴める物。いまの持ち方に合うものだけを返す。 */
  const grabbable = (target) =>
    (nodeMode() ? target.closest('.cf-dot') : target.closest('.cf-chip'));

  const idOf = (element) => element.dataset.node ?? element.dataset.part;
  const kindOf = (element) => (element.classList.contains('cf-dot') ? 'node' : 'part');
  const cellAt = (target) => target.closest('.cf-cell');

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pressed = { x: event.clientX, y: event.clientY };
    grabbing = false;
    // **掴んでいる間は掴み直さない。** 埋まった升へ置くのは正当な操作なので、
    // 部品の上でも置きに行く。
    if (held !== null) return;
    const grab = grabbable(event.target);
    if (!grab) return;
    hold(kindOf(grab), idOf(grab), grab);
    grabbing = true;
  });

  document.addEventListener('pointerup', (event) => {
    const from = pressed;
    pressed = null;
    if (held === null || from === null) return;
    // その場で放したのは「掴んだ」だけ。置くのは次のクリック (クリック 2 回)。
    const moved = Math.abs(event.clientX - from.x) + Math.abs(event.clientY - from.y) > 6;
    if (!moved) return;
    const cell = cellAt(event.target);
    if (cell) drop(cell.dataset.address);
  });

  document.addEventListener('click', (event) => {
    // 掴んだクリックの続きでは置かない (押した升がそのまま置き先になる)。
    if (grabbing) {
      grabbing = false;
      return;
    }
    if (held === null) return;
    const cell = cellAt(event.target);
    if (cell) drop(cell.dataset.address);
  });

  /** 戻す・やり直すは拡張側の履歴に頼む (webview には文書が無い)。 */
  const step = (kind) => {
    const button = document.querySelector(kind === 'undo' ? '.cf-undo' : '.cf-redo');
    if (button && button.disabled) return;
    vscode.postMessage({ kind: kind });
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.cf-undo, .cf-redo');
    if (!button) return;
    step(button.classList.contains('cf-undo') ? 'undo' : 'redo');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      release();
      return;
    }
    // **パネルにフォーカスがあると VS Code の Ctrl+Z は届かない。**
    // ここで受けて、拡張側が覚えている履歴を巻き戻す。
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      step('undo');
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      step('redo');
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.kind === 'map') {
      document.querySelector('.cf-body').innerHTML = message.html;
      setHeld(null);
    }
    if (message.kind === 'status') status().textContent = message.text;
    if (message.kind === 'aim') aim(message.what, message.id);
    if (message.kind === 'history') {
      document.querySelector('.cf-undo').disabled = !message.canUndo;
      document.querySelector('.cf-redo').disabled = !message.canRedo;
    }
  });

  /**
   * エディタのカーソルが指しているものを光らせる (掴んだものをエディタで
   * 光らせるのと逆向き)。**掴む印とは別の class** — 持っているものと
   * 触れているものを取り違えない。
   */
  const aim = (what, id) => {
    document.querySelectorAll('.cf-aim').forEach((el) => el.classList.remove('cf-aim'));
    if (!what || id === undefined) return;
    const selector = what === 'part'
      ? '.cf-chip[data-part="' + CSS.escape(id) + '"]'
      : what === 'node'
        ? '.cf-dot[data-node="' + CSS.escape(id) + '"]'
        : '.cf-wire[data-line="' + CSS.escape(id) + '"]';
    document.querySelectorAll(selector).forEach((el) => el.classList.add('cf-aim'));
  };

  // 持ち方の切り替え。**掴む物が違えば意味も違う**ので、同じ操作に混ぜない
  // (部品は 1 つだけ動いて接続が変わる、節点は交点ごと動いて接続が保たれる)。
  document.addEventListener('change', (event) => {
    if (event.target.name !== 'cf-mode') return;
    document.body.classList.toggle('cf-nodes', event.target.value === 'node');
    release();
  });
`;

export type PanelHtmlOptions = {
  /** webview の CSP に載せる出所。 */
  readonly cspSource: string;
  /** スクリプトを許す 1 回きりの札。 */
  readonly nonce: string;
  /** `renderMapHtml` が組んだ升目 (エスケープ済み)。 */
  readonly mapHtml: string;
};

export const panelHtml = ({ cspSource, nonce, mapHtml }: PanelHtmlOptions): string =>
  `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">`
  + `<meta http-equiv="Content-Security-Policy" content="default-src 'none';`
  + ` style-src ${escapeMarkup(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeMarkup(nonce)}';">`
  + `<style>${STYLE}</style><title>部品と節点を動かす</title></head><body>`
  + `<p class="cf-mode">`
  + `<label><input type="radio" name="cf-mode" value="part" checked> 部品を動かす</label>`
  + `<label><input type="radio" name="cf-mode" value="node"> 節点を動かす</label></p>`
  + `<p class="cf-history">`
  + `<button class="cf-undo" disabled title="Ctrl+Z">元に戻す</button>`
  + `<button class="cf-redo" disabled title="Ctrl+Shift+Z">やり直す</button></p>`
  + `<p class="cf-note">クリックするか掴んで、置きたい交点で放します。`
  + `部品は 1 つだけ動いて接続が変わり、節点は交点ごと動いて接続は保たれます。`
  + `図は書き換えのあと数秒で描き直ります。</p>`
  + `<div class="cf-body">${mapHtml}</div>`
  + `<p class="cf-status"></p>`
  + `<script nonce="${escapeMarkup(nonce)}">${SCRIPT}</script></body></html>`;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * スクリプトを 1 回きりで許すための札。**擬似乱数では作らない** —
 * `Math.random` は予測できるので、札の意味が薄れる。
 * `crypto` はデスクトップと web のどちらの拡張ホストにもある。
 */
export const makeNonce = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
