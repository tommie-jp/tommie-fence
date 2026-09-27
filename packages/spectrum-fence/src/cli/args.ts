/**
 * CLI の引数。**読み取りは fence-kit にある** (`parseCliArgs`) — 3 つのフェンスで
 * 同じ規則なので写しを持たない。ここに残るのは**このフェンスの使い方の字**だけで、
 * 書ける物も注意書きもフェンスごとに違う。
 */
import { parseCliArgs } from 'fence-kit/cli';
import type { ArgsResult } from 'fence-kit/cli';

export type { ArgsResult, CliCommand, CliVerb } from 'fence-kit/cli';

export const USAGE = `使い方:
  spectrum-fence render <ファイルかディレクトリ...> [--out <出力先>]
  spectrum-fence check <ファイルかディレクトリ...>
  spectrum-fence --version

  .md からは \`\`\`spectrum フェンスを取り出し、.yaml はそのまま 1 枚の図として描きます。
  render は --out を省くと入力と同じ場所に .svg を書き出します。
  check は何も書かず、読み値 (マーカー) と言うことだけを出します
  (読めない行が 1 つでもあれば終了コードは 1)。
  data: に書いた CSV (tinySA の SAVE TRACES・WaveForms の Spectrum の Export。.csv / .txt) は、
  入力の .md と同じ場所から読みます。

  --version は処理系の版を出します。図に刻むなら style: stamp: on を書きます
  (字は処理系が埋めるので、手で書いて古びることがありません)。`;

export const parseArgs = (argv: readonly string[]): ArgsResult => parseCliArgs(argv);
