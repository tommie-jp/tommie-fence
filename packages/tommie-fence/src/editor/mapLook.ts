import * as vscode from 'vscode';
import type { LookSource } from 'circuit-fence/editor';

/**
 * 升目の見た目の設定。**フェンスに書く `style:` とは別**で、あちらは図の話
 * (誰が開いても同じ図になる)。こちらは開く人の好みなので VS Code の設定に置く。
 */

/** 設定の綴り。`package.json` の `contributes.configuration` と同じ字にする。 */
const SECTION = 'circuitFence.map';

/**
 * 描くたびに設定を読む道。**作るときに 1 度読まない** — 設定は動かしている
 * 最中に変えられるので、1 度だけ読むと開き直すまで効かない。
 */
export const mapLook: LookSource = () => ({
  noteFrame: vscode.workspace.getConfiguration(SECTION).get<boolean>('noteFrame') === true,
});
