import { escapeMarkup } from 'fence-kit';

/**
 * マップのパネルの外側 (HTML の殻)。**純関数**なのでそのままテストに掛かる。
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
  .cf-status { margin-top: 8px; min-height: 1.4em; }
`;

/**
 * 掴んで置く操作。**ドラッグ中は選択の見た目だけを動かし、確定は放したとき
 * 1 回**。図の描き直しは TeX → SVG で 1 秒前後かかるので、追従させない。
 */
const SCRIPT = `
  const vscode = acquireVsCodeApi();
  let held = null;

  const status = () => document.querySelector('.cf-status');
  const clear = () => {
    document.querySelectorAll('.cf-held').forEach((el) => el.classList.remove('cf-held'));
    document.querySelectorAll('.cf-target').forEach((el) => el.classList.remove('cf-target'));
  };

  const hold = (id, chip) => {
    clear();
    held = id;
    chip.classList.add('cf-held');
    status().textContent = id + ' を掴みました。置きたい交点をクリックします (Esc で放す)';
  };

  const drop = (address) => {
    if (held === null) return;
    vscode.postMessage({ kind: 'move', part: held, to: address });
    status().textContent = held + ' を ' + address + ' へ…';
    held = null;
    clear();
  };

  document.addEventListener('click', (event) => {
    const cell = event.target.closest('.cf-cell');
    // **掴んでいるなら、部品の上でも置く。** 先にチップを見ると、
    // 埋まった升へは永久に置けない (同じ番地に置くのは接続を作る正当な操作)。
    if (held !== null && cell) {
      drop(cell.dataset.address);
      return;
    }
    const chip = event.target.closest('.cf-chip');
    if (chip) hold(chip.dataset.part, chip);
  });

  // ドラッグでも同じ道を通る。掴んだ時点と放した時点しか見ないので、
  // 途中で再コンパイルは起きない。
  document.addEventListener('dragstart', (event) => {
    const chip = event.target.closest('.cf-chip');
    if (!chip) return;
    hold(chip.dataset.part, chip);
    event.dataTransfer.setData('text/plain', chip.dataset.part);
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
      document.querySelectorAll('.cf-chip').forEach((chip) => { chip.draggable = true; });
      held = null;
    }
    if (message.kind === 'status') status().textContent = message.text;
  });

  document.querySelectorAll('.cf-chip').forEach((chip) => { chip.draggable = true; });
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
  + `<style>${STYLE}</style><title>部品を動かす</title></head><body>`
  + `<p class="cf-note">部品をクリックするか掴んで、置きたい交点で放します。`
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
