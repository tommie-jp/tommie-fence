import type { Lang } from '../lang.ts';
import { lookupPinoutNames, lookupRole } from './pinouts.ts';

/**
 * 基板の外に置くモジュール (`type: device`) のピンの名前の表 (52 の docs/139)。
 * **線でつなぐ物** — 2 列のヘッダが 2.54 mm で隣り合う (nRF24L01+)、ネジの端子台やパッド (降圧・充電)、
 * コネクタつきの線 (28BYJ-48) のように、ブレッドボードの穴に挿す形でない物をここに置く。
 * 穴に挿す 1 列の物は `pinouts.ts` (`sipN` で置ける) にあり、機器の `model:` はそちらも引く。
 *
 * **名前の並びはヘッダ・端子の物理の並び** (各行の `view` の向きで見て)。品で並びが違う物は、
 * 標準の品を 1 つに決め、`product` に書く。並びを資料で確かめた先は `source`。
 */
export type ModuleRow = {
  /** 書ける型番。**先頭が代表の綴り**。 */
  readonly models: readonly string[];
  /** ピンの名前。ヘッダ・端子の物理の並び。 */
  readonly names: readonly string[];
  /** 一言で言う働き (部品表と早見表に出す)。 */
  readonly role: string;
  /** 働きの英語 (部品表の英語版)。 */
  readonly roleEn: string;
  /** 標準に決めた品 (販売元・型番)。 */
  readonly product: string;
  /** 並びを見る向き。 */
  readonly view: string;
  /** 文書の表に添える一言。 */
  readonly note?: string;
  /** 確かめた資料。 */
  readonly source: string;
};

const ROWS: readonly ModuleRow[] = [
  {
    models: ['MBC2596-01', 'MBC2596', 'LM2596-01'],
    names: ['IN+', 'IN-', 'OUT+', 'OUT-'],
    role: '降圧 DC-DC モジュール (可変 1.25〜30 V 3 A)', roleEn: 'buck DC-DC module (adjustable 1.25–30 V, 3 A)',
    product: '秋月 131750 (TAEJIN MBC2596-01。2026-03 に LM2596-01 から改称)',
    view: '部品面を上、入力を左にして: 左上 IN+・左下 IN-・右上 OUT+・右下 OUT-',
    note: '端子は四隅のスルーホール (ピンヘッダは付かない)。出力は青い多回転トリマで決める。入力は出力より 1.5 V 以上高く (4〜35 V)',
    source: 'HTC MBC2596-01 R1.1 (2025-12、秋月の配布 https://akizukidenshi.com/goodsaffix/MBC2596-01.pdf)、p3 の I/O PORT CONFIGURATION と上面の写真',
  },
  {
    models: ['28BYJ-48', '28BYJ48', '28BYJ-48-5V'],
    names: ['BLUE', 'PINK', 'YELLOW', 'ORANGE', 'RED'],
    role: 'ステッピングモータ (5 V、ユニポーラ 4 相)', roleEn: 'stepper motor (5 V, unipolar 4-phase)',
    product: '秋月 113256 (28BYJ-48 5V、XH 5P のコネクタつき)',
    view: 'コネクタの 1〜5 番 (線の色で呼ぶ)',
    note: '**ピンは線の色で呼ぶ** (相の名前 A〜D の割り当ては資料で逆になる)。`RED` は共通 (+5 V)。1 相励磁は ORANGE → YELLOW → PINK → BLUE の順で、軸側から見て反時計回り。秋月の写真の線の並びは図と食い違うので、実物で確かめる',
    source: '28BYJ48-W01 (2019-11-13、秋月の配布 https://akizukidenshi.com/goodsaffix/28BYJ48-W01.pdf)、p6 の Connector pin No. / Lead wire color と分配順序の表',
  },
  {
    models: ['ULN2003-BOARD', 'ULN2003-STEPPER', 'ULN2003-DRIVER'],
    names: ['IN1', 'IN2', 'IN3', 'IN4', 'GND', 'VCC', 'A', 'B', 'C', 'D', 'V+'],
    role: 'ステッピングモータの駆動基板 (ULN2003)', roleEn: 'stepper motor driver board (ULN2003)',
    product: '28BYJ-48 と組で売られる緑の基板 (ULN2003AN・XH 5P・表示 LED 4 個・ON/OFF ジャンパ)',
    view: '入力のヘッダ (下の辺、左から IN1〜IN4)・電源のヘッダ (右の辺、印字 - + を GND VCC と呼ぶ)・モータのコネクタ (上の辺、左から A B C D V+)',
    note: 'モータのコネクタは 28BYJ-48 のコネクタがそのまま挿さる (A=BLUE・B=PINK・C=YELLOW・D=ORANGE・V+=RED)。電源のヘッダの印字 `-` `+` は `GND` `VCC` と呼ぶ (配線の `--` と紛れないため)。電源は 5〜12 V、1 出力 500 mA まで。**電源のヘッダの + と - の上下は資料で確かめられていない** (基板の印字で確かめる)',
    source: 'Makerguides の資料 ULN2003-Stepper-Motor-Driver-PCB.pdf (2019-04、https://www.makerguides.com/wp-content/uploads/2019/04/ULN2003-Stepper-Motor-Driver-PCB.pdf)、p1 の基板の写真と Typical Connections の表',
  },
  {
    models: ['TP4056-MODULE', '03962A', 'TP4056-PROTECT'],
    names: ['IN+', 'IN-', 'OUT+', 'B+', 'B-', 'OUT-'],
    role: 'Li-ion の充電モジュール (TP4056、保護つき)', roleEn: 'Li-ion charger module (TP4056, with protection)',
    product: '03962A 系の保護つき基板 (TP4056 + DW01A + FS8205A。27.9 × 17.2 mm)',
    view: 'USB を左にして上から見て: 左上 IN+・左下 IN-、右の辺を上から OUT+・B+・B-・OUT-',
    note: '`B+` `B-` に電池、`OUT+` `OUT-` に負荷 (**OUT- は保護の FET を通る**ので B- と直結でない)。`IN+` `IN-` は USB の 5 V と並ぶ。**製造元の図は無く、個人のプロジェクトの KiCad データによる** (実物の印字で確かめる)',
    source: 'lilka-dev/lilka の hardware/v1/footprints/Connectors.pretty/Charge_Controller_TP4056.kicad_mod のパッドの座標と、connector.kicad_sym のピンの名前',
  },
  {
    models: ['NRF24L01+', 'NRF24L01', 'NRF24L01P'],
    names: ['GND', 'VCC', 'CE', 'CSN', 'SCK', 'MOSI', 'MISO', 'IRQ'],
    role: '2.4 GHz の無線モジュール (nRF24L01+、SPI)', roleEn: '2.4 GHz radio module (nRF24L01+, SPI)',
    product: 'PCB アンテナの小型品 (2 × 4 のピンヘッダ)',
    view: 'ピンの番号順 (1 番 GND は角パッド。奇数 1・3・5・7 と偶数 2・4・6・8 が 2 列に分かれ、列の間も 2.54 mm)',
    note: '**2 列が 2.54 mm で隣り合うので、ブレッドボードに挿すと向かいのピンがつながる**。線でつなぐ。電源は 3.3 V (5 V は不可)。`CSN` は L で選ぶ',
    source: 'KiCad 公式ライブラリ RF_Module:nRF24L01_Breakout (footprint、2026-02-06 版) と RF:NRF24L01_Breakout (symbol) のピンの番号・名前とパッドの座標',
  },
  {
    models: ['EC11', 'EC11E', 'EC11E15244G1'],
    names: ['A', 'C', 'B', 'D', 'E'],
    role: 'ロータリーエンコーダ (押しスイッチつき)', roleEn: 'rotary encoder (with push switch)',
    product: 'Alps Alpine EC11E15244G1 (縦型、軸 20 mm、30 クリック 15 パルス、押しスイッチつき)',
    view: '取付面から見て: 一列に A・C・B (2.5 mm 間隔)、14.5 mm 離れた列に D・E (5 mm 間隔、D が A の側)',
    note: '`A` `B` が 2 相の出力、`C` が共通。`D` `E` が押しスイッチ。**列の間 14.5 mm は 2.54 mm の格子に乗らない**ので、穴に挿す形は無い (挿せるのはモジュールの `KY-040`)',
    source: 'Alps Alpine EC11E Series のカタログ (Update 2510)、p2 の Drawing No.2 Mounting Hole Dimensions。KiCad 公式 Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm のパッドの座標も同じ',
  },
  {
    models: ['DRV8833-POLOLU', 'POLOLU-2130', 'POLOLU2130'],
    names: ['GND', 'VMM', 'BIN1', 'BIN2', 'AIN2', 'AIN1', 'SLP', 'FLT', 'GND2', 'VIN', 'BOUT1', 'BOUT2', 'AOUT2', 'AOUT1', 'AISEN', 'BISEN'],
    role: 'モータドライバ (DRV8833、2 回路の H ブリッジ)', roleEn: 'motor driver (DRV8833, dual H-bridge)',
    product: 'Pololu 2130 (DRV8833 Dual Motor Driver Carrier、0.5 × 0.8 インチ)',
    view: '部品面を上にして、左の列を上から (GND〜FLT)、続けて右の列を上から (GND2〜BISEN)',
    note: '2 列 × 8 本、列の間は 0.4 インチ (ブレッドボードの溝 0.3 インチより広い)。右の列の GND は `GND2` (基板の中で GND とつながる)。`SLP` (nSLEEP) は H で動く。`VIN` が電源の入力で、`VMM` は逆接保護を通した後',
    source: 'Pololu 2130 の製品ページ (https://www.pololu.com/product/2130)、上面のピン配置の図 0J3866 と寸法つきの下面の写真 0J3865',
  },
];

const BY_MODEL: ReadonlyMap<string, ModuleRow> = new Map(
  ROWS.flatMap((row) => row.models.map((model) => [model.toUpperCase(), row] as const)),
);

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const moduleTable = (): readonly ModuleRow[] => ROWS;

/** 機器の `model:` に書ける型番 (モジュールの表と、ピンの名前の表の代表の綴り)。 */
export const moduleModels = (): readonly string[] => ROWS.map((row) => row.models[0] ?? '');

/** 型番からモジュールの行を引く。表に無ければ null。 */
export function lookupModule(model: string): ModuleRow | null {
  return BY_MODEL.get(model.trim().toUpperCase()) ?? null;
}

/** 機器の型番の働き (モジュールの表、無ければピンの名前の表)。 */
export function deviceRole(model: string, lang: Lang = 'ja'): string | null {
  const row = lookupModule(model);
  if (row !== null) return lang === 'en' ? row.roleEn : row.role;
  return lookupRole(model, lang);
}

export type DeviceModelPins =
  | { readonly ok: true; readonly model: string; readonly names: readonly string[] }
  | { readonly ok: false; readonly message: string; readonly token: string };

/**
 * 機器の `model:` と、書かれた `pins:` (無ければ null) から、箱に出すピンを決める。
 *
 * - `pins:` が無ければ**表の全部を表の並びで**出す
 * - `pins:` があれば**書いた名前を書いた順で**出す (使うピンだけを並べてよい)。ただし表に無い名前は断る —
 *   綴りの誤り (`VDD` と `VCC`) を黙って箱に出さないため
 *
 * 引く順はモジュールの表、無ければピンの名前の表 (`HC-SR04` のような 1 列の物も箱で置ける)。
 */
export function resolveDeviceModel(model: string, written: readonly string[] | null): DeviceModelPins {
  const found = lookupModule(model);
  const table = found === null ? lookupPinoutNames(model) : { model: found.models[0] ?? '', names: found.names };
  if (table === null) {
    return {
      ok: false, token: model,
      message: `型番 ${model} は機器の表にありません (書ける型番: ${moduleModels().join(' ')} と、ピンの名前の表の型番)`,
    };
  }
  if (written === null) return { ok: true, model: table.model, names: table.names };
  const stranger = written.find((name) => !table.names.includes(name));
  if (stranger !== undefined) {
    return {
      ok: false, token: stranger,
      message: `${table.model} に ${stranger} というピンはありません (表のピン: ${table.names.join(' ')})`,
    };
  }
  return { ok: true, model: table.model, names: written };
}
