import { LineCounter, isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Document, Node, Pair, ParsedNode } from 'yaml';
import { fail, fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
import type { FenceError, NoteSpec, PartSpec, Result, StyleSpec, WireSpec } from '../types.ts';
import { NO_POINTS, parseCompactPart, parseNoteLine, parseNoteText, parseWireLine } from './compact.ts';
import type { Points } from './compact.ts';
import { EMPTY_STYLE, validateStyle } from './style.ts';

const MAX_YAML_MESSAGE = 120;

/**
 * yaml が返す理由に足す案内。
 *
 * `- text b1: R1: resistor a1 a3 10k` のように `: ` を含む値を引用符なしで
 * 書くと、yaml は英語で「Nested mappings are not allowed」とだけ言う。
 * 注釈には部品の書き方をそのまま書き写したくなるので、この形は必ず踏む。
 * どう直すかを添える (これ以外の理由には足さない)。
 */
const YAML_HINTS: Readonly<Record<string, string>> = {
  BLOCK_AS_IMPLICIT_KEY: '(`:` を含む文字は "…" で囲みます)',
};

/**
 * yaml が理由の末尾に付ける自分の行番号。**こちらの行番号と食い違って見える**
 * ので落とす (フェンスの中の数え方なので、帯に出る Markdown の行とは別物)。
 * 行はこちらが付けるほうだけを出す。
 */
const YAML_POSITION = /\s+at line \d+, column \d+:?\s*$/;

/** フェンスの一番外側に書けるキー。読めなかったときの案内はここから作る。 */
const TOP_LEVEL_KEYS = ['points', 'parts', 'wires', 'notes', 'style'] as const;

export type FenceDocument = {
  /**
   * 番地に付けた名前。番地が書ける場所ならどこでも使える。
   * 図には出ないが、名前の付いた節点はネットリストにその名前で出る。
   */
  readonly points: Points;
  /**
   * フェンスの中身そのもの。`- source` の注釈が図に書き出す。
   * 書き写すのではなくここから作るので、フェンスを直すと書き出しも動く。
   */
  readonly source: string;
  readonly parts: readonly PartSpec[];
  readonly wires: readonly WireSpec[];
  /** 図に重ねる注釈。回路の一員ではないので parts とは別に持つ。 */
  readonly notes: readonly NoteSpec[];
  readonly style: StyleSpec;
};

export type ParseResult = { readonly doc: FenceDocument | null; readonly errors: readonly FenceError[] };

type LineOf = (node: Node | Pair | null | undefined) => number | null;

const scalarText = (node: unknown): string | null =>
  isScalar(node) && typeof node.value === 'string' ? node.value : null;

/**
 * フェンスの中身 (YAML) を、行番号を持った 1 行ずつの並びにする。
 * ここで見るのは器の形 (parts はマップ・wires はリスト) と ID だけで、
 * 1 行の中身の解釈は compact.ts に任せる。
 * エラーはすべて行番号つきで返し、読めた部分は捨てない。
 */
export function parseFence(source: string): ParseResult {
  const lineCounter = new LineCounter();
  // 重複キーは YAML のエラーにせず、こちらで部品 ID として報告する。
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });

  const lineOf: LineOf = (node) => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };

  if (parsed.errors.length > 0) {
    return {
      doc: null,
      // yaml のメッセージはライブラリ側の文言。描画時にエスケープされる前提で載せる。
      errors: parsed.errors.map((error) => {
        const reason = (error.message.split('\n')[0] ?? '')
          .replace(YAML_POSITION, '')
          .slice(0, MAX_YAML_MESSAGE);
        const hint = YAML_HINTS[error.code];
        return fenceError(
          `YAML の構文エラー: ${reason}${hint === undefined ? '' : ` ${hint}`}`,
          lineCounter.linePos(error.pos[0]).line,
        );
      }),
    };
  }

  const errors: FenceError[] = [];
  const parts: PartSpec[] = [];
  const wires: WireSpec[] = [];
  const notes: NoteSpec[] = [];
  let style: StyleSpec = EMPTY_STYLE;

  const contents = parsed.contents;
  if (contents === null) return { doc: { source, points: NO_POINTS, parts, wires, notes, style }, errors };
  if (!isMap(contents)) {
    return {
      doc: null,
      errors: [fenceError(`フェンスの中身は ${TOP_LEVEL_KEYS.join(' / ')} のマップで書きます`, 1)],
    };
  }

  // 名前は**先に全部集める**。YAML のマップに順は無いので、`points:` を
  // parts: より下に書いても同じように引けないと、書く順を覚えることになる。
  const points = collectPoints(contents, { errors, lineOf });

  for (const pair of contents.items) {
    const key = scalarText(pair.key) ?? '';
    const line = lineOf(pair.key);

    if (key === 'points') {
      // 上で読んである。ここで 2 度読むと理由も 2 度出る。
      continue;
    } else if (key === 'parts') {
      collectParts(pair.value as ParsedNode | null, { parts, errors, lineOf, points });
    } else if (key === 'wires') {
      collectWires(pair.value as ParsedNode | null, { wires, errors, lineOf, points });
    } else if (key === 'notes') {
      collectNotes(pair.value as ParsedNode | null, { notes, errors, lineOf, points });
    } else if (key === 'style') {
      // `style: *base` のように書けるので、別名は指し先まで開いてから読む。
      const written = pair.value as ParsedNode | null;
      const node = (isAlias(written) ? written.resolve(parsed as Document) : written) as ParsedNode | null;
      // style: が 2 回書かれたら、前に読めたものの上に重ねる (捨てない)。
      const validated = validateStyle(node?.toJSON() as unknown, style, points);
      style = validated.value;
      // 理由はそれを書いた項目の行に付ける (style: の行だけを指しても直す場所が分からない)。
      const keyLine = styleKeyLines(node, lineOf);
      errors.push(...duplicateStyleKeys(node, lineOf));
      errors.push(
        ...validated.messages.map((item) =>
          fenceError(item.message, (item.key === null ? null : keyLine.get(item.key)) ?? line),
        ),
      );
    } else {
      errors.push(
        fenceError(`知らないキーです: ${safeToken(key)} (${TOP_LEVEL_KEYS.join(' / ')} が使えます)`, line),
      );
    }
  }

  // 名前と部品 ID が同じだと、注釈の指し先がどちらを指すのか決められない。
  errors.push(...collidingPoints(contents, parts, lineOf));

  return { doc: { source, points, parts, wires, notes, style }, errors };
}

/**
 * `points:` を読む。名前 → 番地の表にする。
 *
 * 名前に**番地の形は許さない** (`a1: c5`)。許すと `a1` と書いたときに
 * どちらの意味なのかを解決の順で決めることになり、書いた人には見えない。
 */
function collectPoints(
  contents: ParsedNode | null,
  context: { errors: FenceError[]; lineOf: LineOf },
): Points {
  const { errors, lineOf } = context;
  const points = new Map<string, Address>();
  if (!isMap(contents)) return points;

  for (const pair of contents.items) {
    if (scalarText(pair.key) !== 'points') continue;

    const node = pair.value as ParsedNode | null;
    if (!isMap(node)) {
      errors.push(fenceError('points は「名前: 番地」のマップで書きます', lineOf(node) ?? lineOf(pair.key)));
      continue;
    }

    for (const item of node.items) {
      const name = scalarText(item.key);
      const line = lineOf(item.key) ?? 1;

      if (points.size >= LIMITS.points) {
        errors.push(fenceError(`番地の名前は ${LIMITS.points} 個までです。ここから先は読んでいません`, line));
        return points;
      }
      if (name === null || !isReferenceable(name)) {
        errors.push(
          fenceError(
            `番地の名前 ${safeToken(name ?? '')} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`,
            line,
          ),
        );
        continue;
      }
      if (parseAddress(name) !== null) {
        errors.push(
          fenceError(`番地の名前 ${safeToken(name)} は番地そのものです (番地と読み分けられません)`, line),
        );
        continue;
      }
      if (points.has(name)) {
        errors.push(fenceError(`番地の名前 ${safeToken(name)} が二重に書かれています`, line));
        continue;
      }

      const written = scalarText(item.value);
      const address = written === null ? null : parseAddress(written);
      if (address === null) {
        errors.push(
          fenceError(
            `番地の名前 ${safeToken(name)} の行き先は番地で書きます` +
              ` (${safeToken(written ?? '')} は番地の形ではありません)`,
            line,
          ),
        );
        continue;
      }

      points.set(name, address);
    }
  }

  return points;
}

/**
 * 番地の名前と同じ ID の部品。**注釈の指し先**は部品 ID か番地のどちらでも
 * 書けるので、同じ名前が両方にあるとどちらを指したのか決められない。
 * 図は描けるので、名前を変えてもらうよう名前のほうの行で伝える。
 */
function collidingPoints(
  contents: ParsedNode | null,
  parts: readonly PartSpec[],
  lineOf: LineOf,
): FenceError[] {
  if (!isMap(contents)) return [];

  const ids = new Set(parts.map((part) => part.id));
  const errors: FenceError[] = [];
  for (const pair of contents.items) {
    if (scalarText(pair.key) !== 'points') continue;
    const node = pair.value as ParsedNode | null;
    if (!isMap(node)) continue;

    for (const item of node.items) {
      const name = scalarText(item.key);
      if (name === null || !ids.has(name)) continue;
      errors.push(
        fenceError(`番地の名前 ${safeToken(name)} は部品 ID と同じです (どちらを指すか決められません)`, lineOf(item.key)),
      );
    }
  }
  return errors;
}

/**
 * style のマップに同じ項目が 2 回書かれていないか。
 * YAML の重複キーはこちらで見ると決めた (uniqueKeys: false) ので、
 * 見ないと後に書いたほうが黙って勝つ。
 */
function duplicateStyleKeys(node: ParsedNode | null, lineOf: LineOf): FenceError[] {
  if (!isMap(node)) return [];

  const seen = new Set<string>();
  const errors: FenceError[] = [];
  for (const pair of node.items) {
    const key = scalarText(pair.key);
    if (key === null) continue;
    if (seen.has(key)) errors.push(fenceError(`style の ${safeToken(key)} が二重に書かれています`, lineOf(pair.key)));
    seen.add(key);
  }
  return errors;
}

/** style のマップの、項目名 → その項目が書かれた行。 */
function styleKeyLines(node: ParsedNode | null, lineOf: LineOf): Map<string, number> {
  const lines = new Map<string, number>();
  if (!isMap(node)) return lines;

  for (const pair of node.items) {
    const key = scalarText(pair.key);
    const line = lineOf(pair.key);
    if (key !== null && line !== null) lines.set(key, line);
  }
  return lines;
}

function collectParts(
  node: ParsedNode | null,
  context: { parts: PartSpec[]; errors: FenceError[]; lineOf: LineOf; points: Points },
): void {
  const { parts, errors, lineOf, points } = context;
  if (!isMap(node)) {
    errors.push(fenceError('parts は「ID: 内容」のマップで書きます', lineOf(node)));
    return;
  }

  // parts: が 2 回書かれることがある (uniqueKeys: false) ので、
  // これまでに読めた部品も含めて重複を見る。
  const seen = new Set(parts.map((part) => part.id));
  for (const pair of node.items) {
    const id = scalarText(pair.key);
    const line = lineOf(pair.key) ?? 1;

    if (parts.length >= LIMITS.parts) {
      errors.push(fenceError(`部品は ${LIMITS.parts} 個までです。ここから先は描いていません`, line));
      return;
    }
    if (id === null) {
      errors.push(fenceError('部品の ID は文字列で書きます', line));
      continue;
    }
    if (!isReferenceable(id)) {
      errors.push(
        fenceError(`部品 ID ${safeToken(id)} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`, line),
      );
      continue;
    }
    if (seen.has(id)) {
      errors.push(fenceError(`部品 ${safeToken(id)} が二重に定義されています`, line));
      continue;
    }

    const text = scalarText(pair.value);
    if (text === null) {
      errors.push(fenceError(`部品 ${safeToken(id)} の内容は「種類 番地 番地 値」の 1 行で書きます`, line));
      continue;
    }

    // ID は読めたので、中身が読めなくても二重定義は二重定義として報告する。
    seen.add(id);

    const part = parseCompactPart(id, text, line, points);
    if (part.ok) parts.push(part.value);
    else errors.push(part.error);
  }
}

function collectWires(
  node: ParsedNode | null,
  context: { wires: WireSpec[]; errors: FenceError[]; lineOf: LineOf; points: Points },
): void {
  const { wires, errors, lineOf, points } = context;
  if (!isSeq(node)) {
    errors.push(fenceError('wires は「- 端点 -- 端点」を並べたリストで書きます', lineOf(node)));
    return;
  }

  for (const item of node.items) {
    const text = scalarText(item);
    const line = lineOf(item as Node) ?? 1;

    if (text === null) {
      errors.push(fenceError('配線は 1 行の文字列で書きます', line));
      continue;
    }

    const parsed = parseWireLine(text, line, points);
    if (!parsed.ok) {
      errors.push(parsed.error);
      continue;
    }

    // つなぎ書きは 1 行が何区間にもなるので、行の数ではなく引く本数で頭を打たせる。
    if (wires.length + parsed.value.length > LIMITS.wires) {
      errors.push(fenceError(`配線は ${LIMITS.wires} 本までです。ここから先は描いていません`, line));
      return;
    }
    wires.push(...parsed.value);
  }
}

/**
 * `notes:` を 1 項目ずつ読む。項目は 2 通りの形で書かれる。
 *
 * - 文字列 (`- circle R1 red`) — 図に重ねる印
 * - 項目 1 つのマップ (`- text b1 blue: ここで分圧する`) — 図に重ねる字
 *
 * 字だけマップなのは YAML の都合。プレーンスカラーには `: ` を書けず、
 * `- text b1 "R1: resistor a1 a3 10k"` は**エラーにならずマップになってしまう**
 * (実測)。字を値の側に置けば、引用の要不要は YAML が決める。
 */
function collectNotes(
  node: ParsedNode | null,
  context: { notes: NoteSpec[]; errors: FenceError[]; lineOf: LineOf; points: Points },
): void {
  const { notes, errors, lineOf, points } = context;
  if (!isSeq(node)) {
    errors.push(fenceError('notes は「- circle 部品ID」や「- text 番地: 文字」を並べたリストで書きます', lineOf(node)));
    return;
  }

  for (const item of node.items) {
    const line = lineOf(item as Node) ?? 1;

    if (notes.length >= LIMITS.notes) {
      errors.push(fenceError(`注釈は ${LIMITS.notes} 個までです。ここから先は描いていません`, line));
      return;
    }

    const note = readNote(item as ParsedNode | null, line, lineOf, points);
    if (note.ok) notes.push(note.value);
    else errors.push(note.error);
  }
}

/** 注釈 1 項目。書かれた形 (文字列かマップか) で読み方を選ぶ。 */
function readNote(item: ParsedNode | null, line: number, lineOf: LineOf, points: Points): Result<NoteSpec> {
  const text = scalarText(item);
  if (text !== null) return parseNoteLine(text, line, points);

  if (isMap(item) && item.items.length === 1) {
    const pair = item.items[0];
    const head = scalarText(pair?.key);
    const body = scalarText(pair?.value);
    const keyLine = lineOf(pair?.key) ?? line;

    if (head === null) return fail('注釈の種類と場所は文字列で書きます', keyLine);
    // 数や真偽値をそのまま渡すと `1.0` が `1` になって図に出る。引用してもらう。
    if (body === null) return fail('注釈の文字は文字列で書きます (数だけのときは引用符で囲みます)', keyLine);
    return parseNoteText(head, body, keyLine, points);
  }

  return fail('注釈は「- circle 部品ID」か「- text 番地: 文字」で書きます', line);
}
