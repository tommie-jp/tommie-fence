import { readFileSync } from 'node:fs';

/**
 * **日本語の画面の VS Code** を真似る訳し手。`vscode.l10n.t` の代わりに試験が使う。
 *
 * 元の文 (英語) を `l10n/bundle.l10n.ja.json` で引き、`{0}` を埋める。
 * **表に無い文は投げる** — 訳し忘れた文は、日本語の画面でも英語のまま出る。
 * 試験が日本語の字を見ている所では、そのまま訳し忘れの見張りになる。
 */
const bundle: Readonly<Record<string, string>> = JSON.parse(
  readFileSync(new URL('../l10n/bundle.l10n.ja.json', import.meta.url), 'utf8'),
);

export function tJa(message: string, ...args: readonly (string | number | boolean)[]): string {
  const translated = bundle[message];
  if (translated === undefined) throw new Error(`l10n/bundle.l10n.ja.json に訳がありません: ${message}`);
  return translated.replace(/\{(\d+)\}/g, (whole, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? whole : String(value);
  });
}
