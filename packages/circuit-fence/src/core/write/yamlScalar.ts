import { parse } from 'yaml';

/**
 * YAML に書く値。**そのまま書いて同じ字として読み戻せるときだけ素で書き**、
 * そうでなければ二重引用符で囲む — `true` `null` `1.10` `[x]` `@x` `a: b` は
 * 素で書くと別の値になるか、読めなくなる (コードレビューで出た)。
 */
export function yamlScalar(text: string): string {
  try {
    if (parse(text) === text && !text.includes('#')) return text;
  } catch {
    // 読めない字 (`@x` など) は囲む。
  }
  return JSON.stringify(text);
}
