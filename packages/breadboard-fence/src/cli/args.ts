/**
 * `render` は図を書き出す。`check` は**書かずに検証だけ**する。
 * 図を貼る前の下読みと CI のためのもので、LLM に書かせて直させるループでは
 * こちらのほうが回転が速い (書き出しの分だけ短い)。
 */
export type Command = 'render' | 'check';

export type CliCommand = {
  readonly command: Command;
  readonly targets: readonly string[];
  /** `check` では使わない。 */
  readonly outDir: string | null;
};

export type ArgsResult =
  | { readonly ok: true; readonly value: CliCommand }
  | { readonly ok: false; readonly message: string };

export const USAGE = `使い方:
  breadboard-fence render <ファイルかディレクトリ...> [--out <出力先>]
  breadboard-fence check <ファイルかディレクトリ...>

  .md からは \`\`\`breadboard フェンスを取り出し、.yaml はそのまま 1 枚の図として描きます。
  render は --out を省くと入力と同じ場所に .svg を書き出します。
  check は何も書かず、ネットリストと読めなかったところだけを出します
  (読めない行が 1 つでもあれば終了コードは 1)。`;

const invalid = (message: string): ArgsResult => ({ ok: false, message });

const isCommand = (word: string | undefined): word is Command => word === 'render' || word === 'check';

export function parseArgs(argv: readonly string[]): ArgsResult {
  const [command, ...rest] = argv;
  if (!isCommand(command)) return invalid('render か check を指定します');

  const targets: string[] = [];
  let outDir: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--out') {
      if (command === 'check') return invalid('check は何も書き出さないので --out は使えません');
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

  return { ok: true, value: { command, targets, outDir } };
}
