import * as vscode from 'vscode';
import type { LookSource } from 'circuit-fence/editor';

/**
 * 升目の見た目の設定。**フェンスに書く `style:` とは別**で、あちらは図の話
 * (誰が開いても同じ図になる)。こちらは開く人の好みなので VS Code の設定に置く。
 */

/** 設定の綴り。`package.json` の `contributes.configuration` と同じ字にする。 */
const SECTION = 'tommieFence.map';

/**
 * 畳む前の綴り。**読み続ける** — 一度公開した名前は消さない (命令 id と同じ
 * 流儀。52 の docs/57)。`package.json` では `deprecationMessage` を付けて残す。
 */
const OLD_SECTION = 'circuitFence.map';

/**
 * 利用者がその鍵を**書いたか**。`get` では分からない — `contributes` に既定値を
 * 書いてあるので、書いていなくても既定値 (false) が返り、古い綴りへ落とせない。
 */
function isWritten(section: string, key: string): boolean {
  const found = vscode.workspace.getConfiguration(section).inspect(key);
  if (found === undefined) return false;
  return [
    found.globalValue, found.workspaceValue, found.workspaceFolderValue,
    found.globalLanguageValue, found.workspaceLanguageValue, found.workspaceFolderLanguageValue,
  ].some((value) => value !== undefined);
}

/** 新しい綴りを正とし、**そちらに何も書いていないときだけ**古い綴りを読む。 */
function setting(key: string): unknown {
  const useOld = !isWritten(SECTION, key) && isWritten(OLD_SECTION, key);
  return vscode.workspace.getConfiguration(useOld ? OLD_SECTION : SECTION).get(key);
}

/**
 * 描くたびに設定を読む道。**作るときに 1 度読まない** — 設定は動かしている
 * 最中に変えられるので、1 度だけ読むと開き直すまで効かない。
 */
export const mapLook: LookSource = () => ({
  noteFrame: setting('noteFrame') === true,
});
