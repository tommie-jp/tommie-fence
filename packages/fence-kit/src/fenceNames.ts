/**
 * フェンスの名前の綴り。**先頭が正の綴り、後ろが別名** (52 の docs/08)。
 *
 * ` ```breadboard ` を ` ```bread ` に短くした。落としたのは総称の `-board` の側で、
 * 識別子の `bread` / `perf` を残すと `circuit` と桁が揃う。**長い綴りは別名として
 * 期限を切らずに残す** — Markdown のフェンスは知らない言語名でもエラーにならず、
 * 旧い綴りは灰色のコードブロックとして黙って出る。別名を持つコストは配列の
 * 1 要素、落とすコストは見えない壊れ方。
 *
 * **表はここにだけ置く。** 切り出し (`extractFences`)・markdown-it のプラグイン・
 * 拡張の Problems と釦がみなここを引く。文法ファイル (`syntaxes/*-injection.json`)
 * だけは JSON なので引けず、拡張の試験 (`contributes.test.ts`) が突き合わせる。
 */
const SPELLINGS: readonly (readonly string[])[] = [
  ['bread', 'breadboard'],
  ['perf', 'perfboard'],
];

/**
 * その言語として読む綴りの全部 (正の綴りが先頭)。**どちらの綴りで引いても同じ組**
 * を返す — 旧い綴りで引く呼び手 (`extractFences(md, 'breadboard')`) も短い綴りを拾う。
 * 別名の無い言語 (`circuit`) はそれ 1 つ。
 */
export const fenceNames = (language: string): readonly string[] =>
  SPELLINGS.find((names) => names.includes(language)) ?? [language];

/**
 * フェンスの情報文字列 (` ```bread title=… ` の `bread title=…`) が、その言語か。
 * 見るのは**先頭の語だけ** — 後ろに語が続いてもよい。
 */
export const isFenceOf = (info: string, language: string): boolean =>
  fenceNames(language).includes(info.trim().split(/\s+/)[0] ?? '');
