/**
 * DIP の IC の足の名前の表 (52 の docs/95)。**型番で引いて、3 つのフェンスが
 * 同じ名前を刷る** — 回路図は箱の中に名前と番号、実体配線図は胴に番号と名前。
 * 書き手が足の名前を並べるのではなく表から引くのは、綴りの誤りを黙って図に
 * 出さず「表に無い」というお知らせにするため (52 の docs/87 の #1)。
 *
 * **名前はメーカー (TI・Microchip) のデータシートの端子図 (TOP VIEW) の印字を 1 つだけ**
 * (`CV` `THR` のような略は入れない)。2026-09-28 (NE555〜CD4001B) と 2026-09-29
 * (CD4013B 以降) に次の版で確かめた:
 *
 * | 行 | データシート |
 * | --- | --- |
 * | NE555 | SLFS022K (NE555 / SA555 / SE555)、Table 4-1 |
 * | TLC555 | SLFS043K (TLC555)、Table 4-1 — 電源の足は `VDD` |
 * | LM358 | SLOS068AB (LM358 / LM2904 / LM258 / LM158)、Table 4-1 |
 * | TL071 / TL072 | SLOS080W、Table 4-1 (TL071x の D・P) / 4-3 (TL072x) |
 * | CD4017B | SCHS027C、端子図 (TERMINAL DIAGRAM) |
 * | CD4040B | SCHS030D、端子図 |
 * | CD4069UB | SCHS054E、Pin Functions |
 * | CD4071B / CD4081B / CD4011B / CD4001B | SCHS056D / SCHS057C / SCHS021D / SCHS015C の端子図 |
 * | CD4013B | SCHS023E、Pin Functions |
 * | CD4070B | SCHS055E、端子図 (Pinouts) |
 * | CD40106B | SCHS097F、Pin Functions |
 * | 74HC04 / 74HC08 / 74HC32 | SN74HC04 SCLS078H / SN74HC08 SCLS081J / SN74HC32 SCLS200F、Pin Functions (N) |
 * | L293D | SLRS008D (L293 / L293D)、NE の端子図と Pin Functions |
 * | MCP3008 | Microchip DS21295D (MCP3004/3008)、Table 3-1 (PDIP) |
 *
 * **足の名前として書けない印字だけは直した** (`U1.TRIG` と書けて、番号と取り違えないため):
 *
 * - 印字の `–` (en dash) は ASCII の `-` (`IN-`)。キーボードで打てる字にする
 * - CD4017B の出力の印字は数字だけ (`0`〜`9`) なので `Q` を付ける (`Q0`〜`Q9`)。
 *   数字のままだと `U1.5` が 5 番の足か出力 5 かで割れる
 * - 空白を含む印字は略す: CD4017B の `CARRY OUT` → `CO`、`CLOCK INHIBIT` → `INH`
 * - CD4040B の 10 番の印字 `φ` は、同じ系列の CD4017B の印字に合わせて `CLOCK`
 * - 論理ゲートの出力 (`J=A+B` `G=A` のような式) は、式の左辺の文字 (`J`) だけ。
 *   CD4070B の `J=A⊕B` も CD40106B の `G=A` (A の上に線) も同じ
 * - 上に線のある印字 (負論理) は、線を落としても 1 つに決まるならそのまま
 *   (NE555 の `RESET`、MCP3008 の `CS/SHDN` — `/` は印字のまま)。**線を落とすと
 *   別の足と同じ名前になるものだけ** `/` を前に付ける: CD4013B の Q の上に線 → `/Q1` `/Q2`
 * - 印字の `,` は落とす: L293D の `1,2EN` → `12EN`、`3,4EN` → `34EN`
 *   (YAML のフロー形式の区切りと取り違えないため)
 * - L293D の 4・5・12・13 番の印字 `HEAT SINK AND GROUND` は、Pin Functions の名前 `GROUND`。
 *   4 本に同じ名前なので、TL071 の `NC` と同じく名前では指せず番号で出る
 * - 74HC の型番は TI の `SN` を付けない綴りが代表 (教科書の書き方)。`SN74HC04N` も書ける
 *
 * **鍵は型番の完全一致** (大文字小文字は問わない)。接尾辞を削らないのは、
 * `TL071` (1 回路) と `TL072` (2 回路) を取り違えないため。同じ印字の型番は
 * 1 つの行に並べ、**先頭が代表の綴り**。印字が違えば行を分ける
 * (`TLC555` は電源が `VDD` なので `NE555` と別の行)。
 */

export type PinoutRow = {
  /** 書ける型番。**先頭が代表の綴り** (お知らせと早見表に出す)。 */
  readonly models: readonly string[];
  /** 足の名前 (1 番から順)。本数がパッケージの足の数。 */
  readonly names: readonly string[];
};

export type Pinout = {
  /** 代表の型番 (表の行の先頭)。 */
  readonly model: string;
  readonly names: readonly string[];
};

/** 4 回路の 2 入力ゲート (CD4071B・CD4081B・CD4011B・CD4001B) は同じ並び。 */
const QUAD_GATE = ['A', 'B', 'J', 'K', 'C', 'D', 'VSS', 'E', 'F', 'L', 'M', 'G', 'H', 'VDD'];

/** 6 回路のインバータ (CD4069UB・CD40106B) は同じ並び。 */
const HEX_INVERTER = ['A', 'G', 'B', 'H', 'C', 'I', 'VSS', 'J', 'D', 'K', 'E', 'L', 'F', 'VDD'];

/** 74HC の 4 回路の 2 入力ゲート (74HC08・74HC32) は同じ並び。 */
const HC_QUAD_GATE = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];

const TIMER_555 = ['GND', 'TRIG', 'OUT', 'RESET', 'CONT', 'THRES', 'DISCH'];

const ROWS: readonly PinoutRow[] = [
  { models: ['NE555', 'NE555P', 'SA555', 'SA555P', 'SE555', 'SE555P'], names: [...TIMER_555, 'VCC'] },
  { models: ['TLC555', 'TLC555CP', 'TLC555IP'], names: [...TIMER_555, 'VDD'] },
  {
    models: ['LM358', 'LM358P', 'LM358N', 'LM358A', 'LM358AP', 'LM358B', 'LM358BP', 'LM2904', 'LM2904P', 'LM258', 'LM258P'],
    names: ['OUT1', 'IN1-', 'IN1+', 'V-', 'IN2+', 'IN2-', 'OUT2', 'V+'],
  },
  {
    // P (PDIP) の印字。1・5・8 番は NC (オフセット調整の足があるのは TL071C の PS だけ)。
    models: ['TL071', 'TL071CP', 'TL071ACP', 'TL071BCP', 'TL071H'],
    names: ['NC', 'IN-', 'IN+', 'VCC-', 'NC', 'OUT', 'VCC+', 'NC'],
  },
  {
    models: ['TL072', 'TL072CP', 'TL072ACP', 'TL072BCP', 'TL072H'],
    names: ['1OUT', '1IN-', '1IN+', 'VCC-', '2IN+', '2IN-', '2OUT', 'VCC+'],
  },
  {
    models: ['CD4017B', 'CD4017', 'CD4017BE'],
    names: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLOCK', 'RESET', 'VDD'],
  },
  {
    models: ['CD4040B', 'CD4040', 'CD4040BE'],
    names: ['Q12', 'Q6', 'Q5', 'Q7', 'Q4', 'Q3', 'Q2', 'VSS', 'Q1', 'CLOCK', 'R', 'Q9', 'Q8', 'Q10', 'Q11', 'VDD'],
  },
  { models: ['CD4069UB', 'CD4069', 'CD4069UBE'], names: HEX_INVERTER },
  { models: ['CD4071B', 'CD4071', 'CD4071BE'], names: QUAD_GATE },
  { models: ['CD4081B', 'CD4081', 'CD4081BE'], names: QUAD_GATE },
  { models: ['CD4011B', 'CD4011', 'CD4011BE'], names: QUAD_GATE },
  { models: ['CD4001B', 'CD4001', 'CD4001BE'], names: QUAD_GATE },
  {
    models: ['CD4013B', 'CD4013', 'CD4013BE'],
    names: ['Q1', '/Q1', 'CLOCK1', 'RESET1', 'D1', 'SET1', 'VSS', 'SET2', 'D2', 'RESET2', 'CLOCK2', '/Q2', 'Q2', 'VDD'],
  },
  { models: ['CD4070B', 'CD4070', 'CD4070BE'], names: QUAD_GATE },
  { models: ['CD40106B', 'CD40106', 'CD40106BE'], names: HEX_INVERTER },
  {
    models: ['74HC04', 'SN74HC04', 'SN74HC04N'],
    names: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
  },
  { models: ['74HC08', 'SN74HC08', 'SN74HC08N'], names: HC_QUAD_GATE },
  { models: ['74HC32', 'SN74HC32', 'SN74HC32N'], names: HC_QUAD_GATE },
  {
    // L293 (ダイオード無し) も同じデータシート・同じ印字。
    models: ['L293D', 'L293DNE', 'L293', 'L293NE'],
    names: [
      '12EN', '1A', '1Y', 'GROUND', 'GROUND', '2Y', '2A', 'VCC2', '34EN', '3A', '3Y', 'GROUND', 'GROUND', '4Y', '4A', 'VCC1',
    ],
  },
  {
    models: ['MCP3008'],
    names: ['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'DGND', 'CS/SHDN', 'DIN', 'DOUT', 'CLK', 'AGND', 'VREF', 'VDD'],
  },
];

/** 型番 (大文字) → 行。`Map` にするのは `constructor` のような継ぎ物の名前を拾わないため。 */
const BY_MODEL: ReadonlyMap<string, PinoutRow> = new Map(
  ROWS.flatMap((row) => row.models.map((model) => [model.toUpperCase(), row] as const)),
);

/**
 * 型番と足の本数から足の名前を引く。**表に無い型番、本数がパッケージと合わない
 * 型番は null** (呼ぶ側は番号で描き、お知らせを出す)。
 */
export function lookupPinout(model: string | null, pins: number): Pinout | null {
  if (model === null) return null;
  const row = BY_MODEL.get(model.trim().toUpperCase());
  if (row === undefined || row.names.length !== pins) return null;
  return { model: row.models[0] ?? '', names: row.names };
}

/** 表にある型番 (行ごとに代表の綴り 1 つ)。本数を渡すとそのパッケージの行だけ。 */
export const pinoutModels = (pins?: number): readonly string[] =>
  ROWS.filter((row) => pins === undefined || row.names.length === pins).map((row) => row.models[0] ?? '');

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const pinoutTable = (): readonly PinoutRow[] => ROWS;
