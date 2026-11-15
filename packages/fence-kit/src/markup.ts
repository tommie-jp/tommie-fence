const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// タブ・改行・復帰以外の制御文字。XML 1.0 は載せられず、HTML でもエスケープに
// 意味が無い。1 つ混ざるだけで図全体がパースできなくなるので、捨てる。
const ILLEGAL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g');

/**
 * 図に載る文字列・図の周りに置く文字列は**必ずここを通す**。
 * VS Code の Markdown プレビューは拡張が返した HTML をサニタイズしないので、
 * **エスケープが唯一の防御**になる。
 *
 * XML と HTML で規則を分けていない。5 文字の実体参照と制御文字の切り捨ては
 * どちらでも同じで、分けると**片方だけ直す事故**が起きる
 * (実際、同じ実装が `escapeXml` と `escapeHtml` の 2 つの名前で複製されていた)。
 * 使う側は自分の文脈に合う名前で包んでよい。
 */
export const escapeMarkup = (text: string): string =>
  // **直す字が 1 つも無い値は、そのまま返す。** 図の字のほとんど (座標・色・class) はここで終わる。
  // 置き換えを 2 回通すのは、直す字があるときだけ (実測で図を描く時間の 1 割がここだった。52 の docs/162)。
  (NEEDS_WORK.test(text) ? text.replace(ILLEGAL, '').replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char) : text);

/** 直す字 (5 つの実体参照の字か、捨てる制御文字) を含むか。`g` を付けない (`test` が位置を覚えないように)。 */
const NEEDS_WORK = new RegExp('[&<>"\'\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]');

export type Attributes = Record<string, string | number | undefined>;

/**
 * 属性の並び。穴 1 つ・ピン 1 本ごとに呼ばれるので、配列を作らずに字を足していく
 * (前は `Object.entries` → `filter` → `map` → `join` で、要素 1 つごとに配列を 3 つ作っていた)。
 * 数はそのまま書く (数を字にした物に、直す字は入らない)。
 */
function attributes(attrs: Attributes): string {
  let out = '';
  for (const name of Object.keys(attrs)) {
    const value = attrs[name];
    if (value === undefined) continue;
    out += typeof value === 'number' ? ` ${name}="${value}"` : ` ${name}="${escapeMarkup(value)}"`;
  }
  return out;
}

/**
 * 1 つの要素。**children は組み立て済みの markup として扱う**
 * (エスケープは値を入れる側の責任)。children を渡さなければ空要素で閉じる。
 */
export const element = (name: string, attrs: Attributes, children?: string): string =>
  children === undefined
    ? `<${name}${attributes(attrs)}/>`
    : `<${name}${attributes(attrs)}>${children}</${name}>`;
