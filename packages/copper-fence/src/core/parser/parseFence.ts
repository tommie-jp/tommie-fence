import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { rememberRecent } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import {
  DEFAULT_BOARD, DEFAULT_ER, DEFAULT_GROUND, DEFAULT_H, DEFAULT_SIZE, GROUNDS, SIZE_HINT, createBoard,
  isGround, resolveSize,
} from '../model/board.ts';
import { F_MAX, F_MIN, formatHertz, parseHertz } from '../model/microstrip.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type {
  Board, CopperSpec, FenceDocument, FenceError, Ground, NoteSpec, PartSpec, StyleSpec, WireSpec,
} from '../types.ts';
import { parseCopperLine } from './copper.ts';
import { parseNoteLine } from './notes.ts';
import { parsePartLine } from './parts.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';
import { parseWireLine } from './wires.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** `board:` をマップで書いたときに置ける項目。 */
const BOARD_KEYS = ['size', 'h', 'er', 'ground', 'cut'] as const;

/**
 * 読んだ結果。**`doc` は必ずある** — YAML が転んでも、`board:` が書かれて
 * いなくても、読めた所は返す (52 の docs/54「エディターを YAML の都合で止めない」)。
 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({
  board: DEFAULT_BOARD, f: null, title: null, copper: [], parts: [], wires: [], notes: [], style: EMPTY_STYLE,
});

const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。YAML は `1.60` を `1.6` に、
 * `0x18` を 24 に読むので、解決後の値を名指すと行のどこにも無い綴りになる。
 */
const writtenText = (node: unknown, source: string): string | null => {
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError('copper フェンスが空です (board: から書き始めます)', null)] };
  }

  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });
  const lineOf = (node: Node | Pair | null | undefined): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };
  const root = parsed.contents;
  const contentLine = lineOf(root as Node | null);

  // **同じ行は 1 件だけ** (yaml は 1 つの壊れ方を 2 度言うことがある)。
  const seen = new Set<number | null>();
  const errors: FenceError[] = parsed.errors.flatMap((error) => {
    const { line } = lineCounter.linePos(error.pos[0]);
    if (seen.has(line)) return [];
    seen.add(line);
    return [fenceError(`YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`, line)];
  });

  if (!isMap(root)) {
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`board: ...` から)', contentLine));
    return { doc: emptyDocument(), errors };
  }

  const copper: CopperSpec[] = [];
  const parts: PartSpec[] = [];
  const wires: WireSpec[] = [];
  const notes: NoteSpec[] = [];
  let board: Board | null = null;
  let boardWritten = false;
  let f: number | null = null;
  let title: string | null = null;
  let style: StyleSpec = EMPTY_STYLE;
  const written = new Set<string>();
  /** 島と部品は**同じ名前の並び** — 配線と足のある部品が端として指すため。 */
  const names = new Map<string, number | null>();

  const claim = (id: string, line: number | null): boolean => {
    // **点の綴り (`10,5`) は名前の字 (英数字と _ -) に入らない**ので、ここで弾かれる —
    // 端に書いた字が名前か点か決まらなくなることは無い。
    if (!isReferenceable(id)) {
      errors.push(fenceError(`名前に使えません: ${safeToken(id)} (英数字と _ - で ${LIMITS.idLength} 字まで)`, line, id));
      return false;
    }
    if (names.has(id)) {
      errors.push(fenceError(`名前が重なっています: ${safeToken(id)} (島と部品は同じ名前の並びです)`, line, id));
      return false;
    }
    names.set(id, line);
    return true;
  };

  /** `名前: 1 行` の並び (`copper:` と `parts:`)。読めた行は捨てない。 */
  const readEntries = <T>(
    node: unknown,
    keyLine: number | null,
    what: string,
    limit: number,
    read: (id: string, text: string) => { ok: true; value: T } | { ok: false; error: FenceError },
    push: (value: T, line: number | null) => void,
  ): void => {
    if (!isMap(node)) {
      errors.push(fenceError(`${what}: は \`名前: 中身\` の並びにします`, keyLine));
      return;
    }
    let count = 0;
    for (const item of node.items) {
      const line = lineOf((item.value ?? item.key) as Node);
      const id = scalarText(item.key);
      if (id === null) {
        errors.push(fenceError('名前は文字で書きます', lineOf(item.key as Node)));
        continue;
      }
      if (count >= limit) {
        errors.push(fenceError(`${what}: が多すぎます (${limit} 個まで)`, line));
        break;
      }
      if (!claim(id, line)) continue;
      const text = scalarText(item.value);
      if (text === null) {
        errors.push(fenceError(`${safeToken(id)} の中身を 1 行で書きます`, line));
        continue;
      }
      const result = read(id, text);
      if (!result.ok) {
        errors.push({ ...result.error, line });
        continue;
      }
      count += 1;
      push(result.value, line);
    }
  };

  const readWires = (node: unknown, keyLine: number | null): void => {
    if (!isSeq(node)) {
      errors.push(fenceError('wires: は `- 端 -- 端` の並びにします', keyLine));
      return;
    }
    for (const item of node.items) {
      const line = lineOf(item as Node);
      if (wires.length >= LIMITS.wires) {
        errors.push(fenceError(`配線が多すぎます (${LIMITS.wires} 本まで)`, line));
        break;
      }
      const text = scalarText(item);
      if (text === null) {
        errors.push(fenceError('配線は 1 行に 1 本書きます (例: - P1 -- P2)', line));
        continue;
      }
      const result = parseWireLine(text);
      if (!result.ok) errors.push({ ...result.error, line });
      else wires.push({ ...result.value, line });
    }
  };

  const readNotes = (node: unknown, keyLine: number | null): void => {
    if (!isSeq(node)) {
      errors.push(fenceError('notes: は `- mark 20,10` のような並びにします', keyLine));
      return;
    }
    for (const item of node.items) {
      const line = lineOf(item as Node);
      if (notes.length >= LIMITS.notes) {
        errors.push(fenceError(`注釈が多すぎます (${LIMITS.notes} 個まで)`, line));
        break;
      }
      const text = scalarText(item);
      if (text !== null) {
        const result = parseNoteLine(text, null);
        if (!result.ok) errors.push({ ...result.error, line });
        else notes.push({ ...result.value, line });
        continue;
      }
      // `- text 20,18: 字` は 1 項目のマップ。字は値の側に来る (3 つのフェンスと同じ形)。
      if (isMap(item) && item.items.length === 1) {
        const pair = item.items[0];
        const head = scalarText(pair?.key);
        const body = scalarText(pair?.value);
        const at = lineOf(pair?.key as Node) ?? line;
        if (head !== null && body !== null) {
          const result = parseNoteLine(head, body);
          if (!result.ok) errors.push({ ...result.error, line: at });
          else notes.push({ ...result.value, line: at });
          continue;
        }
      }
      errors.push(fenceError('注釈は「- mark 20,10」か「- text 20,18: 字」の形で書きます', line));
    }
  };

  /** `board:` の値。スカラーなら大きさ、マップなら大きさと基材と地。 */
  const readBoard = (value: unknown, at: number | null): void => {
    let sizeNode: unknown = value;
    let sizeSeen = !isMap(value);
    const rest: { h?: number; er?: number; ground?: Ground; cut?: number } = {};
    if (isMap(value)) {
      for (const item of (value as { items: Pair[] }).items) {
        const name = scalarText(item.key);
        const itemAt = lineOf((item.value ?? item.key) as Node);
        if (name === null || !(BOARD_KEYS as readonly string[]).includes(name)) {
          errors.push(fenceError(
            `知らない board の項目です: ${safeToken(name ?? '')} (${BOARD_KEYS.join(' / ')})`, itemAt, name ?? undefined,
          ));
          continue;
        }
        if (name === 'size') {
          sizeNode = item.value;
          sizeSeen = true;
          continue;
        }
        const text = scalarText(item.value);
        if (name === 'ground') {
          const word = (text ?? '').trim().toLowerCase();
          if (!isGround(word)) {
            errors.push(fenceError(`board の ground は ${GROUNDS.join(' / ')} で書きます: ${safeToken(text ?? '')}`, itemAt, 'ground'));
            continue;
          }
          rest.ground = word;
          continue;
        }
        const number = text === null ? Number.NaN : Number(text);
        const [min, max] = name === 'h' ? [LIMITS.hMin, LIMITS.hMax]
          : name === 'er' ? [LIMITS.erMin, LIMITS.erMax]
            : [LIMITS.sizeMin, LIMITS.sizeMax];
        if (!Number.isFinite(number) || number < min || number > max) {
          const what = name === 'h' ? '基材の厚さ (mm)' : name === 'er' ? '比誘電率' : '溝の幅 (mm)';
          errors.push(fenceError(`board の ${name} は${what}を ${min}〜${max} で書きます`, itemAt, name));
          continue;
        }
        rest[name as 'h' | 'er' | 'cut'] = number;
      }
    }
    if (!sizeSeen) {
      // 大きさが無くても基材と地は活かす (書いた h や er が黙って捨てられない)。
      board = createBoard(DEFAULT_BOARD.width, DEFAULT_BOARD.height, rest);
      errors.push(notice(`board: に size: が無いので、既定の ${DEFAULT_SIZE} で描いています`, at));
      return;
    }
    const text = scalarText(sizeNode);
    if (text === null) {
      errors.push(fenceError(SIZE_HINT, lineOf(sizeNode as Node) ?? at));
      board = createBoard(DEFAULT_BOARD.width, DEFAULT_BOARD.height, rest);
      return;
    }
    const size = resolveSize(text);
    if (!size.ok) {
      const spelled = writtenText(sizeNode, source) ?? text;
      errors.push(fenceError(`${safeToken(spelled)}: ${size.reason}`, lineOf(sizeNode as Node) ?? at, spelled));
      board = createBoard(DEFAULT_BOARD.width, DEFAULT_BOARD.height, rest);
      return;
    }
    board = createBoard(size.width, size.height, rest);
  };

  for (const pair of root.items) {
    const key = scalarText(pair.key);
    const keyLine = lineOf(pair.key as Node);
    const at = lineOf((pair.value ?? pair.key) as Node);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', keyLine));
      continue;
    }
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${TOP_LEVEL_KEYS.join(' / ')})`, keyLine, key));
      continue;
    }
    // **同じキーが 2 つあれば言う。** 後勝ちで黙ると、書いたはずのものと違う図が出る。
    if (written.has(key)) {
      errors.push(fenceError(`${key}: が 2 つあります (1 つにまとめます)`, keyLine, key));
      continue;
    }
    written.add(key);

    switch (key) {
      case 'board':
        boardWritten = true;
        readBoard(pair.value, at);
        break;
      case 'f': {
        const text = scalarText(pair.value);
        const hz = text === null ? null : parseHertz(text);
        if (hz === null || hz < F_MIN || hz > F_MAX) {
          errors.push(fenceError(
            `f: は周波数を ${formatHertz(F_MIN)}〜${formatHertz(F_MAX)} で書きます (例: f: 2.4G、f: 433M)`, at, 'f',
          ));
          break;
        }
        f = hz;
        break;
      }
      case 'title': {
        const text = scalarText(pair.value);
        if (text === null) {
          errors.push(fenceError('title: には図の題を 1 行で書きます', at));
          break;
        }
        title = text.trim() === '' ? null : text;
        break;
      }
      case 'copper':
        readEntries(pair.value, keyLine, 'copper', LIMITS.copper, parseCopperLine, (value, line) => {
          copper.push({ ...value, line });
        });
        break;
      case 'parts':
        readEntries(pair.value, keyLine, 'parts', LIMITS.parts, parsePartLine, (value, line) => {
          parts.push({ ...value, line });
        });
        break;
      case 'wires':
        readWires(pair.value, keyLine);
        break;
      case 'notes':
        readNotes(pair.value, keyLine);
        break;
      case 'style': {
        const lines = new Map<string, number | null>();
        if (isMap(pair.value)) {
          for (const item of pair.value.items) {
            const name = scalarText(item.key);
            if (name !== null) lines.set(name, lineOf((item.value ?? item.key) as Node));
          }
        }
        const read = parseStyle((pair.value as { toJSON?: () => unknown } | null)?.toJSON?.() ?? null, at, lines);
        style = read.style;
        errors.push(...read.errors);
        break;
      }
    }
  }

  if (!boardWritten) {
    // **書かなくても止めない。** 既定の板で描き、何の板で描いたかは言う (54)。
    errors.push(notice(
      `board: が無いので、既定の板 (${DEFAULT_SIZE}・h ${DEFAULT_H}・εr ${DEFAULT_ER}・${DEFAULT_GROUND}) で描いています`,
      contentLine,
    ));
  }

  return {
    doc: { board: board ?? DEFAULT_BOARD, f, title, copper, parts, wires, notes, style },
    errors,
  };
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。マップの試し当ては
 * 1 回のうちに同じ本文を何度も読むので、そのたびに YAML を通すと拡張ホストが埋まる。
 */
export const parseFence = rememberRecent(readFence);

