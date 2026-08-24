export type RenderCommand = {
  readonly targets: readonly string[];
  readonly outDir: string | null;
};

export type ArgsResult =
  | { readonly ok: true; readonly value: RenderCommand }
  | { readonly ok: false; readonly message: string };

export const USAGE = `使い方:
  breadboard-fence render <ファイルかディレクトリ...> [--out <出力先>]

  .md からは \`\`\`breadboard フェンスを取り出し、.yaml はそのまま 1 枚の図として描きます。
  --out を省くと入力と同じ場所に .svg を書き出します。`;

const invalid = (message: string): ArgsResult => ({ ok: false, message });

export function parseArgs(argv: readonly string[]): ArgsResult {
  const [command, ...rest] = argv;
  if (command !== 'render') return invalid('render コマンドを指定します');

  const targets: string[] = [];
  let outDir: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--out') {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) return invalid('--out の後ろに出力先を書きます');
      outDir = value;
      index += 1;
    } else if (argument.startsWith('-')) {
      return invalid(`知らないオプションです: ${argument}`);
    } else {
      targets.push(argument);
    }
  }

  if (targets.length === 0) return invalid('描画するファイルかディレクトリを指定します');

  return { ok: true, value: { targets, outDir } };
}
