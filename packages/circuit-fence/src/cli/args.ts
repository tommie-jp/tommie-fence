/**
 * CLI の引数。**読み取りは fence-kit にある** (`parseCliArgs`) — 3 つのフェンスで
 * 同じ規則なので写しを持たない。ここに残るのは**このフェンスの使い方の字**と、
 * このフェンスだけの決まり (`--emit-tex` と、check が何も書き出さないこと)。
 */
import { parseCliArgs } from 'fence-kit/cli';
import type { ArgsResult, CliCommand } from 'fence-kit/cli';

export type { ArgsResult, CliCommand } from 'fence-kit/cli';

/** 図を描かず、手元の LaTeX に渡す `.tex` だけを書き出す指定。 */
export const EMIT_TEX = '--emit-tex';

/** 書き出す `.svg` に TeX のフォントを埋め込む指定。 */
export const EMBED_FONTS = '--embed-fonts';

export const USAGE = `使い方:
  circuit-fence render <ファイルかディレクトリ...> [--out <出力先>] [--emit-tex | --embed-fonts]
  circuit-fence check  <ファイルかディレクトリ...>
  circuit-fence --version

  .md からは \`\`\`circuit フェンスを取り出し、.yaml はそのまま 1 枚の図として描きます。
  1 枚につき .tex と .svg を書き出します (.tex は LaTeX に渡せる完成した原稿)。
  --out を省くと入力と同じ場所に書き出します。

  --emit-tex は図を描かず、手元の xelatex 用の .tex だけを書き出します。
  日本語の値が通り、単位は siunitx で組み、オペアンプは本物の記号になります。
  プレビュー用の .tex と同じ名前なので、--out を分けて書き出してください。

  --embed-fonts は書き出す .svg に TeX のフォント (cmr10 など) を埋め込みます。
  埋め込まないと、プレビューの外 (ブラウザ・GitHub) で開いたとき Ω や µ が化けます。
  1 枚が 150 KB ほど大きくなります。

  check は何も書き出さず、読めなかった行とネットリストと ERC を出します。
  図を描かないぶん速いので、書きながら回すときや CI で使えます。
  読めなかった行が 1 つでもあれば 0 以外で終わります。

  --version は処理系の版を出します。図に刻むなら style: stamp: on を書きます
  (字は処理系が埋めるので、手で書いて古びることがありません)。`;

const invalid = (message: string): ArgsResult => ({ ok: false, message });

export function parseArgs(argv: readonly string[]): ArgsResult {
  const parsed = parseCliArgs(argv, [EMIT_TEX, EMBED_FONTS]);
  if (!parsed.ok) return parsed;

  // check は何も書き出さないので、書き出し先を受けると嘘になる。
  // **共有の読み取りは `--out` だけを断る**ので、`--emit-tex` はここで見る。
  if (parsed.value.command === 'check' && (parsed.value.flags.has(EMIT_TEX) || parsed.value.flags.has(EMBED_FONTS))) {
    return invalid(`check は何も書き出しません (--out と ${EMIT_TEX} と ${EMBED_FONTS} は render で使います)`);
  }
  // .tex だけを書き出すときは、フォントを埋め込む図が無い。
  if (parsed.value.flags.has(EMIT_TEX) && parsed.value.flags.has(EMBED_FONTS)) {
    return invalid(`${EMIT_TEX} は図を描かないので、${EMBED_FONTS} とは一緒に使えません`);
  }
  return parsed;
}

/** そのコマンドが `.tex` だけを書き出すか。 */
export const emitsTex = (command: CliCommand): boolean => command.flags.has(EMIT_TEX);

/** 書き出す `.svg` に TeX のフォントを埋め込むか。 */
export const embedsFonts = (command: CliCommand): boolean => command.flags.has(EMBED_FONTS);
