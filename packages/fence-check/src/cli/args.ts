import type { SceneFence } from 'fence-kit';

export const FENCES: readonly SceneFence[] = ['circuit', 'breadboard', 'perfboard'];

export const USAGE = `使い方: fence-check <Markdown またはディレクトリ...> [--json] [--only circuit,breadboard,perfboard] [--min <px>] [--top <n>] [--tex]

  --json   1 件 1 オブジェクトの JSON (summary と findings) を標準出力へ
  --only   見るフェンスを絞る (既定は 3 つとも)
  --min    これより浅い重なり・短い横切りは数えない (px、既定 1)
  --top    件の多い図を n 枚、最後に並べる (テキストのときだけ)
  --tex    circuit のフェンスを TeX で回し、多端子部品のピンと胴の位置を問い合わせる
           (遅い。1 個 1 秒ほど。書かなければピンへの線は検査せずに数える)

  --baseline <json>
           基準 (前に --json で書き出したもの) に無い件だけを出す。確かな件が 1 件でもあれば
           終了コード 1。近似の件 (?) は出すだけ
  --allow <json>
           わざと残す件の一覧 { "allow": [{ file, title, sheet, kind, a, b, reason }] }。
           ここにある件は基準に無くても赤くしない。reason は必須
  --write  直って消えた件を基準から消して書き戻す (--baseline のときだけ。基準は増えない)

終了コードは --baseline のときだけ件で決まる (新しい確かな件があれば 1)。それ以外は件数に依らず 0
(崩れは「読みにくい」で「読めない」ではない)。引数とファイルの誤りは 2。`;

export type Args = {
  readonly targets: readonly string[];
  readonly json: boolean;
  readonly only: readonly SceneFence[];
  readonly min: number | null;
  readonly top: number;
  /** circuit のピンの座標を TeX に問い合わせるか。 */
  readonly tex: boolean;
  /** 基準のファイル。書かなければ基準と突き合わせない。 */
  readonly baseline: string | null;
  /** 許す一覧のファイル。 */
  readonly allow: string | null;
  /** 直った件を基準から消して書き戻すか。 */
  readonly write: boolean;
};

export type ArgsResult = { readonly ok: true; readonly value: Args } | { readonly ok: false; readonly message: string };

const isFence = (name: string): name is SceneFence => (FENCES as readonly string[]).includes(name);

export function parseArgs(argv: readonly string[]): ArgsResult {
  const targets: string[] = [];
  let json = false;
  let tex = false;
  let only: readonly SceneFence[] = FENCES;
  let min: number | null = null;
  let top = 0;
  let baseline: string | null = null;
  let allow: string | null = null;
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--tex') {
      tex = true;
      continue;
    }
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (arg === '--baseline' || arg === '--allow') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) return { ok: false, message: `${arg} の後に値がありません` };
      index += 1;
      if (arg === '--baseline') baseline = value;
      else allow = value;
      continue;
    }
    if (arg === '--only' || arg === '--min' || arg === '--top') {
      const value = argv[index + 1];
      if (value === undefined) return { ok: false, message: `${arg} の後に値がありません` };
      index += 1;
      if (arg === '--only') {
        const names = value.split(',').map((name) => name.trim()).filter((name) => name !== '');
        const wrong = names.find((name) => !isFence(name));
        if (wrong !== undefined || names.length === 0) {
          return { ok: false, message: `--only に書けるのは ${FENCES.join(' / ')} です: ${wrong ?? value}` };
        }
        only = names.filter(isFence);
      } else {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) return { ok: false, message: `${arg} は 0 以上の数です: ${value}` };
        if (arg === '--min') min = number;
        else top = Math.floor(number);
      }
      continue;
    }
    if (arg.startsWith('--')) return { ok: false, message: `知らない指定です: ${arg}` };
    targets.push(arg);
  }
  if (targets.length === 0) return { ok: false, message: '検査する Markdown かディレクトリを 1 つ以上書きます' };
  if (baseline === null && (write || allow !== null)) {
    return { ok: false, message: `${write ? '--write' : '--allow'} は --baseline と一緒に書きます` };
  }
  return { ok: true, value: { targets, json, only, min, top, tex, baseline, allow, write } };
}
