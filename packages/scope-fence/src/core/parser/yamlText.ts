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

