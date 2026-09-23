import type { FenceError, RenderResult } from '../core/index.ts';

/**
 * CLI が標準エラーに言うこと。**プレビューの帯と同じ並び**で、ERC も含める。
 *
 * **読めなかったものを先に出す。** ERC と当たり判定は足 1 本につき 1 件出るので、
 * 行順のままだと本物のエラーが流れていく (帯と同じ理由)。
 *
 * **ERC はコアが `notices` と分けて返す** (editor の「検査 N」の釦のため)。
 * 分けたときに CLI がここを通っていなかったので、`check` が ERC を黙って
 * 落としていた。結果をまるごと受け取り、言うものを 1 か所で決める。
 */
export const saidOf = ({ errors, notices, erc }: Pick<RenderResult, 'errors' | 'notices' | 'erc'>): readonly FenceError[] =>
  [...errors, ...notices, ...erc];
