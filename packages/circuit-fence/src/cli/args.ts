export type RenderCommand = {
  readonly targets: readonly string[];
  readonly outDir: string | null;
  /** 図を描かず、手元の LaTeX に渡す `.tex` だけを書き出すか。 */
  readonly emitTex: boolean;
};

export type ArgsResult =
  | { readonly ok: true; readonly value: RenderCommand }
  | { readonly ok: false; readonly message: string };

export const USAGE = `使い方:
  circuit-fence render <ファイルかディレクトリ...> [--out <出力先>] [--emit-tex]

  .md からは \`\`\`circuit フェンスを取り出し、.yaml はそのまま 1 枚の図として描きます。
  1 枚につき .tex と .svg を書き出します (.tex は LaTeX に渡せる完成した原稿)。
  --out を省くと入力と同じ場所に書き出します。

  --emit-tex は図を描かず、手元の xelatex 用の .tex だけを書き出します。
  日本語の値が通り、単位は siunitx で組み、オペアンプは本物の記号になります。
  プレビュー用の .tex と同じ名前なので、--out を分けて書き出してください。`;

const invalid = (message: string): ArgsResult => ({ ok: false, message });

export function parseArgs(argv: readonly string[]): ArgsResult {
  const [command, ...rest] = argv;
  if (command !== 'render') return invalid('render コマンドを指定します');

  const targets: string[] = [];
  let outDir: string | null = null;
  let emitTex = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--out') {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) return invalid('--out の後ろに出力先を書きます');
      outDir = value;
      index += 1;
    } else if (argument === '--emit-tex') {
      emitTex = true;
    } else if (argument.startsWith('-')) {
      return invalid(`知らないオプションです: ${argument}`);
    } else {
      targets.push(argument);
    }
  }

  if (targets.length === 0) return invalid('描画するファイルかディレクトリを指定します');

  return { ok: true, value: { targets, outDir, emitTex } };
}
