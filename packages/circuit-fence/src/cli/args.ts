export type RenderCommand = {
  /**
   * `render` は図を書き出す。`check` は**何も書き出さず**、
   * 検証とネットリストだけを出す (WASM の TeX を回さないので速い)。
   */
  readonly command: 'render' | 'check';
  readonly targets: readonly string[];
  readonly outDir: string | null;
  /** 図を描かず、手元の LaTeX に渡す `.tex` だけを書き出すか。 */
  readonly emitTex: boolean;
};

/** 版を答えるだけ。図も検証もしないので、渡すものが何も無い。 */
export type VersionCommand = { readonly command: 'version' };

export type Command = RenderCommand | VersionCommand;

export type ArgsResult =
  | { readonly ok: true; readonly value: Command }
  | { readonly ok: false; readonly message: string };

export const USAGE = `使い方:
  circuit-fence render <ファイルかディレクトリ...> [--out <出力先>] [--emit-tex]
  circuit-fence check  <ファイルかディレクトリ...>
  circuit-fence --version

  .md からは \`\`\`circuit フェンスを取り出し、.yaml はそのまま 1 枚の図として描きます。
  1 枚につき .tex と .svg を書き出します (.tex は LaTeX に渡せる完成した原稿)。
  --out を省くと入力と同じ場所に書き出します。

  --emit-tex は図を描かず、手元の xelatex 用の .tex だけを書き出します。
  日本語の値が通り、単位は siunitx で組み、オペアンプは本物の記号になります。
  プレビュー用の .tex と同じ名前なので、--out を分けて書き出してください。

  check は何も書き出さず、読めなかった行とネットリストだけを出します。
  図を描かないぶん速いので、書きながら回すときや CI で使えます。
  読めなかった行が 1 つでもあれば 0 以外で終わります。

  --version は処理系の版を出します。図に刻むなら style: stamp: on を書きます
  (字は処理系が埋めるので、手で書いて古びることがありません)。`;

const invalid = (message: string): ArgsResult => ({ ok: false, message });

const VERSION_FLAGS = ['--version', '-v'];

export function parseArgs(argv: readonly string[]): ArgsResult {
  const [written, ...rest] = argv;

  // 版を訊く指定は**先頭に書いたときだけ**。どこに書いても効くことにすると、
  // `check docs -v` が何も調べずに 0 で終わり、CI の関門が黙って通る
  // (`-v` を verbose のつもりで書くのはありがちな取り違え)。
  if (written !== undefined && VERSION_FLAGS.includes(written)) return { ok: true, value: { command: 'version' } };
  if (written !== 'render' && written !== 'check') return invalid('render か check を指定します');
  const command = written;

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

  if (targets.length === 0) {
    return invalid(
      command === 'check' ? '調べるファイルかディレクトリを指定します' : '描画するファイルかディレクトリを指定します',
    );
  }
  // check は何も書き出さないので、書き出し先を受けると嘘になる。
  if (command === 'check' && (outDir !== null || emitTex)) {
    return invalid('check は何も書き出しません (--out と --emit-tex は render で使います)');
  }

  return { ok: true, value: { command, targets, outDir, emitTex } };
}
