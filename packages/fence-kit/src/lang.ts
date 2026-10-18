/**
 * 図の中に出る字 (部品表の見出し・凡例・読み値の題など) の言語。
 * 各フェンスは `options.lang` と YAML の最上位の `lang:` の両方で受け、`options.lang` を先にする。
 * 既定は `ja`。エラーと警告の文は言語によらず日本語のまま (図の字だけを切り替える)。
 */
export type Lang = 'ja' | 'en';

export const LANGS: readonly Lang[] = ['ja', 'en'];

export const DEFAULT_LANG: Lang = 'ja';

export const isLang = (value: unknown): value is Lang => value === 'ja' || value === 'en';

/** 言語ごとの字の表から今の言語の分を取る。 */
export const pickLang = <T>(lang: Lang, table: Readonly<Record<Lang, T>>): T => table[lang];

/** 指定が無ければ既定、あれば検査する。 */
export function resolveLang(option: unknown, yaml: unknown): { lang: Lang; error: string | null } {
  for (const value of [option, yaml]) {
    if (value === undefined || value === null) continue;
    if (isLang(value)) return { lang: value, error: null };
    return { lang: DEFAULT_LANG, error: `lang は ja か en です (${String(value)})` };
  }
  return { lang: DEFAULT_LANG, error: null };
}

/**
 * markdown-it の `env` から図の字の言語を読む (`md.render(text, { fenceLang: 'en' })`)。
 * 書かれていない・ja/en 以外なら undefined (YAML の `lang:` か既定に任せる)。
 */
export const langFromEnv = (env: unknown): Lang | undefined => {
  const value = typeof env === 'object' && env !== null ? (env as { fenceLang?: unknown }).fenceLang : undefined;
  return isLang(value) ? value : undefined;
};
