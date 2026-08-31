import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { RAIL_ROWS } from '../types.ts';
import type { FenceError, NoteSpec, PartSpec, WireSpec } from '../types.ts';

/** 名前と、それが書かれた行。名前の重なりを行番号つきで報告するために行を持つ。 */
export type PointDef = { readonly addr: string; readonly line: number };

export type Points = ReadonlyMap<string, PointDef>;

/**
 * 穴番地に名前を付ける (`points:`)。
 *
 * ```yaml
 * points:
 *   vin: a1
 *   fb:  d4
 * ```
 *
 * 節点を動かすときの編集が 1 箇所で済むのが値打ち。同じ番地を 2 行に書いておいて
 * 片方だけ直すと、**エラーにできない間違い** (別のつなぎ方をした正しい図) が
 * 黙って出る。名前にしておけばその入口が塞がる。
 *
 * 名前 → 番地は同じフェンスの中で解決するので、「番地を直接書く」という
 * この構文の骨格は崩れない。
 */
export function validatePointName(name: string, line: number): FenceError | null {
  if (!isReferenceable(name)) {
    return fenceError(
      `点の名前 ${safeToken(name)} は使えません (英数字と _ - だけの ${LIMITS.idLength} 文字まで)`,
      line,
    );
  }
  // 番地の形を名前にすると、`a5` が点なのか穴なのかを解決順で説明する羽目になる。
  if (parseAddress(name)) {
    return fenceError(`点の名前に番地の形は使えません: ${safeToken(name)}`, line);
  }
  // `--` は配線の区切りそのもの。名前として通すと**部品と注釈では使えるのに
  // 配線の端点でだけ使えない**という穴が空く (`- -- -- a10` は形のエラーになり、
  // しかもエラーが出るのは points: の行ではないので原因に気づけない)。
  // 番地の形を禁じるのと同じ理由 — 1 つの語に 2 つの意味を持たせない。
  if (/^-+$/.test(name)) {
    return fenceError(`点の名前にハイフンだけの語は使えません: ${safeToken(name)}`, line);
  }
  // レールの名前はネットリストにそのまま出る。同じ名前を点に付けると、
  // **同じ名前のネットが 2 つ出て**突き合わせがそこで成立しなくなる。
  // (`+t` は `+` が名前に使えないので通らないが、`-t` `-b` は素通りしていた。)
  if ((RAIL_ROWS as readonly string[]).includes(name.toLowerCase())) {
    return fenceError(`点の名前にレールの名前は使えません: ${safeToken(name)}`, line);
  }
  return null;
}

/**
 * 点の値が穴番地の形をしているか。**ここで見ないと、置き換わったあとの番地で
 * エラーが出る**。報告に添える行には書いた名前 (`vin`) しか無いので、
 * 「hello はありません」と言われて行のどこにも `hello` が無い、という
 * 直す場所を探せない報告になる。板の中かどうかは、板が決まってから見る。
 */
export function validatePointAddress(name: string, addr: string, line: number): FenceError | null {
  if (parseAddress(addr)) return null;
  return fenceError(
    `点 ${safeToken(name)} の値が穴番地として読めません: ${safeToken(addr)} (a5 や +t5 のように書きます)`,
    line,
    addr,
  );
}

/**
 * 名前を番地に置き換える。**番地が書ける場所すべて**が対象で、
 * 部品の穴・配線の端点・注釈の指し先のどこでも同じように使える。
 *
 * 知らない名前はそのまま残す。使った行で「穴番地として読めません」と
 * 報告されるほうが、ここでまとめて言うより直す場所が分かる。
 */
export const resolvePoint = (token: string, points: Points): string => points.get(token)?.addr ?? token;

export const resolveParts = (parts: readonly PartSpec[], points: Points): PartSpec[] =>
  parts.map((part) => ({
    ...part,
    holes: part.holes.map((hole) => ({ ...hole, addr: resolvePoint(hole.addr, points) })),
  }));

export const resolveWires = (wires: readonly WireSpec[], points: Points): WireSpec[] =>
  wires.map((wire) => ({
    ...wire,
    from: resolvePoint(wire.from, points),
    to: resolvePoint(wire.to, points),
  }));

export const resolveNoteTargets = (notes: readonly NoteSpec[], points: Points): NoteSpec[] =>
  notes.map((note) => ({
    ...note,
    targets: note.targets.map((target) => resolvePoint(target, points)),
  }));

/**
 * 点の名前と部品 ID がぶつかっていないか。**注釈の指し先は「部品 ID か番地」の
 * 両取り**なので、3 つ目の名前空間を重ねると解決順の説明が要る。禁じれば説明ごと消える。
 */
export function conflictingNames(points: Points, parts: readonly PartSpec[]): FenceError[] {
  const ids = new Set(parts.map((part) => part.id));
  return [...points]
    .filter(([name]) => ids.has(name))
    .map(([name, def]) => fenceError(`点の名前 ${safeToken(name)} は部品 ID と同じです`, def.line));
}
