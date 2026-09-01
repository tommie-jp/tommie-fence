import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { fenceError, notice, safeToken } from '../errors.ts';
import { resolveBoard } from '../model/board.ts';
import { boardNames } from '../model/catalog.ts';
import { LIMITS } from '../limits.ts';
import { parsePartLine } from './parts.ts';
import { parseWireLine } from './wires.ts';
import { isReferenceable } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { isSeq } from 'yaml';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { Board, FenceDocument, FenceError, PartSpec, PointSpec, WireSpec } from '../types.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

const BOARD_HINT = `board: は穴数を 列x行 で書くか (例: board: 25x15)、`
  + `板の名前を書きます (${boardNames().join(' / ')})。`
  + `上限は ${LIMITS.cols}x${LIMITS.rows} です`;

export type ParseResult = { readonly doc: FenceDocument | null; readonly errors: readonly FenceError[] };

const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。解決後の値では駄目で、
 * `0x18` は YAML が 16 進の 24 として読むので、そのまま名指すと
 * **行のどこにも無い綴り**を指すことになり、印 (`locate`) も付かなくなる。
 * `1.10` が `1.1` に丸まるのも同じ穴。
 */
const writtenText = (node: unknown, source: string): string | null => {
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

/**
 * フェンスの中身 (YAML) を読む。エラーはすべて行番号つきで返す。
 *
 * **Phase 1 で読むのは `board:` だけ。** 残りのキーは語彙として認めるが
 * 中身を見ない (見られるようになった Phase で足す)。知らないキーを名指すのは
 * ここから始める — 綴り間違いが黙って無視されるのが一番たちが悪い。
 */
export function parseFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: null, errors: [fenceError('perfboard フェンスが空です (board: から書き始めます)', null)] };
  }

  const lineCounter = new LineCounter();
  // 重複キーは YAML のエラーにせず、こちらで名指して報告する
  // (どのキーが 2 つあるのかを、こちらの言葉で言うため)。
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });

  if (parsed.errors.length > 0) {
    return {
      doc: null,
      errors: parsed.errors.map((error) =>
        fenceError(
          `YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`,
          lineCounter.linePos(error.pos[0]).line,
        ),
      ),
    };
  }

  const lineOf = (node: Node | Pair | null | undefined): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };

  const root = parsed.contents;
  // **中身が始まる行を指す。** 1 行目に決め打つと、先頭が注釈のときに
  // 何も書いていない行を名指すことになる。
  const contentLine = lineOf(root as Node | null);

  if (!isMap(root)) {
    return {
      doc: null,
      errors: [fenceError('フェンスの一番外側は `キーと値` の並びにします (`board: ...` から)', contentLine)],
    };
  }

  const errors: FenceError[] = [];
  const parts: PartSpec[] = [];
  const wires: WireSpec[] = [];
  const points: PointSpec[] = [];
  let board: Board | null = null;
  let title: string | null = null;
  let boardWritten = false;
  let titleWritten = false;
  let partsWritten = false;
  let wiresWritten = false;
  let pointsWritten = false;

  /** `wires:` は 1 行 1 本の並び。読めた配線は捨てない。 */
  const readWires = (node: unknown, keyLine: number | null): void => {
    if (!isSeq(node)) {
      errors.push(fenceError('wires: は `- 穴 -- 穴` の並びにします', keyLine));
      return;
    }
    for (const item of node.items) {
      const line = lineOf(item as Node);
      const written = scalarText(item);
      if (written === null) {
        errors.push(fenceError('配線は 1 行に 1 本書きます (例: - b7 -- c5)', line));
        continue;
      }
      const result = parseWireLine(written);
      if (!result.ok) {
        errors.push({ ...result.error, line });
        continue;
      }
      wires.push({ ...result.value, line });
    }
  };

  /**
   * `points:` は「名前 → 番地」の並び。**番地の代わりに書ける名前**を作るだけで、
   * 図には出ない (出るのはネットリストの名前として)。
   */
  const readPoints = (node: unknown, keyLine: number | null): void => {
    if (!isMap(node)) {
      errors.push(fenceError('points: は `名前: 番地` の並びにします', keyLine));
      return;
    }
    for (const item of node.items) {
      const line = lineOf((item.value ?? item.key) as Node);
      const name = scalarText(item.key);
      const written = scalarText(item.value);
      if (name === null || written === null) {
        errors.push(fenceError('points: は `名前: 番地` の形で書きます (例: VCC: a1)', line));
        continue;
      }
      if (points.length >= LIMITS.points) {
        errors.push(fenceError(`points: が多すぎます (${LIMITS.points} 個まで)`, line));
        break;
      }
      if (!isReferenceable(name)) {
        errors.push(fenceError(`点の名前に使えません: ${safeToken(name)}`, line, name));
        continue;
      }
      // **番地の綴りを名前にしない。** `b3: c5` と書けてしまうと、`b3` が
      // どちらを指すのか読む人にも処理にも決まらなくなる。
      if (parseAddress(name) !== null) {
        errors.push(fenceError(`番地と同じ綴りは点の名前にできません: ${safeToken(name)}`, line, name));
        continue;
      }
      if (points.some((point) => point.name === name)) {
        errors.push(fenceError(`点の名前が重なっています: ${safeToken(name)}`, line, name));
        continue;
      }
      points.push({ name, written, line });
    }
  };

  /**
   * `parts:` は「名前 → 部品 1 行」の並び。**読めた部品は捨てない** ので、
   * 落ちた行だけを報告して残りは通す。
   */
  const readParts = (node: unknown, keyLine: number | null): void => {
    if (!isMap(node)) {
      errors.push(fenceError('parts: は `名前: 部品 穴 穴 値` の並びにします', keyLine));
      return;
    }
    for (const item of node.items) {
      const id = scalarText(item.key);
      const line = lineOf((item.value ?? item.key) as Node);
      if (id === null) {
        errors.push(fenceError('部品の名前は文字で書きます', lineOf(item.key as Node)));
        continue;
      }
      const written = scalarText(item.value);
      if (written === null) {
        errors.push(fenceError(`${safeToken(id)} の中身が書かれていません (例: resistor b3 b7 10k)`, line));
        continue;
      }
      const result = parsePartLine(id, written);
      if (!result.ok) {
        errors.push({ ...result.error, line });
        continue;
      }
      // **姿は読むが、まだ描き分けない。** 黙って捨てると、書いた人は
      // 電解と積層の違いが図に出ているつもりのまま終わる。
      if (result.value.variant !== null) {
        errors.push(notice(
          `姿はまだ描き分けません: ${result.value.type}/${result.value.variant} (図は同じ形で出ます)`,
          line,
        ));
      }
      parts.push({ ...result.value, line });
    }
  };

  for (const pair of root.items) {
    const key = scalarText(pair.key);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', lineOf(pair.key as Node)));
      continue;
    }
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      const known = TOP_LEVEL_KEYS.join(' / ');
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${known})`, lineOf(pair.key as Node), key));
      continue;
    }
    if (key === 'parts') {
      const keyLine = lineOf(pair.key as Node);
      if (partsWritten) {
        // board: が 2 つあると言うのに parts: は黙って混ぜる、では
        // 「置き換えたはず」と思った人に両方描かれた図が出る。
        errors.push(fenceError('parts: が 2 つあります (1 つにまとめます)', keyLine, key));
        continue;
      }
      partsWritten = true;
      readParts(pair.value, keyLine);
      continue;
    }
    if (key === 'title') {
      const at = lineOf((pair.value ?? pair.key) as Node);
      if (titleWritten) {
        errors.push(fenceError('title: が 2 つあります (題は 1 つです)', at, key));
        continue;
      }
      titleWritten = true;
      const written = scalarText(pair.value);
      if (written === null) {
        errors.push(fenceError('title: には図の題を 1 行で書きます', at));
        continue;
      }
      // **空の題は無題**。`""` をそのまま通すと、題の帯だけ空けて何も書かれない
      // 空白が板の上に残る。
      title = written.trim() === '' ? null : written;
      continue;
    }
    if (key === 'wires') {
      const keyLine = lineOf(pair.key as Node);
      if (wiresWritten) {
        errors.push(fenceError('wires: が 2 つあります (1 つにまとめます)', keyLine, key));
        continue;
      }
      wiresWritten = true;
      readWires(pair.value, keyLine);
      continue;
    }
    if (key === 'points') {
      const keyLine = lineOf(pair.key as Node);
      if (pointsWritten) {
        errors.push(fenceError('points: が 2 つあります (1 つにまとめます)', keyLine, key));
        continue;
      }
      pointsWritten = true;
      readPoints(pair.value, keyLine);
      continue;
    }
    if (key !== 'board') continue;

    const at = lineOf((pair.value ?? pair.key) as Node);
    if (boardWritten) {
      // 後勝ちで黙って上書きすると、**書いたはずの板と違う板の図が出る**。
      errors.push(fenceError('board: が 2 つあります (板は 1 枚です)', at, key));
      continue;
    }
    boardWritten = true;

    const value = scalarText(pair.value);
    if (value === null) {
      errors.push(fenceError(BOARD_HINT, at));
      continue;
    }
    // 名指すのは書かれた字面。読むのは解決後の値。
    const written = writtenText(pair.value, source) ?? value;
    const found = resolveBoard(value);
    if (!found.ok) {
      errors.push(fenceError(`${safeToken(written)}: ${found.reason}`, at, written));
      continue;
    }
    board = found.board;
    // 単位の書き忘れは**図が出てしまう**取り違えなので、エラーではなくお知らせ。
    if (found.notice !== null) errors.push(notice(found.notice, at, written));
  }

  if (board === null) {
    // 板が決まらないと穴の数が決まらないので、番地も配置も読めない。
    // **`board:` と書いてあって読めなかったときは言わない** — すぐ上で言っている。
    if (!boardWritten) {
      errors.push(fenceError(`board: が要ります。${BOARD_HINT}`, contentLine));
    }
    return { doc: null, errors };
  }

  return { doc: { board, title, parts, wires, points }, errors };
}
