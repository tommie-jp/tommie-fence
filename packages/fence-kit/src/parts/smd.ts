/**
 * **面実装のパッケージの表**。板の 2 つが同じ表を読む (52 の docs/64)。
 * `boards.ts` (マイコンボードの足) や `connectors.ts` (USB) と同じく、実物の話で
 * 板に依らないのでここに 1 つだけ置く。**表に 1 行足せば姿が 1 つ増える。**
 *
 * 姿の綴りは 3 通り:
 *
 * - `sot346-dip` — **変換基板に載っている** (秋月の「DIP 化基板」)。SIP3 の基板も
 *   DIP 化と呼ばれるので `-dip`。breadboard と perfboard の両方が受け取る
 * - `sot346` — **ユニバーサル基板に直付け**。perfboard だけが受け取る
 *   (ブレッドボードには挿せない)
 * - `dip8/sop` — 種類が DIP なので、姿は載っている物の名前だけ。変換基板に載っている
 *
 * **寸法は mm で持つ** (実物の資料から写せる)。px へは `SMD_PX_PER_MM` の 1 か所で
 * 換える — 板の 2 つはどちらも穴のピッチ 2.54mm を 20px で描く。
 *
 * 別名 (`aka`) は**綴りとしては受け取らない** (breadboard-fence/06 の「別名なし」)。
 * 知らない姿を書かれたときに「S-Mini は sot346 と書きます」と返すのに使う。
 */

/** 板の 2 つの穴のピッチ (px) と、それが表す長さ (mm)。 */
const BOARD_PITCH_PX = 20;
const BOARD_PITCH_MM = 2.54;

/** 1mm が何 px か。**表の寸法はこれを掛けて描く。** */
export const SMD_PX_PER_MM = BOARD_PITCH_PX / BOARD_PITCH_MM;

/** 直付けの置き方。**隣の穴 / 2 穴 / 三角** (1 番と 2 番を隣の穴、3 番を次の行)。 */
export type SmdMount = 'adjacent' | 'two-holes' | 'triangle';

type Common = {
  /** 部品表と文書に出す名前。 */
  readonly name: string;
  /** ほかの呼び名 (メーカーの名前・JEITA 名など)。綴りとしては受け取らない。 */
  readonly aka: readonly string[];
  /** 変換基板に載せた姿 (`-dip`) を作るか。 */
  readonly adapter: boolean;
  /** 直付けの置き方。null は直付けしない (perfboard でも受け取らない)。 */
  readonly mount: SmdMount | null;
  /** この姿を持つ種類。`dip` は `dip4`〜`dip40` の全部。 */
  readonly types: readonly string[];
};

/** 両端に電極のあるチップ (抵抗・コンデンサ・LED)。 */
export type ChipSpec = Common & {
  readonly kind: 'chip';
  /** 全長と幅 (mm)。電極は長さの両端に含まれる。 */
  readonly length: number;
  readonly width: number;
};

/** 樹脂の胴の両端から平たい足が出るダイオード (SOD・DO-214)。 */
export type LeadedSpec = Common & {
  readonly kind: 'leaded';
  /** 樹脂の胴 (mm)。 */
  readonly length: number;
  readonly width: number;
  /** 足先から足先 (mm)。 */
  readonly span: number;
  /** 足の幅 (mm)。 */
  readonly lead: number;
};

/** 3 本足のトランジスタ型 (SOT)。 */
export type SotSpec = Common & {
  readonly kind: 'sot';
  /** 胴の長さ (足の並ぶ向き) と幅 (mm)。 */
  readonly length: number;
  readonly width: number;
  /** 足先から足先 (幅の向き。mm)。 */
  readonly span: number;
  /** 足の間隔 (mm)。 */
  readonly pitch: number;
  /** 3 本の足が同じ側に並び、反対側に放熱タブが出る (SOT-89)。 */
  readonly tab: boolean;
};

/** 2 列に足が並ぶ IC (SOP 系)。長さは足の数で決まる。 */
export type RowSpec = Common & {
  readonly kind: 'row';
  /** 胴の幅と、足先から足先 (mm)。 */
  readonly width: number;
  readonly span: number;
  /** 足の間隔 (mm)。 */
  readonly pitch: number;
  /** 胴の長さ = 片側の足の数 × 間隔 + これ (mm)。 */
  readonly ends: number;
};

export type SmdSpec = ChipSpec | LeadedSpec | SotSpec | RowSpec;

const TRANSISTOR_LIKE = ['transistor'];
const CHIP_TYPES = ['resistor', 'capacitor'];
const DIODES = ['diode', 'zener', 'schottky'];

/**
 * 表。**並びが姿の並び** (パレットと文書に出る順)。寸法の出所:
 * SOT-23 / SOT-346 / SOT-89 は各社のパッケージ図 (東芝 S-Mini・NXP SOT346)、
 * チップは JIS の呼び寸法、SOD・DO-214AC・SOP・TSSOP は JEDEC の代表値。
 *
 * **オブジェクトではなく並びで持つ。** `1608` のような数字だけの見出しは、
 * オブジェクトに入れると先頭へ並び替わる (JavaScript の決まり)。
 */
const SMD: readonly (readonly [string, SmdSpec])[] = [
  ['sot23', {
    kind: 'sot', name: 'SOT-23', aka: ['SOT-23', 'TO-236AB', 'SST3'],
    length: 2.9, width: 1.3, span: 2.4, pitch: 0.95, tab: false,
    adapter: true, mount: 'triangle', types: [...TRANSISTOR_LIKE, 'regulator'],
  }],
  // S-Mini (東芝) = SC-59 (JEITA) = SOT-346。SOT-23 と同じ 0.95mm で、胴が 0.3mm 広い。
  ['sot346', {
    kind: 'sot', name: 'SOT-346', aka: ['S-Mini', 'SC-59', 'SOT-346', 'SMT3', 'MPAK'],
    length: 2.9, width: 1.6, span: 2.8, pitch: 0.95, tab: false,
    adapter: true, mount: 'triangle', types: TRANSISTOR_LIKE,
  }],
  // タブが板に半田付けされる前提の形で、直付けは置き方の約束が 1 つ増える (後回し)。
  ['sot89', {
    kind: 'sot', name: 'SOT-89', aka: ['SOT-89', 'SC-62', 'PW-Mini', 'MPT3'],
    length: 4.5, width: 2.5, span: 4.1, pitch: 1.5, tab: true,
    adapter: true, mount: null, types: [...TRANSISTOR_LIKE, 'regulator'],
  }],
  ['1608', {
    kind: 'chip', name: '1608', aka: ['0603'], length: 1.6, width: 0.8,
    adapter: false, mount: 'adjacent', types: [...CHIP_TYPES, 'led'],
  }],
  ['2012', {
    kind: 'chip', name: '2012', aka: ['0805'], length: 2.0, width: 1.25,
    adapter: false, mount: 'adjacent', types: [...CHIP_TYPES, 'led'],
  }],
  ['3216', {
    kind: 'chip', name: '3216', aka: ['1206'], length: 3.2, width: 1.6,
    adapter: false, mount: 'adjacent', types: CHIP_TYPES,
  }],
  ['sod123', {
    kind: 'leaded', name: 'SOD-123', aka: ['SOD-123'], length: 2.7, width: 1.6, span: 3.7, lead: 0.6,
    adapter: false, mount: 'adjacent', types: DIODES,
  }],
  ['sod323', {
    kind: 'leaded', name: 'SOD-323', aka: ['SOD-323', 'SC-76'], length: 1.7, width: 1.25, span: 2.5, lead: 0.3,
    adapter: false, mount: 'adjacent', types: DIODES,
  }],
  // 通称の SMA は同軸コネクタの種類名 `sma` と被るので JEDEC の名前で書く。
  ['do214ac', {
    kind: 'leaded', name: 'DO-214AC', aka: ['DO-214AC', 'SMA'], length: 4.3, width: 2.6, span: 5.2, lead: 1.4,
    adapter: false, mount: 'two-holes', types: DIODES,
  }],
  ['sop', {
    kind: 'row', name: 'SOP', aka: ['SOP', 'SOIC', 'SO'], width: 3.9, span: 6.0, pitch: 1.27, ends: -0.2,
    adapter: true, mount: null, types: ['dip'],
  }],
  ['tssop', {
    kind: 'row', name: 'TSSOP', aka: ['TSSOP'], width: 4.4, span: 6.4, pitch: 0.65, ends: 0.4,
    adapter: true, mount: null, types: ['dip'],
  }],
];

/** 変換基板に載せた姿の綴りの尻。 */
const ADAPTER = '-dip';

const DIP_TYPE = /^dip\d+$/;

/** 種類名は入力から来るので、Map で引く (素の添字だと `constructor` が Object.prototype から拾える)。 */
const BY_KEY: ReadonlyMap<string, SmdSpec> = new Map(SMD);

const specOf = (key: string): SmdSpec | null => BY_KEY.get(key) ?? null;

/** 表の種類の欄に照らす名前。`dip8` は `dip` として引く。 */
const tableType = (type: string): string => (DIP_TYPE.test(type) ? 'dip' : type);

export type SmdLook = {
  /** 表の見出し (`sot346`)。 */
  readonly key: string;
  readonly spec: SmdSpec;
  /** 変換基板に載っているか。false は直付け。 */
  readonly onAdapter: boolean;
};

/**
 * 姿の綴りを表に照らす。面実装の姿でなければ null。
 * **2 列の IC (`sop`) は書いただけで変換基板** — 種類が DIP なので `-dip` を付けない。
 */
export function smdLook(variant: string | null): SmdLook | null {
  if (variant === null) return null;
  const onAdapter = variant.endsWith(ADAPTER);
  const key = onAdapter ? variant.slice(0, -ADAPTER.length) : variant;
  const spec = specOf(key);
  if (spec === null) return null;
  if (spec.kind === 'row') return onAdapter ? null : { key, spec, onAdapter: true };
  if (onAdapter && !spec.adapter) return null;
  if (!onAdapter && spec.mount === null) return null;
  return { key, spec, onAdapter };
}

/** 変換基板に載った 3 本足の姿か (`transistor/sot346-dip`)。 */
export const isSmdAdapter = (variant: string | null): boolean => {
  const look = smdLook(variant);
  return look !== null && look.onAdapter && look.spec.kind === 'sot';
};

/** 直付けの姿か (`resistor/2012`、`transistor/sot346`)。 */
export const isDirectSmd = (variant: string | null): boolean => {
  const look = smdLook(variant);
  return look !== null && !look.onAdapter;
};

/** その板で選べる面実装の姿。**並びは表の順、変換基板が先**。 */
export function smdLooksOf(type: string, board: 'breadboard' | 'perfboard'): readonly string[] {
  const wanted = tableType(type);
  const specs = SMD.filter(([, spec]) => spec.types.includes(wanted));
  const adapters = specs
    .filter(([, spec]) => spec.adapter)
    .map(([key, spec]) => (spec.kind === 'row' ? key : `${key}${ADAPTER}`));
  if (board === 'breadboard') return adapters;
  return [...adapters, ...specs.filter(([, spec]) => spec.mount !== null).map(([key]) => key)];
}

/**
 * 同じ物を変換基板に載せた姿 (`sot346` → `sot346-dip`)。**その種類の変換基板が
 * 表にあるときだけ**返す。直付けを持たない物 (`sot89`) も引ける — 書いた人が
 * 変換基板のことを言っているかもしれないため。
 */
export function adapterFor(type: string, variant: string | null): string | null {
  if (variant === null || variant.endsWith(ADAPTER)) return null;
  const spec = specOf(variant);
  if (spec === null || !spec.adapter || spec.kind === 'row') return null;
  const spelled = `${variant}${ADAPTER}`;
  return smdLooksOf(type, 'breadboard').includes(spelled) ? spelled : null;
}

const plain = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * 別名から表の綴りを引く (`S-Mini` → `sot346`、`sc-59-dip` → `sot346-dip`)。
 * **知らない姿の案内にだけ使う** — 別名を綴りとして受け取ると、同じ物が
 * 部品表に 2 つの名前で並ぶ。
 */
export function smdSpelling(written: string): string | null {
  const lower = written.toLowerCase();
  const onAdapter = lower.endsWith(ADAPTER);
  const head = plain(onAdapter ? lower.slice(0, -ADAPTER.length) : lower);
  if (head === '') return null;
  const found = SMD.find(([key, spec]) =>
    key === head || spec.aka.some((name) => plain(name) === head));
  if (found === undefined) return null;
  const [key, spec] = found;
  return onAdapter && spec.kind !== 'row' ? `${key}${ADAPTER}` : key;
}

/**
 * 知らない姿を書かれたときの書き直し先。**別名** (`s-mini` → `sot346`) と
 * **変換基板** (`sot89` → `sot89-dip`) を順に試し、その板で書ける綴りを返す。
 * 無ければ null。板の 2 つが同じ順で試すので、同じ書き間違いに同じ案内を返す。
 */
export function smdSuggestion(type: string, written: string, allowed: readonly string[]): string | null {
  const spelled = smdSpelling(written);
  const candidates = [spelled, adapterFor(type, written), adapterFor(type, spelled)];
  return candidates.find((one): one is string => one !== null && one !== written && allowed.includes(one)) ?? null;
}

/**
 * 差し込み型の姿の表に、面実装の姿を足す (種類ごと、表の順)。板の 2 つが
 * 同じ手で足すので、変換基板の綴りが食い違わない。
 */
export const withSmdLooks = (
  table: Readonly<Record<string, readonly string[]>>,
  board: 'breadboard' | 'perfboard',
): Record<string, readonly string[]> =>
  Object.fromEntries(Object.entries(table).map(([type, looks]) => [type, [...looks, ...smdLooksOf(type, board)]]));

/** 直付けの SOT の表 (`transistor/sot346`)。直付けの SOT でなければ null。 */
export function directSotSpec(variant: string | null): SotSpec | null {
  const look = smdLook(variant);
  return look !== null && !look.onAdapter && look.spec.kind === 'sot' ? look.spec : null;
}

/**
 * パレットから 1 穴で置くときの足の並べ方 (アンカーからの行と列)。
 * 直付けの姿だけが持つ — 隣の穴・2 穴・三角。ほかは null (種類の既定で並べる)。
 */
export function smdOffsets(variant: string | null): readonly { readonly row: number; readonly col: number }[] | null {
  const look = smdLook(variant);
  if (look === null || look.onAdapter) return null;
  switch (look.spec.mount) {
    case 'adjacent':
      return [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    case 'two-holes':
      return [{ row: 0, col: 0 }, { row: 0, col: 2 }];
    case 'triangle':
      return [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }];
    default:
      return null;
  }
}

/** 直付けの置き方。直付けの姿でなければ null。 */
export const smdMount = (variant: string | null): SmdMount | null => {
  const look = smdLook(variant);
  return look === null || look.onAdapter ? null : look.spec.mount;
};

/** 表の全部 (文書と試験が読む)。 */
export const smdTable = (): readonly (readonly [string, SmdSpec])[] => SMD;
