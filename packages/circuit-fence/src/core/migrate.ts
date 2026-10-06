import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Scalar } from 'yaml';
import { extractCircuitFences } from './fences.ts';
import { formatAddress, legacyParseAddress, parseAddress } from './model/address.ts';
import { lookupPartType, resolvePartTypeName } from './parts.ts';

/**
 * 旧い番地の綴り (`a1` `a1f5`) を、いまの綴り (`1,1` `1.5,1.5`) に書き直す
 * (52 の docs/126)。教科書・例・文書を一括で移す道具であり、拡張と playground の
 * 「番地を x,y に書き換える」操作の中身でもある。
 *
 * **書き直すのは「旧い読み手で番地として読めた綴り」だけ。** 字の形だけで置き換えると、
 * 部品 ID (`C1`)・値 (`C10`)・向きの語 (`r90`)・ピン (`U1.5`)・番地の名前を番地と
 * 取り違える。そこで 0.34.0 までの parseFence と同じ順で YAML をたどり、
 * **番地を書く場所 (部品の行の番地の欄・配線の端・名前の行き先・注釈の指し先・grid-to)**
 * の語だけを旧い読み手 (`legacyParseAddress`) に通す。番地を書く場所にあるのに
 * 読めなかった語は触らず `skipped` に返す (目で見て直す)。
 *
 * 書き換えは**語の置き換えだけ**で、行も字下げも注釈 (`#`) も動かさない。
 * フロー形式 (`{ R1: resistor a1 a3 }`) では `,` が区切りになるので、
 * 書き換えた素の字は `"…"` で囲む。
 */
export type MigrateResult = {
  /** 書き直した中身。直す所が無ければ元のまま。 */
  readonly text: string;
  /** 書き直した番地の数。 */
  readonly changed: number;
  /** 番地を書く場所にあったが、旧い読み手でも読めなかった語 (書かれた順)。 */
  readonly skipped: readonly string[];
};

/** 配線の演算子。parser/compact.ts と同じ 3 つ。 */
const WIRE_OPERATOR = /(\s*(?:--|-\||\|-)\s*)/;

/** 番地の語の前後に来てはいけない字 (語の途中で切らない)。 */
const WORD_CHAR = /[A-Za-z0-9_.,]/;

/** 1 つの字 (YAML のスカラー) の中で、どの語を何に置き換えるか。 */
type Rewrite = { readonly node: Scalar; readonly words: readonly string[]; readonly targets: ReadonlyMap<number, string>; readonly inFlow: boolean };

/** 語の分け方。部品と注釈は空白、配線は演算子で切る。 */
const wordsOf = (text: string): string[] => text.trim().split(/\s+/).filter((word) => word.length > 0);

export function migrateAddresses(fenceText: string): MigrateResult {
  const unchanged: MigrateResult = { text: fenceText, changed: 0, skipped: [] };
  const document = parseDocument(fenceText, { uniqueKeys: false });
  // 読めない YAML は直さない (直した結果が正しいか確かめようがない)。
  if (document.errors.length > 0 || !isMap(document.contents)) return unchanged;

  const contents = document.contents;
  const partIds = new Set<string>();
  const pointNames = new Set<string>();
  for (const pair of contents.items) {
    const key = scalarValue(pair.key);
    if ((key === 'parts' || key === 'points') && isMap(pair.value)) {
      for (const item of pair.value.items) {
        const name = scalarValue(item.key);
        if (name !== null) (key === 'parts' ? partIds : pointNames).add(name);
      }
    }
  }

  const rewrites: Rewrite[] = [];
  const skipped: string[] = [];

  /**
   * 番地を書く場所の語 1 つ。名前・部品 (指し先のとき)・いまの綴り・ピンは触らない。
   * 旧い読み手で読めれば新しい綴りを、読めなければ null を返して skipped に積む。
   */
  const spell = (word: string, target: boolean): string | null => {
    if (pointNames.has(word) || (target && partIds.has(word))) return null;
    if (parseAddress(word) !== null) return null;
    const old = legacyParseAddress(word);
    if (old !== null) return formatAddress(old);
    // ピン (`U1.5`) と部品 ID は番地ではない。それ以外は読めなかった番地として控える。
    if (!word.includes('.') && !(target && /^[\w-]+$/.test(word) && /[A-Z]/.test(word))) skipped.push(word);
    return null;
  };

  /** 語の並びのうち、`slots` の位置を番地として書き直す。 */
  const collect = (node: unknown, inFlow: boolean, slots: (words: string[]) => readonly (readonly [number, boolean])[]): void => {
    if (!isScalar(node) || typeof node.value !== 'string') return;
    const words = wordsOf(node.value);
    const targets = new Map<number, string>();
    for (const [index, target] of slots(words)) {
      const word = words[index];
      if (word === undefined) continue;
      const spelled = spell(word, target);
      if (spelled !== null) targets.set(index, spelled);
    }
    if (targets.size > 0) rewrites.push({ node, words, targets, inFlow });
  };

  for (const pair of contents.items) {
    const key = scalarValue(pair.key);
    const value = pair.value;
    if (key === 'parts' && isMap(value)) {
      for (const item of value.items) {
        if (isMap(item.value)) {
          // 機器のマップ形式。番地は at: だけ。
          for (const field of item.value.items) {
            if (scalarValue(field.key) === 'at') collect(field.value, item.value.flow === true || value.flow === true, () => [[0, false]]);
          }
          continue;
        }
        collect(item.value, value.flow === true, partSlots);
      }
    } else if (key === 'wires' && isSeq(value)) {
      for (const item of value.items) collectWire(item, value.flow === true);
    } else if (key === 'points' && isMap(value)) {
      for (const item of value.items) collect(item.value, value.flow === true, () => [[0, false]]);
    } else if (key === 'notes' && isSeq(value)) {
      for (const item of value.items) {
        if (isMap(item) && item.items.length === 1) {
          const note = item.items[0];
          collect(note?.key, item.flow === true || value.flow === true, (words) => (words[0] === 'text' ? [[1, false]] : []));
        } else {
          collect(item, value.flow === true, noteSlots);
        }
      }
    } else if (key === 'style' && isMap(value)) {
      for (const item of value.items) {
        if (scalarValue(item.key) === 'grid-to') collect(item.value, value.flow === true, () => [[0, false]]);
      }
    }
  }

  /** 配線 1 行。演算子で切った端のうち、番地のものだけを書き直す。 */
  function collectWire(node: unknown, inFlow: boolean): void {
    if (!isScalar(node) || typeof node.value !== 'string') return;
    const pieces = node.value.trim().split(WIRE_OPERATOR);
    const targets = new Map<number, string>();
    pieces.forEach((piece, index) => {
      if (index % 2 === 1 || piece.length === 0) return;
      const spelled = spell(piece, false);
      if (spelled !== null) targets.set(index, spelled);
    });
    if (targets.size > 0) rewrites.push({ node, words: pieces.filter((_, index) => index % 2 === 0), targets: evenToWord(targets), inFlow });
  }

  const changed = rewrites.reduce((sum, rewrite) => sum + rewrite.targets.size, 0);
  if (changed === 0) return { ...unchanged, skipped };
  return { text: applyRewrites(fenceText, rewrites), changed, skipped };
}

/** 配線の端の番号 (演算子を挟んで偶数) を、端だけを並べたときの番号に直す。 */
const evenToWord = (targets: ReadonlyMap<number, string>): Map<number, string> =>
  new Map([...targets].map(([index, spelled]) => [index / 2, spelled]));

/** 部品の 1 行で番地を書く欄。種類を知らない行は欄が決まらないので触らない。 */
function partSlots(words: string[]): readonly (readonly [number, boolean])[] {
  const name = resolvePartTypeName(words[0] ?? '');
  const type = name === null ? null : lookupPartType(name);
  if (type === null) return [];
  return type.kind === 'two-terminal' ? [[1, false], [2, false]] : [[1, false]];
}

/** 注釈の 1 行で番地を書く欄。印と指し棒の指し先は部品 ID のこともある (true)。 */
function noteSlots(words: string[]): readonly (readonly [number, boolean])[] {
  switch (words[0]) {
    case 'circle':
      return [[1, true]];
    case 'arrow':
    case 'line':
      return [[1, true], [2, true]];
    case 'box':
      return [[1, false], [2, false]];
    case 'source':
      return [[1, false]];
    default:
      return [];
  }
}

const scalarValue = (node: unknown): string | null =>
  isScalar(node) && typeof node.value === 'string' ? node.value : null;

/**
 * 書き直しを元の字に当てる。スカラーの書かれた範囲の中で語を順に探し、
 * 目当ての語だけを置き換える (引用符・注釈・字下げはそのまま)。
 * フロー形式の素の字は、`,` が区切りにならないよう `"…"` で囲む。
 */
function applyRewrites(source: string, rewrites: readonly Rewrite[]): string {
  const edits = rewrites
    .map((rewrite) => {
      const [start, end] = (rewrite.node as Node).range ?? [0, 0];
      const raw = source.slice(start, end);
      const replaced = replaceWords(raw, rewrite.words, rewrite.targets);
      if (replaced === null) return null;
      const quoted = rewrite.inFlow && rewrite.node.type === 'PLAIN'
        ? `"${replaced.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : replaced;
      // 綴りが伸びたぶん、後ろの行末コメントの前の空白を詰めて桁を揃えたままにする
      // (`VCC: vcc a1      # …` の `#` の位置を動かさない)。空白は 1 つは残す。
      const gap = /^( +)#/.exec(source.slice(end))?.[1]?.length ?? 0;
      const trim = Math.max(0, Math.min(quoted.length - raw.length, gap - 1));
      return { start, end: end + trim, text: quoted };
    })
    .filter((edit) => edit !== null)
    .sort((a, b) => b.start - a.start);

  let text = source;
  for (const edit of edits) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

/** 書かれた字の中で語を順に探して置き換える。見つからない語があれば null (触らない)。 */
function replaceWords(raw: string, words: readonly string[], targets: ReadonlyMap<number, string>): string | null {
  let cursor = 0;
  let text = '';
  for (const [index, word] of words.entries()) {
    const at = findWord(raw, word, cursor);
    if (at < 0) return null;
    const spelled = targets.get(index);
    text += raw.slice(cursor, at) + (spelled ?? word);
    cursor = at + word.length;
  }
  return text + raw.slice(cursor);
}

/** 語の途中に当たらない最初の位置。 */
function findWord(raw: string, word: string, from: number): number {
  for (let at = raw.indexOf(word, from); at >= 0; at = raw.indexOf(word, at + 1)) {
    const before = raw[at - 1] ?? '';
    const after = raw[at + word.length] ?? '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return at;
  }
  return -1;
}

/**
 * Markdown の ```` ```circuit ```` フェンスだけを書き直す。フェンスの外 (本文) は触らない
 * (本文が番地を指す所は機械では決められないので、grep して手で直す)。
 * 行の数は変わらないので、書き直した行だけを元の字下げのまま差し替える。
 */
export function migrateCircuitFences(markdown: string): MigrateResult {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  let changed = 0;
  const skipped: string[] = [];

  for (const fence of extractCircuitFences(markdown)) {
    const result = migrateAddresses(fence.source);
    skipped.push(...result.skipped);
    if (result.changed === 0) continue;
    changed += result.changed;

    const before = fence.source.split('\n');
    const after = result.text.split('\n');
    before.forEach((line, offset) => {
      const next = after[offset];
      if (next === undefined || next === line) return;
      const at = fence.line + offset;
      const original = lines[at] ?? '';
      lines[at] = original.slice(0, original.length - line.length) + next;
    });
  }

  return changed === 0 ? { text: markdown, changed: 0, skipped } : { text: lines.join(newline), changed, skipped };
}
