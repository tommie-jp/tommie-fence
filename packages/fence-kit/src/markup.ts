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
  text.replace(ILLEGAL, '').replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

export type Attributes = Record<string, string | number | undefined>;

const attributes = (attrs: Attributes): string =>
  Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeMarkup(String(value))}"`)
    .join('');

/**
 * 1 つの要素。**children は組み立て済みの markup として扱う**
 * (エスケープは値を入れる側の責任)。children を渡さなければ空要素で閉じる。
 */
export const element = (name: string, attrs: Attributes, children?: string): string =>
  children === undefined
    ? `<${name}${attributes(attrs)}/>`
    : `<${name}${attributes(attrs)}>${children}</${name}>`;
