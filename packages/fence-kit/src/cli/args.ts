/**
 * CLI の引数の読み取り。**3 つのフェンスで同じもの**を使う。
 *
 * 実測して引き上げた: breadboard と perfboard の `cli/args.ts` は**コメント 1 行
 * を除いて同一**で、circuit も `--emit-tex` が増えているだけだった。写しが 3 つ
 * あると、片方にだけ `--version` が付く (実際そうなっていて、実機で
 * 「circuit のようにすべてのフェンスで版を出す」と言われた)。
 *
 * **使い方の字 (`USAGE`) は各フェンスが持つ。** 書ける物も注意書きも違うので、
 * 1 本にすると却って読みにくい。ここが持つのは読み取りの規則だけ。
 */

/** `render` は書き出す。`check` は**書かずに検証だけ**。`version` は版を答えるだけ。 */
export type CliVerb = 'render' | 'check' | 'version';

export type CliCommand = {
  readonly command: CliVerb;
  readonly targets: readonly string[];
  /** `check` と `version` では使わない。 */
  readonly outDir: string | null;
  /** 立っている真偽のオプション (`--emit-tex` など)。知らない綴りは弾く。 */
  readonly flags: ReadonlySet<string>;
};

export type ArgsResult =
  | { readonly ok: true; readonly value: CliCommand }
  | { readonly ok: false; readonly message: string };

/** 版を訊く綴り。**先頭に書いたときだけ**効く (下の理由を参照)。 */
const VERSION_FLAGS = ['--version', '-v'];

const invalid = (message: string): ArgsResult => ({ ok: false, message });

/**
 * 引数を読む。`flags` にはそのフェンスが知っている真偽のオプションを渡す
 * (渡さなければ `--out` 以外のオプションは全部「知らない」)。
 */
export function parseCliArgs(argv: readonly string[], flags: readonly string[] = []): ArgsResult {
  const [written, ...rest] = argv;

  // 版を訊く指定は**先頭に書いたときだけ**。どこに書いても効くことにすると、
  // `check docs -v` が何も調べずに 0 で終わり、CI の関門が黙って通る
  // (`-v` を verbose のつもりで書くのはありがちな取り違え)。
  if (written !== undefined && VERSION_FLAGS.includes(written)) {
    return { ok: true, value: { command: 'version', targets: [], outDir: null, flags: new Set() } };
  }
  if (written !== 'render' && written !== 'check') return invalid('render か check を指定します');
  const command = written;

  const targets: string[] = [];
  const raised = new Set<string>();
  let outDir: string | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--out') {
      if (command === 'check') return invalid('check は何も書き出さないので --out は使えません');
      const value = rest[index + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        return invalid('--out の後ろに出力先を書きます');
      }
      outDir = value;
      index += 1;
    } else if (flags.includes(argument)) {
      raised.add(argument);
    } else if (argument.startsWith('-')) {
      return invalid(`知らないオプションです: ${argument}`);
    } else {
      targets.push(argument);
    }
  }

  if (targets.length === 0) return invalid('描画するファイルかディレクトリを指定します');

  return { ok: true, value: { command, targets, outDir, flags: raised } };
}
