/**
 * DIP の IC の足の名前の表 (52 の docs/95)。**型番で引いて、3 つのフェンスが
 * 同じ名前を刷る** — 回路図は箱の中に名前と番号、実体配線図は胴に番号と名前。
 * 書き手が足の名前を並べるのではなく表から引くのは、綴りの誤りを黙って図に
 * 出さず「表に無い」というお知らせにするため (52 の docs/87 の #1)。
 *
 * **名前はメーカー (TI・Microchip) のデータシートの端子図 (TOP VIEW) の印字を 1 つだけ**
 * (`CV` `THR` のような略は入れない)。2026-09-28 (NE555〜CD4001B) と 2026-09-29
 * (CD4013B〜MCP3008 と、74HC595 以降) に次の版で確かめた:
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
 * | 74HC595 | SN74HC595 SCLS041J、Figure と Table 5-1 (PDIP) |
 * | CD4511B | SCHS072B、端子図 (TERMINAL ASSIGNMENT) |
 * | CD74HC283 | SCHS176E、4 Pin Configuration (PDIP) |
 * | 74HC14・00・10・11・27・20・132・125・126・393・164・74・86・02 | TI SN74HC14 などの Pin Functions (N)。74HC74・86・02 は 2026-10-04 に突き合わせ済み |
 * | 74HC30・4066・194・390・85・123・573 | TI の CD74HC30 / CD74HC4066 / CD74HC194 / CD74HC390 / CD74HC85 / CD74HC123 / CD74HC573 (SN74HC は無い)。4066 は D・PW の端子図 (14 ピンで PDIP と同じ番号) |
 * | 74HC161・138・139・157・153・151・175・174・112・4040・4060・193・165・244・541・240・574 | TI の SN74HC161 などの Pin Functions と端子図 (N)。74HC85 の 13・14 番は端子図で A2・B2 (調査の読み取りは逆だったので直した) |
 * | 74HC4051・4052・4053 | CD74HC4051 (SCHS122O) の Figure 4-1〜4-3。共通の入出力・選択の印字は `A`・`AN`・`S0`〜 |
 * | 74HC163 | SN74HC163 SCLS298D、TOP VIEW (N) |
 * | 74HC154 | CD74HC154 SCHS152D、Pinout (PDIP) |
 * | 62256 | Alliance AS6C62256 (rev 1.2、2016-03)、PIN CONFIGURATION (PDIP) |
 * | 6116 | Renesas (IDT) IDT6116SA/LA DSC-3089/03、Pin Configurations (DIP) — I/O 0〜7 は `IO0`〜`IO7` |
 * | 74HC245 | SN74HC245 SCLS131F、Table 5-1 (N) |
 * | 74HC273 | SN74HC273 SCLS136F、Table 5-1 (N) |
 * | 3SK291 | 東芝 3SK291 (2014-03-01)、外形図の端子の番号 (SMQ。1 G1・2 G2・3 D・4 S)。変換基板が SMQ の番号をそのまま DIP / SIP の番号にしている前提 |
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
 *   (NE555 の `RESET`、MCP3008 の `CS/SHDN`、74HC595 の `OE` `SRCLR`、CD4511B の `LT` `BL`
 *   `LE/STROBE` — `/` は印字のまま)。**線を落とすと
 *   別の足と同じ名前になるものだけ** `/` を前に付ける: CD4013B の Q の上に線 → `/Q1` `/Q2`
 * - 印字の `,` は落とす: L293D の `1,2EN` → `12EN`、`3,4EN` → `34EN`
 *   (YAML のフロー形式の区切りと取り違えないため)
 * - L293D の 4・5・12・13 番の印字 `HEAT SINK AND GROUND` は、Pin Functions の名前 `GROUND`。
 *   4 本に同じ名前なので、TL071 の `NC` と同じく名前では指せず番号で出る
 * - 74HC595 の 9 番の印字 `QH′` (プライム) は ASCII の `'` (`QH'`)。下付きの字 (`Q_A` `C_IN`) は並べて書く
 *   (`QA` `CIN` `COUT`)
 * - **大文字と小文字だけが違う印字は分ける** (回路図は足の名前を大文字小文字を問わず引くので、
 *   `A` と `a` は同じ足に読める): CD4511B の BCD 入力 `A`〜`D` は `INA`〜`IND`、
 *   セグメント出力 `a`〜`g` は `Oa`〜`Og`。**片方だけ変えると、もう片方の印字で書いた配線が
 *   黙って別の足に付く** (`U1.a` が入力 A に) ので両方を変え、印字のままの `A` `a` はどちらも
 *   「知らない足」として断らせる
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
  /** 働きの名前 (データシートの題の働き: `2 入力 AND ×4`)。部品表に型番と並べて出す。 */
  readonly role: string;
  /** 文書の表に添える一言 (上に線の足など)。`scripts/pinout-rows.mjs` が行に書き出す。 */
  readonly note?: string;
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
  { models: ['NE555', 'NE555P', 'SA555', 'SA555P', 'SE555', 'SE555P'], role: 'タイマー', names: [...TIMER_555, 'VCC'] },
  { models: ['TLC555', 'TLC555CP', 'TLC555IP'], role: 'タイマー (CMOS)', names: [...TIMER_555, 'VDD'] },
  {
    models: ['LM358', 'LM358P', 'LM358N', 'LM358A', 'LM358AP', 'LM358B', 'LM358BP', 'LM2904', 'LM2904P', 'LM258', 'LM258P'], role: 'オペアンプ ×2',
    names: ['OUT1', 'IN1-', 'IN1+', 'V-', 'IN2+', 'IN2-', 'OUT2', 'V+'],
  },
  {
    // P (PDIP) の印字。1・5・8 番は NC (オフセット調整の足があるのは TL071C の PS だけ)。
    models: ['TL071', 'TL071CP', 'TL071ACP', 'TL071BCP', 'TL071H'], role: 'オペアンプ',
    names: ['NC', 'IN-', 'IN+', 'VCC-', 'NC', 'OUT', 'VCC+', 'NC'],
  },
  {
    models: ['TL072', 'TL072CP', 'TL072ACP', 'TL072BCP', 'TL072H'], role: 'オペアンプ ×2',
    names: ['1OUT', '1IN-', '1IN+', 'VCC-', '2IN+', '2IN-', '2OUT', 'VCC+'],
  },
  {
    models: ['CD4017B', 'CD4017', 'CD4017BE'], role: '10 進カウンタ',
    names: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLOCK', 'RESET', 'VDD'],
  },
  {
    models: ['CD4040B', 'CD4040', 'CD4040BE'], role: '12 段 2 進カウンタ',
    names: ['Q12', 'Q6', 'Q5', 'Q7', 'Q4', 'Q3', 'Q2', 'VSS', 'Q1', 'CLOCK', 'R', 'Q9', 'Q8', 'Q10', 'Q11', 'VDD'],
  },
  { models: ['CD4069UB', 'CD4069', 'CD4069UBE'], role: 'NOT ×6', names: HEX_INVERTER },
  { models: ['CD4071B', 'CD4071', 'CD4071BE'], role: '2 入力 OR ×4', names: QUAD_GATE },
  { models: ['CD4081B', 'CD4081', 'CD4081BE'], role: '2 入力 AND ×4', names: QUAD_GATE },
  { models: ['CD4011B', 'CD4011', 'CD4011BE'], role: '2 入力 NAND ×4', names: QUAD_GATE },
  { models: ['CD4001B', 'CD4001', 'CD4001BE'], role: '2 入力 NOR ×4', names: QUAD_GATE },
  {
    models: ['CD4013B', 'CD4013', 'CD4013BE'], role: 'D フリップフロップ ×2',
    names: ['Q1', '/Q1', 'CLOCK1', 'RESET1', 'D1', 'SET1', 'VSS', 'SET2', 'D2', 'RESET2', 'CLOCK2', '/Q2', 'Q2', 'VDD'],
  },
  { models: ['CD4070B', 'CD4070', 'CD4070BE'], role: '2 入力 XOR ×4', names: QUAD_GATE },
  { models: ['CD40106B', 'CD40106', 'CD40106BE'], role: 'シュミット NOT ×6', names: HEX_INVERTER },
  {
    models: ['74HC04', 'SN74HC04', 'SN74HC04N'], role: 'NOT ×6',
    names: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
  },
  { models: ['74HC08', 'SN74HC08', 'SN74HC08N'], role: '2 入力 AND ×4', names: HC_QUAD_GATE },
  { models: ['74HC32', 'SN74HC32', 'SN74HC32N'], role: '2 入力 OR ×4', names: HC_QUAD_GATE },
  { models: ['74HC86', 'SN74HC86', 'SN74HC86N'], role: '2 入力 XOR ×4', names: HC_QUAD_GATE },
  {
    // NOR は Y が A・B より前に来る (74HC08 などと並びが違う)。
    models: ['74HC02', 'SN74HC02', 'SN74HC02N'], role: '2 入力 NOR ×4',
    names: ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'],
  },
  {
    // CLR・PRE は上に線 (L で効く)。Q の反転は `/1Q`・`/2Q`。
    models: ['74HC74', 'SN74HC74', 'SN74HC74N'], role: 'D フリップフロップ ×2',
    names: ['1CLR', '1D', '1CLK', '1PRE', '1Q', '/1Q', 'GND', '/2Q', '2Q', '2PRE', '2CLK', '2D', '2CLR', 'VCC'],
  },
  {
    // L293 (ダイオード無し) も同じデータシート・同じ印字。
    models: ['L293D', 'L293DNE', 'L293', 'L293NE'], role: 'ハーフ H ブリッジ ×4',
    names: [
      '12EN', '1A', '1Y', 'GROUND', 'GROUND', '2Y', '2A', 'VCC2', '34EN', '3A', '3Y', 'GROUND', 'GROUND', '4Y', '4A', 'VCC1',
    ],
  },
  {
    models: ['MCP3008'], role: '10 bit A/D 変換 8 ch',
    names: ['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'DGND', 'CS/SHDN', 'DIN', 'DOUT', 'CLK', 'AGND', 'VREF', 'VDD'],
  },
  {
    models: ['74HC595', 'SN74HC595', 'SN74HC595N'], role: '8 bit シフトレジスタ',
    names: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", 'SRCLR', 'SRCLK', 'RCLK', 'OE', 'SER', 'QA', 'VCC'],
  },
  {
    models: ['CD4511B', 'CD4511', 'CD4511BE'], role: 'BCD → 7 セグ デコーダ',
    names: ['INB', 'INC', 'LT', 'BL', 'LE/STROBE', 'IND', 'INA', 'VSS', 'Oe', 'Od', 'Oc', 'Ob', 'Oa', 'Og', 'Of', 'VDD'],
  },
  {
    // CD74HCT283 (TTL の入力の段) は同じ印字だが別の品なので入れない。
    models: ['CD74HC283', 'CD74HC283E', '74HC283'], role: '4 bit 全加算器',
    names: ['S1', 'B1', 'A1', 'S0', 'A0', 'B0', 'CIN', 'GND', 'COUT', 'S3', 'B3', 'A3', 'S2', 'A2', 'B2', 'VCC'],
  },
  {
    // 同期クリア (CLR はクロックの立ち上がりで効く)。非同期クリアは 74HC161 (未収録)。
    models: ['74HC163', 'SN74HC163', 'SN74HC163N', '74HC163N', 'CD74HC163', 'CD74HC163E'], role: '4 ビット同期カウンタ (同期クリア)',
    names: ['CLR', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOAD', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'],
  },
  {
    // E1・E2 は上に線 (両方 L で Y が動く)。
    models: ['74HC154', 'SN74HC154', 'SN74HC154N', '74HC154N', 'CD74HC154', 'CD74HC154E'], role: '4 → 16 デコーダ',
    names: [
      'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'GND',
      'Y11', 'Y12', 'Y13', 'Y14', 'Y15', 'E1', 'E2', 'A3', 'A2', 'A1', 'A0', 'VCC',
    ],
  },
  {
    // CE・OE・WE は上に線 (`#` 付きの印字)。データの足の名前は DQ。
    models: ['62256', 'AS6C62256', 'AS6C62256-55PCN', 'AS6C62256-55PIN', 'HM62256', 'HM62256B', 'CY62256', 'CY62256N'], role: 'SRAM 32K×8',
    names: [
      'A14', 'A12', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'DQ0', 'DQ1', 'DQ2', 'VSS',
      'DQ3', 'DQ4', 'DQ5', 'DQ6', 'DQ7', 'CE', 'A10', 'OE', 'A11', 'A9', 'A8', 'A13', 'WE', 'VCC',
    ],
  },
  {
    // CS・OE・WE は上に線。I/O の `/` は落とす。
    models: ['6116', 'IDT6116SA', 'IDT6116LA', 'HM6116', 'HM6116P'], role: 'SRAM 2K×8',
    names: [
      'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'IO0', 'IO1', 'IO2', 'GND',
      'IO3', 'IO4', 'IO5', 'IO6', 'IO7', 'CS', 'A10', 'OE', 'WE', 'A9', 'A8', 'VCC',
    ],
  },
  {
    models: ['74HC245', 'SN74HC245', 'SN74HC245N', '74HC245N', 'CD74HC245', 'CD74HC245E'], role: '8 ビット バス トランシーバ',
    names: ['DIR', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'GND', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3', 'B2', 'B1', 'OE', 'VCC'],
  },
  {
    // CLR は上に線 (L でクリア、非同期)。
    models: ['74HC273', 'SN74HC273', 'SN74HC273N', '74HC273N', 'CD74HC273', 'CD74HC273E'], role: '8 ビット D フリップフロップ (クリア付き)',
    names: [
      'CLR', '1Q', '1D', '2D', '2Q', '3Q', '3D', '4D', '4Q', 'GND',
      'CLK', '5Q', '5D', '6D', '6Q', '7Q', '7D', '8D', '8Q', 'VCC',
    ],
  },
  {
    models: ['74HC14', 'SN74HC14', 'SN74HC14N'], role: 'シュミット トリガ インバータ ×6',
    names: [
      '1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y',
      '5A', '6Y', '6A', 'VCC',
    ],
  },
  {
    models: ['74HC00', 'SN74HC00', 'SN74HC00N'], role: '2 入力 NAND ×4',
    names: [
      '1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B',
      '4Y', '4A', '4B', 'VCC',
    ],
  },
  {
    models: ['74HC161', 'SN74HC161', 'SN74HC161N'], role: '4 ビット同期カウンタ (非同期クリア)',
    names: [
      'CLR', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOAD', 'ENT',
      'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC',
    ],
    note: '`CLR` `LOAD` は上に線。クリアは非同期。並びは 74HC163 と同じ',
  },
  {
    models: ['74HC194', 'CD74HC194', 'CD74HC194E'], role: '4 ビット双方向シフトレジスタ',
    names: [
      'MR', 'DSR', 'D0', 'D1', 'D2', 'D3', 'DSL', 'GND', 'S0', 'S1',
      'CP', 'Q3', 'Q2', 'Q1', 'Q0', 'VCC',
    ],
    note: '`MR` は上に線',
  },
  {
    models: ['74HC10', 'SN74HC10', 'SN74HC10N'], role: '3 入力 NAND ×3',
    names: [
      '1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B',
      '3C', '1Y', '1C', 'VCC',
    ],
    note: '1 回路目の `1C` `1Y` は 13・12 番に離れて出る',
  },
  {
    models: ['74HC11', 'SN74HC11', 'SN74HC11N'], role: '3 入力 AND ×3',
    names: [
      '1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B',
      '3C', '1Y', '1C', 'VCC',
    ],
    note: '並びは 74HC10 と同じ',
  },
  {
    models: ['74HC27', 'SN74HC27', 'SN74HC27N'], role: '3 入力 NOR ×3',
    names: [
      '1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B',
      '3C', '1Y', '1C', 'VCC',
    ],
    note: '並びは 74HC10 と同じ',
  },
  {
    models: ['74HC20', 'SN74HC20', 'SN74HC20N'], role: '4 入力 NAND ×2',
    names: [
      '1A', '1B', 'NC', '1C', '1D', '1Y', 'GND', '2Y', '2A', '2B',
      'NC', '2C', '2D', 'VCC',
    ],
    note: '`NC` は 3・11 番。名前では指せず番号で呼ぶ',
  },
  {
    models: ['74HC30', 'CD74HC30', 'CD74HC30E'], role: '8 入力 NAND',
    names: [
      'A', 'B', 'C', 'D', 'E', 'F', 'GND', 'Y', 'NC', 'NC',
      'G', 'H', 'NC', 'VCC',
    ],
    note: '`NC` は 9・10・13 番。番号で呼ぶ',
  },
  {
    models: ['74HC132', 'SN74HC132', 'SN74HC132N'], role: 'シュミット トリガ 2 入力 NAND ×4',
    names: [
      '1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B',
      '4Y', '4A', '4B', 'VCC',
    ],
    note: '並びは 74HC08 と同じ',
  },
  {
    models: ['74HC125', 'SN74HC125', 'SN74HC125N'], role: '3 ステート バッファ ×4 (OE が L で有効)',
    names: [
      '1OE', '1A', '1Y', '2OE', '2A', '2Y', 'GND', '3Y', '3A', '3OE',
      '4Y', '4A', '4OE', 'VCC',
    ],
    note: '`OE` は上に線',
  },
  {
    models: ['74HC126', 'SN74HC126', 'SN74HC126N'], role: '3 ステート バッファ ×4 (OE が H で有効)',
    names: [
      '1OE', '1A', '1Y', '2OE', '2A', '2Y', 'GND', '3Y', '3A', '3OE',
      '4Y', '4A', '4OE', 'VCC',
    ],
    note: '並びは 74HC125 と同じ。`OE` の極性だけ違う',
  },
  {
    models: ['74HC393', 'SN74HC393', 'SN74HC393N'], role: '4 ビット 2 進カウンタ ×2',
    names: [
      '1CLK', '1CLR', '1QA', '1QB', '1QC', '1QD', 'GND', '2QD', '2QC', '2QB',
      '2QA', '2CLR', '2CLK', 'VCC',
    ],
    note: '`CLR` は H でクリア',
  },
  {
    models: ['74HC164', 'SN74HC164', 'SN74HC164N'], role: '8 ビット 直列入力・並列出力 シフトレジスタ',
    names: [
      'A', 'B', 'QA', 'QB', 'QC', 'QD', 'GND', 'CLK', 'CLR', 'QE',
      'QF', 'QG', 'QH', 'VCC',
    ],
    note: '`CLR` は上に線',
  },
  {
    models: ['74HC4066', 'CD74HC4066', 'CD74HC4066E'], role: 'アナログ スイッチ ×4',
    names: [
      '1Y', '1Z', '2Z', '2Y', '2E', '3E', 'GND', '3Y', '3Z', '4Z',
      '4Y', '4E', '1E', 'VCC',
    ],
    note: '`Y` `Z` は双方向。`E` が制御 (H で導通)。端子図は D・PW の 14 ピンから (PDIP も同じ番号)',
  },
  {
    models: ['74HC138', 'SN74HC138', 'SN74HC138N'], role: '3 → 8 デコーダ',
    names: [
      'A', 'B', 'C', 'G2A', 'G2B', 'G1', 'Y7', 'GND', 'Y6', 'Y5',
      'Y4', 'Y3', 'Y2', 'Y1', 'Y0', 'VCC',
    ],
    note: '`G2A` `G2B` `Y0`〜`Y7` は上に線',
  },
  {
    models: ['74HC139', 'SN74HC139', 'SN74HC139N'], role: '2 → 4 デコーダ ×2',
    names: [
      '1G', '1A', '1B', '1Y0', '1Y1', '1Y2', '1Y3', 'GND', '2Y3', '2Y2',
      '2Y1', '2Y0', '2B', '2A', '2G', 'VCC',
    ],
    note: '`G` と `Y` は上に線',
  },
  {
    models: ['74HC157', 'SN74HC157', 'SN74HC157N'], role: '2 入力データセレクタ ×4',
    names: [
      'A/B', '1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3B',
      '3A', '4Y', '4B', '4A', 'G', 'VCC',
    ],
    note: '`A/B` が選択 (L で A)。`G` は上に線',
  },
  {
    models: ['74HC153', 'SN74HC153', 'SN74HC153N'], role: '4 入力データセレクタ ×2',
    names: [
      '1G', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0',
      '2C1', '2C2', '2C3', 'A', '2G', 'VCC',
    ],
    note: '`A` `B` が選択。`G` は上に線',
  },
  {
    models: ['74HC151', 'SN74HC151', 'SN74HC151N'], role: '8 入力データセレクタ',
    names: [
      'D3', 'D2', 'D1', 'D0', 'Y', 'W', 'G', 'GND', 'C', 'B',
      'A', 'D7', 'D6', 'D5', 'D4', 'VCC',
    ],
    note: '`W` は `Y` の反転。`A` `B` `C` が選択。`G` は上に線',
  },
  {
    models: ['74HC175', 'SN74HC175', 'SN74HC175N'], role: 'D フリップフロップ ×4 (共通クリア、相補出力)',
    names: [
      'CLR', '1Q', '/1Q', '1D', '2D', '/2Q', '2Q', 'GND', 'CLK', '3Q',
      '/3Q', '3D', '4D', '/4Q', '4Q', 'VCC',
    ],
    note: '`CLR` は上に線。`/Q` は Q の上に線',
  },
  {
    models: ['74HC174', 'SN74HC174', 'SN74HC174N'], role: 'D フリップフロップ ×6 (共通クリア)',
    names: [
      'CLR', '1Q', '1D', '2D', '2Q', '3D', '3Q', 'GND', 'CLK', '4Q',
      '4D', '5Q', '5D', '6Q', '6D', 'VCC',
    ],
    note: '`CLR` は上に線',
  },
  {
    models: ['74HC112', 'SN74HC112', 'SN74HC112N'], role: 'JK フリップフロップ ×2 (プリセット・クリア付き)',
    names: [
      '1CLK', '1K', '1J', '1PRE', '1Q', '/1Q', '/2Q', 'GND', '2Q', '2PRE',
      '2J', '2K', '2CLK', '2CLR', '1CLR', 'VCC',
    ],
    note: '`CLK` `PRE` `CLR` は上に線 (CLK は立ち下がりで動く)。`/Q` は Q の上に線',
  },
  {
    models: ['74HC390', 'CD74HC390', 'CD74HC390E'], role: '10 進カウンタ ×2 (2 分周と 5 分周)',
    names: [
      '1CLKA', '1CLR', '1QA', '1CLKB', '1QB', '1QC', '1QD', 'GND', '2QD', '2QC',
      '2QB', '2CLKB', '2QA', '2CLR', '2CLKA', 'VCC',
    ],
    note: '`CLKA` `CLKB` `CLR` は上に線',
  },
  {
    models: ['74HC4040', 'SN74HC4040', 'SN74HC4040N'], role: '12 段 2 進カウンタ',
    names: [
      'QL', 'QF', 'QE', 'QG', 'QD', 'QC', 'QB', 'GND', 'QA', 'CLK',
      'CLR', 'QI', 'QH', 'QJ', 'QK', 'VCC',
    ],
    note: '`QA` が 2 分周 (CD4040B の `Q1`)、`QL` が 4096 分周 (`Q12`)。`CLR` は H でクリア',
  },
  {
    models: ['74HC4060', 'SN74HC4060', 'SN74HC4060N'], role: '14 段 2 進カウンタ (発振器付き)',
    names: [
      'QL', 'QM', 'QN', 'QF', 'QE', 'QG', 'QD', 'GND', 'CLKO', '/CLKO',
      'CLKI', 'CLR', 'QI', 'QH', 'QJ', 'VCC',
    ],
    note: '`QD` が 16 分周 … `QN` が 16384 分周 (`Q14`)。`/CLKO` は `CLKO` の上に線',
  },
  {
    models: ['74HC193', 'SN74HC193', 'SN74HC193N'], role: '4 ビット アップダウン カウンタ',
    names: [
      'B', 'QB', 'QA', 'DOWN', 'UP', 'QC', 'QD', 'GND', 'D', 'C',
      'LOAD', 'CO', 'BO', 'CLR', 'A', 'VCC',
    ],
    note: '`LOAD` `CO` `BO` は上に線。`CLR` は H でクリア',
  },
  {
    models: ['74HC165', 'SN74HC165', 'SN74HC165N'], role: '8 ビット 並列入力・直列出力 シフトレジスタ',
    names: [
      'SH/LD', 'CLK', 'E', 'F', 'G', 'H', '/QH', 'GND', 'QH', 'SER',
      'A', 'B', 'C', 'D', 'CLKINH', 'VCC',
    ],
    note: '`SH/LD` は LD の上に線。`/QH` は `QH` の上に線。`CLKINH` は印字の `CLK INH`',
  },
  {
    models: ['74HC85', 'CD74HC85', 'CD74HC85E'], role: '4 ビット 比較器',
    names: [
      'B3', 'LTIN', 'EQIN', 'GTIN', 'GTOUT', 'EQOUT', 'LTOUT', 'GND', 'B0', 'A0',
      'B1', 'A1', 'A2', 'B2', 'A3', 'VCC',
    ],
    note: '`LTIN` `EQIN` `GTIN` は印字の `(A < B) IN` `(A = B) IN` `(A > B) IN`、`GTOUT` `EQOUT` `LTOUT` は `(A > B) OUT` …',
  },
  {
    models: ['74HC123', 'CD74HC123', 'CD74HC123E'], role: '再トリガ単安定マルチバイブレータ ×2',
    names: [
      '1A', '1B', '1R', '/1Q', '2Q', '2CX', '2RXCX', 'GND', '2A', '2B',
      '2R', '/2Q', '1Q', '1CX', '1RXCX', 'VCC',
    ],
    note: '`A` `R` は上に線。`/Q` は Q の上に線。`R` はリセット、`CX` `RXCX` は外付けの C と R',
  },
  {
    models: ['74HC4051', 'CD74HC4051', 'CD74HC4051E'], role: '8 チャネル アナログ マルチプレクサ',
    names: [
      'A4', 'A6', 'A', 'A7', 'A5', 'E', 'VEE', 'GND', 'S2', 'S1',
      'S0', 'A3', 'A0', 'A1', 'A2', 'VCC',
    ],
    note: '`A` が共通、`A0`〜`A7` がチャネル、`S0`〜`S2` が選択。`E` は上に線。電源は `VCC` `VEE` `GND`',
  },
  {
    models: ['74HC4052', 'CD74HC4052', 'CD74HC4052E'], role: '4 チャネル アナログ マルチプレクサ ×2',
    names: [
      'B0', 'B2', 'BN', 'B3', 'B1', 'E', 'VEE', 'GND', 'S1', 'S0',
      'A3', 'A0', 'AN', 'A1', 'A2', 'VCC',
    ],
    note: '`AN` `BN` が共通、`A0`〜`A3` `B0`〜`B3` がチャネル。`E` は上に線',
  },
  {
    models: ['74HC4053', 'CD74HC4053', 'CD74HC4053E'], role: '2 チャネル アナログ マルチプレクサ ×3',
    names: [
      'B1', 'B0', 'C1', 'CN', 'C0', 'E', 'VEE', 'GND', 'S2', 'S1',
      'S0', 'A0', 'A1', 'AN', 'BN', 'VCC',
    ],
    note: '`AN` `BN` `CN` が共通、`A0` `A1` …がチャネル。`E` は上に線',
  },
  {
    models: ['74HC244', 'SN74HC244', 'SN74HC244N'], role: '8 ビット 3 ステート バッファ',
    names: [
      '1OE', '1A1', '2Y4', '1A2', '2Y3', '1A3', '2Y2', '1A4', '2Y1', 'GND',
      '2A1', '1Y4', '2A2', '1Y3', '2A3', '1Y2', '2A4', '1Y1', '2OE', 'VCC',
    ],
    note: '`OE` は上に線',
  },
  {
    models: ['74HC541', 'SN74HC541', 'SN74HC541N'], role: '8 ビット 3 ステート バッファ (入力が片側)',
    names: [
      'OE1', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'GND',
      'Y8', 'Y7', 'Y6', 'Y5', 'Y4', 'Y3', 'Y2', 'Y1', 'OE2', 'VCC',
    ],
    note: '`OE1` `OE2` は上に線',
  },
  {
    models: ['74HC240', 'SN74HC240', 'SN74HC240N'], role: '8 ビット 3 ステート バッファ (反転)',
    names: [
      '1OE', '1A1', '2Y4', '1A2', '2Y3', '1A3', '2Y2', '1A4', '2Y1', 'GND',
      '2A1', '1Y4', '2A2', '1Y3', '2A3', '1Y2', '2A4', '1Y1', '2OE', 'VCC',
    ],
    note: '並びは 74HC244 と同じ。`OE` は上に線',
  },
  {
    models: ['74HC573', 'CD74HC573', 'CD74HC573E'], role: '8 ビット D ラッチ (3 ステート)',
    names: [
      'OE', '1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', 'GND',
      'LE', '8Q', '7Q', '6Q', '5Q', '4Q', '3Q', '2Q', '1Q', 'VCC',
    ],
    note: '`OE` は上に線。`LE` が H の間つながる',
  },
  {
    models: ['74HC574', 'SN74HC574', 'SN74HC574N'], role: '8 ビット D フリップフロップ (3 ステート)',
    names: [
      'OE', '1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', 'GND',
      'CLK', '8Q', '7Q', '6Q', '5Q', '4Q', '3Q', '2Q', '1Q', 'VCC',
    ],
    note: '`OE` は上に線。並びは 74HC573 と同じ (`LE` が `CLK`)',
  },
  {
    // 面実装 (SMQ) の 4 本足。変換基板に載せて `dip4` (2 列) か `sip4` (1 列) で置く。
    // 基板が SMQ の番号をそのまま使う前提 — 並びが違う基板は `pins:` で名前を書く。
    models: ['3SK291'], role: 'デュアルゲート MOSFET (N)',
    names: ['G1', 'G2', 'D', 'S'],
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

/** 型番から働きの名前を引く (本数は問わない)。表に無い型番は null。 */
export function lookupRole(model: string | null): string | null {
  if (model === null) return null;
  return BY_MODEL.get(model.trim().toUpperCase())?.role ?? null;
}

/** 表にある型番 (行ごとに代表の綴り 1 つ)。本数を渡すとそのパッケージの行だけ。 */
export const pinoutModels = (pins?: number): readonly string[] =>
  ROWS.filter((row) => pins === undefined || row.names.length === pins).map((row) => row.models[0] ?? '');

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const pinoutTable = (): readonly PinoutRow[] => ROWS;
