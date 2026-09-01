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
  body { font-family: var(--vscode-font-family); padding: 8px 12px; }
  .cf-note { color: var(--vscode-descriptionForeground); margin: 6px 0; }
  .cf-map { border-collapse: collapse; user-select: none; }
  .cf-map th { color: var(--vscode-descriptionForeground); font-weight: 400; font-size: 11px; padding: 2px 4px; }
  .cf-cell {
    border: 1px solid var(--vscode-panel-border);
    width: 34px; height: 26px; padding: 0; text-align: center; vertical-align: middle;
  }
  .cf-cell.cf-far { background: var(--vscode-editor-inactiveSelectionBackground); }
  .cf-cell.cf-target { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; }
  .cf-chip {
    display: block; width: 100%; height: 100%; border: 0; cursor: grab;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font: inherit; font-size: 11px;
  }
  .cf-chip.cf-held { cursor: grabbing; outline: 2px solid var(--vscode-focusBorder); }
  .cf-dot {
    position: absolute; margin: -5px 0 0 -5px; width: 10px; height: 10px; padding: 0;
    border: 0; border-radius: 50%; cursor: grab; font-size: 0;
    background: var(--vscode-charts-blue, var(--vscode-focusBorder));
  }
  .cf-dot.cf-held { cursor: grabbing; outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  /* 節点を掴むときだけ点を前に出す。部品の升では点がチップに隠れるため。 */
  .cf-cell { position: relative; }
  body:not(.cf-nodes) .cf-dot { pointer-events: none; opacity: 0.45; }
  body.cf-nodes .cf-chip { pointer-events: none; opacity: 0.5; }
  .cf-mode { margin: 0 0 8px; }
  .cf-mode label { margin-right: 12px; }
  .cf-status { margin-top: 8px; min-height: 1.4em; }
`;

/**
 * 掴んで置く操作。**ドラッグ中は選択の見た目だけを動かし、確定は放したとき
 * 1 回**。図の描き直しは TeX → SVG で 1 秒前後かかるので、追従させない。
 */
const SCRIPT = `
  const vscode = acquireVsCodeApi();
  // 掴んでいるもの。**部品と節点は掴む物が違う**ので、種類ごと覚える。
  let held = null;

  const nodeMode = () => document.body.classList.contains('cf-nodes');

  const status = () => document.querySelector('.cf-status');
  const clear = () => {
    document.querySelectorAll('.cf-held').forEach((el) => el.classList.remove('cf-held'));
    document.querySelectorAll('.cf-target').forEach((el) => el.classList.remove('cf-target'));
  };

  const hold = (kind, id, element) => {
    clear();
    held = { kind: kind, id: id };
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
    status().textContent = what + ' を ' + address + ' へ…';
    held = null;
    clear();
  };

  /** 掴める物。いまの持ち方に合うものだけを返す。 */
  const grabbable = (target) =>
    (nodeMode() ? target.closest('.cf-dot') : target.closest('.cf-chip'));

  const idOf = (element) => element.dataset.node ?? element.dataset.part;
  const kindOf = (element) => (element.classList.contains('cf-dot') ? 'node' : 'part');

  document.addEventListener('click', (event) => {
    const cell = event.target.closest('.cf-cell');
    // **掴んでいるなら、部品の上でも置く。** 先にチップを見ると、
    // 埋まった升へは永久に置けない (同じ番地に置くのは接続を作る正当な操作)。
    if (held !== null && cell) {
      drop(cell.dataset.address);
      return;
    }
    const grab = grabbable(event.target);
    if (grab) hold(kindOf(grab), idOf(grab), grab);
  });

  // ドラッグでも同じ道を通る。掴んだ時点と放した時点しか見ないので、
  // 途中で再コンパイルは起きない。
  document.addEventListener('dragstart', (event) => {
    const grab = grabbable(event.target);
    if (!grab) return;
    hold(kindOf(grab), idOf(grab), grab);
    event.dataTransfer.setData('text/plain', idOf(grab));
  });
  document.addEventListener('dragover', (event) => {
    const cell = event.target.closest('.cf-cell');
    if (!cell || held === null) return;
    event.preventDefault();
    document.querySelectorAll('.cf-target').forEach((el) => el.classList.remove('cf-target'));
    cell.classList.add('cf-target');
  });
  document.addEventListener('drop', (event) => {
    const cell = event.target.closest('.cf-cell');
    if (!cell) return;
    event.preventDefault();
    drop(cell.dataset.address);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    held = null;
    clear();
    status().textContent = '';
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.kind === 'map') {
      document.querySelector('.cf-body').innerHTML = message.html;
      document.querySelectorAll('.cf-chip, .cf-dot').forEach((one) => { one.draggable = true; });
      held = null;
    }
    if (message.kind === 'status') status().textContent = message.text;
  });

  document.querySelectorAll('.cf-chip, .cf-dot').forEach((one) => { one.draggable = true; });

  // 持ち方の切り替え。**掴む物が違えば意味も違う**ので、同じ操作に混ぜない
  // (部品は 1 つだけ動いて接続が変わる、節点は交点ごと動いて接続が保たれる)。
  document.addEventListener('change', (event) => {
    if (event.target.name !== 'cf-mode') return;
    document.body.classList.toggle('cf-nodes', event.target.value === 'node');
    held = null;
    clear();
    status().textContent = '';
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
