/**
 * 行の中の、項目 1 つ (`R1: resistor a1 a3`) を書いた範囲。
 *
 * **1 行 = 1 項目と決めつけると、フロー形式を壊す。** `parts: {R1: …, R2: …}` の
 * R2 の値を直すつもりで行まるごと組み直すと R1 が消える。欄を直す側は
 * この範囲の中だけを書き換える。
 *
 * YAML を読み直さずに字面から決める (fence-kit は YAML を知らない)。
 */
export type Entry = {
  /** 鍵の頭の桁。 */
  readonly start: number;
  /** 項目の終わりの桁 (区切りの `,` `}`・コメント・後ろの空白を含まない)。 */
  readonly end: number;
  /** フロー形式の中の項目か。ブロック形式なら行の終わりまでがその項目。 */
  readonly flow: boolean;
};

/**
 * `line` 行目 (1 始まり) の `id:` で始まる項目。`from` より前の鍵は見ない
 * (同じ名前が 1 行に 2 つあるとき、前の項目の続きから探すため)。
 * 鍵が見つからなければ null。
 */
export function entryOf(lines: readonly string[], line: number, id: string, from = 0): Entry | null {
  const text = lines[line - 1];
  if (text === undefined) return null;
  const body = uncommented(text);
  const start = keyColumn(body, id, from);
  if (start === null) return null;

  const flow = /[{,]$/.test(body.slice(0, start).trimEnd()) || (body.slice(0, start).trim() === '' && continues(lines, line));
  // **ブロック形式は区切りで切らない。** 値の `1,000` はプレーンスカラーの字。
  const end = flow ? flowEnd(body, start) : body.length;
  return { start, end: start + body.slice(start, end).trimEnd().length, flow };
}

/**
 * 名前の続きでなく、`:` の後ろが空白か行の終わりの `id:`。YAML の鍵は
 * `:` のあとに空白が要るので、値の中の `R2:b` は鍵ではない。
 */
function keyColumn(body: string, id: string, from: number): number | null {
  const key = `${id}:`;
  for (let at = body.indexOf(key, from); at !== -1; at = body.indexOf(key, at + 1)) {
    if (!/[\w.-]/.test(body[at - 1] ?? ' ') && /^(\s|$)/.test(body.slice(at + key.length))) return at;
  }
  return null;
}

/** 前の行 (空行とコメントだけの行は飛ばす) が `,` か `{` で終わる = フロー形式の続き。 */
function continues(lines: readonly string[], line: number): boolean {
  for (let index = line - 2; index >= 0; index -= 1) {
    const before = uncommented(lines[index] ?? '').trimEnd();
    if (before !== '') return /[{,]$/.test(before);
  }
  return false;
}

/** 引用符・入れ子の括弧の外で、最初の `,` `}` `]` の桁。無ければ行の終わり。 */
function flowEnd(body: string, start: number): number {
  let depth = 0;
  for (let at = start; at < body.length; at += 1) {
    const char = body[at] as string;
    if (opensQuote(body, at)) {
      at = closingQuote(body, at);
    } else if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']' || char === ',') {
      if (depth === 0) return at;
      if (char !== ',') depth -= 1;
    }
  }
  return body.length;
}

/** 行末コメントを落とした字。引用符の中の `#` はコメントではない。 */
function uncommented(text: string): string {
  for (let at = 0; at < text.length; at += 1) {
    if (opensQuote(text, at)) at = closingQuote(text, at);
    else if (text[at] === '#' && (at === 0 || /\s/.test(text[at - 1] as string))) return text.slice(0, at);
  }
  return text;
}

/**
 * 引用符が始まる桁か。**語の頭の引用符だけ** — `R'` の `'` は字の一部で、
 * 引用符と取ると後ろの `,` を飲み込んで隣の項目まで範囲に入れてしまう。
 */
const opensQuote = (text: string, at: number): boolean =>
  (text[at] === '"' || text[at] === "'") && (at === 0 || /[\s{[,:]/.test(text[at - 1] as string));

/** 閉じる引用符の桁 (閉じていなければ行の終わり)。`''` と `\"` は閉じない。 */
function closingQuote(text: string, open: number): number {
  const quote = text[open];
  for (let at = open + 1; at < text.length; at += 1) {
    if (quote === '"' && text[at] === '\\') { at += 1; continue; }
    if (text[at] !== quote) continue;
    if (quote === "'" && text[at + 1] === "'") { at += 1; continue; }
    return at;
  }
  return text.length;
}
