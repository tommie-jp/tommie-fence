/**
 * プレビューの CSS と文法ファイルを 3 つのコアから写す表。
 *
 * **写すのは `.vsix` が拡張の中しか見ないから。** `markdown.previewStyles` と
 * `grammars` のパスは拡張の根からの相対で、node_modules の中を指すと
 * `file:` の依存が symlink で入ったときに詰め損ねる (`node-tikzjax` の
 * フォント CSS は本物の依存なので、あちらだけは node_modules を指してよい)。
 *
 * **原本は 3 つのコアのまま。** ここで直さない — 直すと 2 か所に分かれる。
 * 写しが古くなっていないことは `assets.test.ts` が見張る。
 */
export const ASSETS: readonly (readonly [string, string])[] = [
  ['../circuit-fence/media/circuit.css', 'media/circuit.css'],
  ['../breadboard-fence/media/breadboard.css', 'media/breadboard.css'],
  ['../perfboard-fence/media/perfboard.css', 'media/perfboard.css'],
  ['../circuit-fence/syntaxes/circuit-injection.json', 'syntaxes/circuit-injection.json'],
  ['../breadboard-fence/syntaxes/breadboard-injection.json', 'syntaxes/breadboard-injection.json'],
  ['../perfboard-fence/syntaxes/perfboard-injection.json', 'syntaxes/perfboard-injection.json'],
];
