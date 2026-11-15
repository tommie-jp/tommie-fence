import type { Lang } from '../lang.ts';
import { lookupPinoutNames, lookupRole } from './pinouts.ts';
import { BUNDLED_CARDS } from './cards/bundled.gen.ts';
import { moduleRows } from './cards/convert.ts';
import { cardModule } from './cards/scope.ts';
import type { DeviceLookName } from './deviceLooks.ts';

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
  readonly product?: string;
  /** 並びを見る向き。 */
  readonly view?: string;
  /** 文書の表に添える一言。 */
  readonly note?: string;
  /** 確かめた資料。 */
  readonly source?: string;
  /**
   * 図に刷る字 (配線の名前と違う物だけ)。**1 つの機器の中で名前が重なる** (Debug Probe の 2 つの GND) とき、
   * 配線の名前は分け (`UGND` `DGND`)、刷る字は実物どおりにする (コネクタの表の `silk` と同じ仕組み)。
   */
  readonly silk?: Readonly<Record<string, string>>;
  /** 色を書かない線の色 (配線の色の名前)。**付属のケーブルの色が決まっている物**だけが持つ。 */
  readonly wireColors?: Readonly<Record<string, string>>;
  /** 箱の代わりに描く姿 (`deviceLooks.ts`)。無ければ箱。 */
  readonly look?: DeviceLookName;
  /**
   * 製品の正式名称 (作り手の表記のまま)。**部品表の値の欄と、`label:` を書かないときの名札**に出す。
   * 型番 (`RPI-DEBUG-PROBE`) は書くための綴りで、買う物の名前ではないため。
   */
  readonly name?: string;
  /** 部品カードから読んだ行。 */
  readonly card?: 'bundled' | 'local';
};

const TS_ROWS: readonly ModuleRow[] = [
  // ほかの 7 行は同梱の部品カード (`packages/fence-kit/parts/modules/*.part.yaml`) に移した (52 の docs/160)。
  // Debug Probe はカードに無い欄 (刷る字・線の色・姿・正式名称) を持つので、ここに残す。
  {
    // **型番に作り手 (`RPI-`) を付ける。** ほかのマイコン用のデバッグ機器 (ST-LINK・J-Link) を
    // 後から足したとき、裸の `DEBUG-PROBE` ではどれか分からない (52 の docs/157)。
    models: ['RPI-DEBUG-PROBE', 'RASPBERRY-PI-DEBUG-PROBE'],
    names: ['TX', 'UGND', 'RX', 'SC', 'DGND', 'SD'],
    role: 'デバッグプローブ (Raspberry Pi、SWD と UART)', roleEn: 'debug probe (Raspberry Pi, SWD and UART)',
    product: 'Raspberry Pi Debug Probe (ケースと 3 種のケーブルつき。USB の口は micro-B)',
    view: 'USB を上、3 ピンの口を下にして上から見て: 左の口 U (左から TX・GND・RX)、右の口 D (左から SC・GND・SD)',
    note: '名前は **Probe の側から見た名前** (`TX` は Probe から出る) なので、U の `TX` を相手の RX (Pico の GP1) へ、`RX` を相手の TX (GP0) へ。'
      + 'D の `SC` `GND` `SD` は Pico の SWCLK・GND・SWDIO へ。GND は 2 つあるので `UGND` `DGND` と呼び、図には GND と刷る。'
      + '**線の色を書かなければ付属のケーブルの色** (橙 = TX・SC、黒 = GND、黄 = RX・SD)。I/O は 3.3 V。'
      // 文書の表はこの注から書き出す (52 の docs/160)。3 つのフェンスで同じ字にするので、実体配線図と回路図の違いも書く。
      + '実体配線図 (bread・perf) は**帯に並べると箱ではなく実物の姿で描く** (`size:` で large = 実寸・medium (既定)・small。ロゴは描かない)。'
      + '名札と部品表には正式名称 Raspberry Pi Debug Probe が出る。回路図では箱で描き、ピンの名前は配線の名前 (`UGND` `DGND`) のまま',
    source: 'Raspberry Pi の Debug Probe の文書 (https://www.raspberrypi.com/documentation/microcontrollers/debug-probe.html) のケーブルの色 (orange TX/SC・black GND・yellow RX/SD)、'
      + '3 ピンのデバッグコネクタの仕様 RP-003139-SP (1 番 SC/TX・2 番 GND・3 番 SD/RX。JST SH 1.0 mm)、寸法図 RP-008192-DS (32 × 22 mm、USB と 3 ピンの口は反対の短辺)。2026-11-15',
    silk: { UGND: 'GND', DGND: 'GND' },
    wireColors: { TX: 'orange', UGND: 'black', RX: 'yellow', SC: 'orange', DGND: 'black', SD: 'yellow' },
    look: 'rpi-debug-probe',
    name: 'Raspberry Pi Debug Probe',
  },

];

/** 表の全部。TS の行のあとに同梱の部品カード (52 の docs/158)。 */
const ROWS: readonly ModuleRow[] = [...TS_ROWS, ...moduleRows(BUNDLED_CARDS, 'bundled')];

const BY_MODEL: ReadonlyMap<string, ModuleRow> = new Map(
  ROWS.flatMap((row) => row.models.map((model) => [model.toUpperCase(), row] as const)),
);

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const moduleTable = (): readonly ModuleRow[] => ROWS;

/** 機器の `model:` に書ける型番 (モジュールの表と、ピンの名前の表の代表の綴り)。 */
export const moduleModels = (): readonly string[] => ROWS.map((row) => row.models[0] ?? '');

/** 型番からモジュールの行を引く。表に無ければ null。 */
export function lookupModule(model: string): ModuleRow | null {
  return BY_MODEL.get(model.trim().toUpperCase()) ?? cardModule(model) ?? null;
}

/** 機器の型番の働き (モジュールの表、無ければピンの名前の表)。 */
export function deviceRole(model: string, lang: Lang = 'ja'): string | null {
  const row = lookupModule(model);
  if (row !== null) return lang === 'en' ? row.roleEn : row.role;
  return lookupRole(model, lang);
}

/** 機器のピンに刷る字。表に `silk` が無ければ配線の名前のまま。 */
export function deviceSilk(model: string | null, pin: string): string {
  const silk = model === null ? undefined : lookupModule(model)?.silk;
  return silk !== undefined && Object.hasOwn(silk, pin) ? silk[pin] ?? pin : pin;
}

/** 色を書かない線の色 (配線の色の名前)。表に無ければ null。 */
export function deviceWireColor(model: string | null, pin: string): string | null {
  const colors = model === null ? undefined : lookupModule(model)?.wireColors;
  return colors !== undefined && Object.hasOwn(colors, pin) ? colors[pin] ?? null : null;
}

/** 製品の正式名称 (`Raspberry Pi Debug Probe`)。表に無ければ null。 */
export function deviceProductName(model: string | null): string | null {
  return model === null ? null : lookupModule(model)?.name ?? null;
}

/** 箱の代わりに描く姿。無ければ null (箱で描く)。 */
export function deviceLookOf(model: string | null): DeviceLookName | null {
  return model === null ? null : lookupModule(model)?.look ?? null;
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
