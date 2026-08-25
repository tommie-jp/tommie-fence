const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// HTML に載せられない文字 (タブ・改行・復帰以外の制御文字)。
// エスケープしても意味を持たないので捨てる。
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * 図の周りに置く文字列は必ずここを通す。VS Code の Markdown プレビューは
 * 拡張が返した HTML をサニタイズしないので、エスケープが唯一の防御になる。
 */
export const escapeHtml = (text: string): string =>
  text.replace(ILLEGAL, '').replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

export type Attributes = Record<string, string | number | undefined>;

const attributes = (attrs: Attributes): string =>
  Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeHtml(String(value))}"`)
    .join('');

/** children は組み立て済みの HTML として扱う (エスケープは値を入れる側の責任)。 */
export const element = (name: string, attrs: Attributes, children: string): string =>
  `<${name}${attributes(attrs)}>${children}</${name}>`;
