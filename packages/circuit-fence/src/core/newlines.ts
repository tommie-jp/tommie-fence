/**
 * 改行を `\n` に揃える。**外から来た字を読む前に必ず通す**。
 *
 * 中身は fence-kit にある (3 つのフェンスで同じもの)。回路図では、揃えないと
 * `% line N` の対応まで狂うので、読む前に必ず通す約束はここでも変わらない。
 */
export { normalizeNewlines } from 'fence-kit';
