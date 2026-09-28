import { isScalar } from 'yaml';

/** YAML の節から字を取り出す (parseFence と math: の読みが共用する)。 */

export const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。YAML は `1.50` を `1.5` に
 * 読むので、解決後の値を名指すと行のどこにも無い綴りになる。
 */
export const writtenText = (node: unknown, source: string): string | null => {
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};


/**
 * 並びの形 (`{wave: …}` `{expr: …}`) の式の `,` は YAML の区切りに読まれ、式が途中で切れる
 * (`{wave: = max(ch1, 0V)}` は `= max(ch1` と `0V)` に割れる)。括弧の数が合わなければそれと見て、
 * 「知らない項目です: 0V)」ではなく引用で囲む直し方を言う。
 */
export const splitByComma = (text: string | null): boolean =>
  text !== null && (text.match(/\(/g) ?? []).length > (text.match(/\)/g) ?? []).length;

export const commaHint = (key: 'wave' | 'expr'): string =>
  `並びの形の式に , があると YAML の区切りに読まれます。式を引用で囲みます (例: {${key}: "${key === 'wave' ? '= max(ch1, 0V)' : 'max(ch1, ch2)'}"})`;
