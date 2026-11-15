import type { DiscreteKind } from '../discretes.ts';
import type { UsbKind } from '../deviceLooks.ts';
import { checkPinNames } from './pinNames.ts';
import type { CardIssue, CardSpice, PartCard } from './types.ts';

/**
 * 部品カードを検める (52 の docs/158 の 1-2)。受けるのは **YAML を読んだ後の値** — fence-kit は
 * YAML を読む依存を持てないので、字を読むのは `part-card` のパッケージ。
 *
 * - 知らない欄は断る (綴りの誤りを黙って捨てない)
 * - 誤りが 1 つでもあればカードは null (`notice` だけなら読む)
 */
export type CardRead = { readonly card: PartCard | null; readonly issues: readonly CardIssue[] };

type Path = readonly (string | number)[];
type Fields = Readonly<Record<string, unknown>>;

const COMMON = ['models', 'package', 'pins', 'role', 'role-en', 'note', 'source', 'spice'];
const BY_KIND: Readonly<Record<PartCard['kind'], readonly string[]>> = {
  chip: ['look', 'outline', 'smd', 'ic'],
  discrete: ['kind', 'case'],
  module: ['view', 'product'],
  board: ['name', 'chip', 'row-span', 'reach', 'usb', 'mark', 'hdmi', 'wireless'],
};

/** 書ける欄 (JSON Schema と食い違わないことを `part-card` の試験が見張る)。 */
export const cardFields = (): { readonly common: readonly string[]; readonly byKind: Readonly<Record<PartCard['kind'], readonly string[]>> } =>
  ({ common: COMMON, byKind: BY_KIND });

const DISCRETE_KINDS: readonly DiscreteKind[] = ['npn', 'pnp', 'nch-mos', 'pch-mos', 'nch-jfet', 'pch-jfet', 'regulator'];
const USB_KINDS: readonly UsbKind[] = ['micro-b', 'usb-c', 'usb-a'];
const DIP_RANGE = { min: 4, max: 40 } as const;
const SIP_RANGE = { min: 2, max: 40 } as const;
const MAX_MODELS = 40;
const MAX_TEXT = 2000;
/** Pico の 40 ピンと Tang Nano 9K の 48 ピンの倍まで。 */
const MAX_BOARD_PINS = 96;
const MAX_DEVICE_PINS = 64;
/** ボードの縁の張り出しの既定 (Pico と同じ)。 */
const DEFAULT_REACH = 0.55;
/** 1 列の部品の色。`#rrggbb` だけ (SVG にそのまま書くので、ほかの字を通さない)。 */
const COLOR = /^#[0-9a-fA-F]{6}$/;
/** ボードの種類の名前 (`pico2` と同じ綴り)。 */
const BOARD_TYPE = /^[a-z][a-z0-9-]*$/;

/** 姿の綴り (`dip14` `dip28/wide` `sip4` `transistor/to92` `device` `board`)。 */
type PackageRead =
  | { readonly kind: 'chip'; readonly count: number }
  | { readonly kind: 'discrete'; readonly type: 'transistor' | 'regulator'; readonly variant: string | null }
  | { readonly kind: 'module' }
  | { readonly kind: 'board' };

function readPackage(written: string): PackageRead | string {
  const chip = /^(dip|sip)(\d+)(?:\/[a-z0-9-]+)?$/.exec(written);
  if (chip !== null) {
    const count = Number(chip[2]);
    const range = chip[1] === 'dip' ? DIP_RANGE : SIP_RANGE;
    if (count < range.min || count > range.max) return `${chip[1]} のピンの数は ${range.min}〜${range.max} です`;
    if (chip[1] === 'dip' && count % 2 !== 0) return 'dip のピンの数は偶数です';
    return { kind: 'chip', count };
  }
  const discrete = /^(transistor|regulator)(?:\/([a-z0-9-]+))?$/.exec(written);
  if (discrete !== null) {
    return { kind: 'discrete', type: discrete[1] === 'regulator' ? 'regulator' : 'transistor', variant: discrete[2] ?? null };
  }
  if (written === 'device') return { kind: 'module' };
  if (written === 'board') return { kind: 'board' };
  return `package: ${written} は書けません (dipN・sipN・transistor/…・regulator/…・device・board。姿は dip28/wide のように / で続けます)`;
}

/** パッケージの名前の既定 (`to92` → `TO-92`)。 */
const caseOf = (variant: string | null): string =>
  (variant === null ? 'TO-92' : variant.replace(/^to(\d+)(.*)$/, (_all, digits: string, rest: string) => `TO-${digits}${rest.toUpperCase()}`).replace(/^(sot\d+).*/, (sot: string) => sot.toUpperCase()));

class Reader {
  readonly issues: CardIssue[] = [];

  error(path: Path, message: string): void {
    this.issues.push({ path, message, severity: 'error' });
  }

  text(fields: Fields, key: string, required: boolean): string | undefined {
    const value = fields[key];
    if (value === undefined || value === null) {
      if (required) this.error([key], `${key}: がありません`);
      return undefined;
    }
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') {
      this.error([key], `${key}: は字で書きます`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      if (required) this.error([key], `${key}: が空です`);
      return undefined;
    }
    if (trimmed.length > MAX_TEXT) {
      this.error([key], `${key}: が長すぎます (${MAX_TEXT} 字まで)`);
      return undefined;
    }
    return trimmed;
  }

  number(fields: Fields, key: string, path: Path = [key]): number | undefined {
    const value = fields[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.error(path, `${path.join('.')}: は数で書きます`);
      return undefined;
    }
    return value;
  }

  bool(fields: Fields, key: string): boolean | undefined {
    const value = fields[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
      this.error([key], `${key}: は true か false で書きます`);
      return undefined;
    }
    return value;
  }

  /** 字の並び。数だけの要素 (`- 1`) も字として読む。 */
  list(value: unknown, path: Path, label: string): readonly string[] | undefined {
    if (!Array.isArray(value)) {
      this.error(path, `${label} は並び ([A, B]) で書きます`);
      return undefined;
    }
    const out: string[] = [];
    value.forEach((item: unknown, index) => {
      if (typeof item === 'string') out.push(item.trim());
      else if (typeof item === 'number') out.push(String(item));
      else this.error([...path, index], `${label} の ${index + 1} つめは字で書きます`);
    });
    return out;
  }

  map(value: unknown, path: Path, allowed: readonly string[]): Fields | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.error(path, `${path.join('.')}: は欄を並べて書きます`);
      return undefined;
    }
    const fields = value as Fields;
    for (const key of Object.keys(fields)) {
      if (!allowed.includes(key)) this.error([...path, key], `${[...path, key].join('.')}: という欄はありません (書ける欄: ${allowed.join(' ')})`);
    }
    return fields;
  }

  numbers(value: unknown, path: Path, keys: readonly string[], optionalKeys: readonly string[] = []): Record<string, number> | undefined {
    const fields = this.map(value, path, [...keys, ...optionalKeys]);
    if (fields === undefined) return undefined;
    const out: Record<string, number> = {};
    for (const key of keys) {
      const read = this.number(fields, key, [...path, key]);
      if (read === undefined) {
        if (fields[key] === undefined) this.error([...path, key], `${[...path, key].join('.')}: がありません`);
        return undefined;
      }
      out[key] = read;
    }
    return out;
  }
}

function readModels(reader: Reader, fields: Fields): readonly string[] | undefined {
  if (fields['models'] === undefined) {
    reader.error(['models'], 'models: がありません (書ける型番を並べます。先頭が代表の綴り)');
    return undefined;
  }
  const models = reader.list(fields['models'], ['models'], 'models:');
  if (models === undefined) return undefined;
  if (models.length === 0) reader.error(['models'], 'models: に型番が 1 つもありません');
  if (models.length > MAX_MODELS) reader.error(['models'], `models: は ${MAX_MODELS} 個までです`);
  const seen = new Set<string>();
  models.forEach((model, index) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_+\-./]*$/.test(model)) {
      reader.error(['models', index], `型番 ${model} は英数字で始め、英数字と _ + - . / だけで書きます`);
    }
    if (seen.has(model.toUpperCase())) reader.error(['models', index], `型番 ${model} が 2 度あります`);
    seen.add(model.toUpperCase());
  });
  return models;
}

function readSpice(reader: Reader, value: unknown, pins: readonly string[]): CardSpice | undefined {
  const fields = reader.map(value, ['spice'], ['model', 'lib', 'nodes']);
  if (fields === undefined) return undefined;
  const model = reader.text(fields, 'model', false);
  if (model === undefined) {
    reader.error(['spice', 'model'], 'spice.model: がありません (.model / .subckt の名前)');
    return undefined;
  }
  const lib = reader.text(fields, 'lib', false);
  const nodes = fields['nodes'] === undefined ? undefined : reader.list(fields['nodes'], ['spice', 'nodes'], 'spice.nodes:');
  nodes?.forEach((node, index) => {
    if (!pins.includes(node)) reader.error(['spice', 'nodes', index], `spice.nodes: の ${node} は pins: にありません (節点の順をピンの名前で書きます)`);
  });
  return { model, ...(lib === undefined ? {} : { lib }), ...(nodes === undefined ? {} : { nodes }) };
}

function readChipExtras(reader: Reader, fields: Fields, pins: readonly string[]) {
  const look = fields['look'] === undefined ? undefined : (() => {
    const map = reader.map(fields['look'], ['look'], ['body', 'edge']);
    if (map === undefined) return undefined;
    const body = reader.text(map, 'body', false);
    const edge = reader.text(map, 'edge', false);
    for (const [key, color] of [['body', body], ['edge', edge]] as const) {
      if (color === undefined || !COLOR.test(color)) {
        reader.error(['look', key], `look.${key}: は #rrggbb の色で書きます (#2f7d4f)`);
        return undefined;
      }
    }
    return body === undefined || edge === undefined ? undefined : { body, edge };
  })();

  const outline = fields['outline'] === undefined ? undefined : (() => {
    const map = reader.map(fields['outline'], ['outline'], ['along', 'across', 'inset', 'jack', 'mark']);
    if (map === undefined) return undefined;
    const sizes = reader.numbers({ along: map['along'], across: map['across'], inset: map['inset'] }, ['outline'], ['along', 'across', 'inset']);
    const jack = reader.numbers(map['jack'], ['outline', 'jack'], ['along', 'from', 'to']);
    const mark = reader.text(map, 'mark', false) ?? '';
    if (sizes === undefined || jack === undefined) return undefined;
    return {
      along: sizes['along'] ?? 0, across: sizes['across'] ?? 0, inset: sizes['inset'] ?? 0,
      jack: { along: jack['along'] ?? 0, from: jack['from'] ?? 0, to: jack['to'] ?? 0 }, mark,
    };
  })();

  const smd = fields['smd'] === undefined ? undefined : (() => {
    const map = reader.map(fields['smd'], ['smd'], ['length', 'width', 'span', 'pitch', 'lead', 'wide', 'mark']);
    if (map === undefined) return undefined;
    const { mark: _mark, wide: _wide, ...rest } = map;
    const sizes = reader.numbers(rest, ['smd'], ['length', 'width', 'span', 'pitch', 'lead']);
    const wide = map['wide'] === undefined ? undefined : reader.numbers(map['wide'], ['smd', 'wide'], ['pin', 'lead']);
    const mark = reader.text(map, 'mark', true);
    if (sizes === undefined || mark === undefined || (map['wide'] !== undefined && wide === undefined)) return undefined;
    return {
      length: sizes['length'] ?? 0, width: sizes['width'] ?? 0, span: sizes['span'] ?? 0,
      pitch: sizes['pitch'] ?? 0, lead: sizes['lead'] ?? 0,
      ...(wide === undefined ? {} : { wide: { pin: wide['pin'] ?? 0, lead: wide['lead'] ?? 0 } }),
      mark,
    };
  })();

  const ic = fields['ic'] === undefined ? undefined : (() => {
    const map = reader.map(fields['ic'], ['ic'], ['left', 'right', 'top', 'bottom']);
    if (map === undefined) return undefined;
    const side = (key: 'left' | 'right' | 'top' | 'bottom'): readonly string[] => {
      if (map[key] === undefined) return [];
      const names = reader.list(map[key], ['ic', key], `ic.${key}:`) ?? [];
      names.forEach((name, index) => {
        if (!pins.includes(name)) reader.error(['ic', key, index], `ic.${key}: の ${name} は pins: にありません`);
      });
      return names;
    };
    const sides = { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') };
    // **全部のピンを 1 度ずつ。** 箱は全部のピンに口を作るので、抜けたピンがあると TeX が止まる
    // (同梱の表の割り振りも circuit-fence の試験が同じ決まりで見張る)。
    const left = [...pins];
    const twice: string[] = [];
    for (const name of [...sides.left, ...sides.right, ...sides.top, ...sides.bottom]) {
      const at = left.indexOf(name);
      if (at < 0) twice.push(name);
      else left.splice(at, 1);
    }
    const unknownOrTwice = twice.filter((name) => pins.includes(name));
    if (left.length > 0) reader.error(['ic'], `ic: に置いていないピンがあります (${left.join(' ')})。全部のピンを 1 度ずつ left: right: top: bottom: のどれかに置きます`);
    if (unknownOrTwice.length > 0) reader.error(['ic'], `ic: に 2 度置いたピンがあります (${unknownOrTwice.join(' ')})`);
    return sides;
  })();

  return { look, outline, smd, ic };
}

const only = <V>(key: string, value: V | undefined): Record<string, V> => (value === undefined ? {} : { [key]: value });

/** YAML を読んだ後の値を検めて、部品カードにする。 */
export function readCard(value: unknown): CardRead {
  const reader = new Reader();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reader.error([], '部品カードは欄 (models: package: pins: role: source:) を並べて書きます');
    return { card: null, issues: reader.issues };
  }
  const fields = value as Fields;

  const packageText = reader.text(fields, 'package', true);
  const read = packageText === undefined ? undefined : readPackage(packageText);
  if (typeof read === 'string') reader.error(['package'], read);
  const pkg = typeof read === 'string' ? undefined : read;

  const allowed = [...COMMON, ...(pkg === undefined ? Object.values(BY_KIND).flat() : BY_KIND[pkg.kind])];
  for (const key of Object.keys(fields)) {
    if (!allowed.includes(key)) {
      const owner = (Object.keys(BY_KIND) as PartCard['kind'][]).find((kind) => BY_KIND[kind].includes(key));
      reader.error([key], owner === undefined
        ? `${key}: という欄はありません`
        : `${key}: は package: が ${packageText ?? '?'} のカードには書けません`);
    }
  }

  const models = readModels(reader, fields);
  const role = reader.text(fields, 'role', true);
  const roleEn = reader.text(fields, 'role-en', false);
  const note = reader.text(fields, 'note', false);
  const source = reader.text(fields, 'source', true);
  if (fields['source'] === undefined) {
    // 上の「ありません」に、なぜ要るかを足す。
    reader.issues.pop();
    reader.error(['source'], 'source: がありません。並びを確かめた資料 (データシートの名前・版・図の番号) を書きます');
  }

  const pins = fields['pins'] === undefined ? undefined : reader.list(fields['pins'], ['pins'], 'pins:');
  if (fields['pins'] === undefined) reader.error(['pins'], 'pins: がありません (ピンの名前を並べます)');
  if (pins !== undefined) reader.issues.push(...checkPinNames(pins));

  const spice = fields['spice'] === undefined || pins === undefined ? undefined : readSpice(reader, fields['spice'], pins);

  if (pkg !== undefined && pins !== undefined) countCheck(reader, pkg, pins.length);

  const base = (models === undefined || role === undefined || source === undefined || pins === undefined || pkg === undefined || packageText === undefined)
    ? null
    : { models, package: packageText, role, source, ...only('roleEn', roleEn), ...only('note', note), ...only('spice', spice) };

  const card = base === null || pkg === undefined || pins === undefined ? null : buildCard(reader, fields, pkg, base, pins);
  const failed = reader.issues.some((issue) => issue.severity === 'error');
  return { card: failed ? null : card, issues: reader.issues };
}

function countCheck(reader: Reader, pkg: PackageRead, count: number): void {
  if (pkg.kind === 'chip' && count !== pkg.count) {
    reader.error(['pins'], `ピンの数が合いません (package: は ${pkg.count} 本、pins: は ${count} 本)`);
  }
  if (pkg.kind === 'discrete' && count !== 3) reader.error(['pins'], `3 ピンの部品の pins: は 3 本です (今は ${count} 本)`);
  if (pkg.kind === 'module' && (count < 1 || count > MAX_DEVICE_PINS)) reader.error(['pins'], `device の pins: は 1〜${MAX_DEVICE_PINS} 本です`);
  if (pkg.kind === 'board' && (count < 4 || count % 2 !== 0 || count > MAX_BOARD_PINS)) {
    reader.error(['pins'], `board の pins: は 2 列なので偶数で、4〜${MAX_BOARD_PINS} 本です (今は ${count} 本)`);
  }
}

type Base = Omit<PartCard, 'kind' | 'pins'> & { readonly models: readonly string[] };

function buildCard(reader: Reader, fields: Fields, pkg: PackageRead, base: Base, pins: readonly string[]): PartCard | null {
  switch (pkg.kind) {
    case 'chip': {
      const { look, outline, smd, ic } = readChipExtras(reader, fields, pins);
      return { kind: 'chip', ...base, pins, ...only('look', look), ...only('outline', outline), ...only('smd', smd), ...only('ic', ic) };
    }
    case 'discrete': {
      const written = reader.text(fields, 'kind', false);
      if (written === undefined) {
        reader.error(['kind'], `3 ピンの部品は kind: を書きます (${DISCRETE_KINDS.join(' ')})`);
        return null;
      }
      const discreteKind = DISCRETE_KINDS.find((kind) => kind === written);
      if (discreteKind === undefined) {
        reader.error(['kind'], `kind: ${written} は書けません (${DISCRETE_KINDS.join(' ')})`);
        return null;
      }
      if ((pkg.type === 'regulator') !== (discreteKind === 'regulator')) {
        reader.error(['kind'], pkg.type === 'regulator' ? 'regulator の kind: は regulator です' : 'kind: regulator は package: regulator/… に書きます');
        return null;
      }
      const [a = '', b = '', c = ''] = pins;
      return {
        kind: 'discrete', ...base, type: pkg.type, discreteKind,
        case: reader.text(fields, 'case', false) ?? caseOf(pkg.variant), pins: [a, b, c],
      };
    }
    case 'module': {
      const view = reader.text(fields, 'view', true);
      const product = reader.text(fields, 'product', true);
      return view === undefined || product === undefined ? null : { kind: 'module', ...base, pins, view, product };
    }
    case 'board':
      return buildBoard(reader, fields, base, pins);
  }
}

function buildBoard(reader: Reader, fields: Fields, base: Base, pins: readonly string[]): PartCard | null {
  base.models.forEach((model, index) => {
    if (!BOARD_TYPE.test(model)) reader.error(['models', index], `board の型番 ${model} はそのまま種類の名前になるので、小文字の英数字と - で書きます (arduino-nano)`);
  });
  const chip = reader.text(fields, 'chip', true);
  const rowSpan = reader.number(fields, 'row-span');
  if (fields['row-span'] === undefined) reader.error(['row-span'], 'board は row-span: を書きます (列の間のピッチの数。Pico は 7)');
  if (rowSpan !== undefined && (!Number.isInteger(rowSpan) || rowSpan < 2 || rowSpan > 20)) reader.error(['row-span'], 'row-span: は 2〜20 の整数です');
  const reach = reader.number(fields, 'reach') ?? DEFAULT_REACH;
  const usbText = reader.text(fields, 'usb', true);
  const usb = USB_KINDS.find((kind) => kind === usbText);
  if (usbText !== undefined && usb === undefined) reader.error(['usb'], `usb: ${usbText} は書けません (${USB_KINDS.join(' ')})`);
  const mark = reader.text(fields, 'mark', false);
  const hdmi = reader.bool(fields, 'hdmi') ?? false;
  const wireless = reader.bool(fields, 'wireless') ?? false;
  const name = reader.text(fields, 'name', false) ?? base.models[0] ?? '';
  if (chip === undefined || rowSpan === undefined || usb === undefined) return null;
  return { kind: 'board', ...base, pins, name, chip, rowSpan, reach, usb, ...only('mark', mark), hdmi, wireless };
}
