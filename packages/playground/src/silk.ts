/**
 * perf の `silk:` (基板に刷ってある英字と数字の振り方) を、フェンス本文から読み書きする。
 * **文法は変えず、頁が `board:` の行を書き換える** (52 の docs/108・120)。
 *
 * ここは DOM を知らない。選び手は `page/silk.ts`。
 */

/** `silk:` の語。先頭の `board` は「書かない」(既定。基板の刷りどおり)。 */
export const SILKS = ['board', 'fence', 'alpha-rows', 'alpha-cols'] as const;
export type Silk = (typeof SILKS)[number];

const isSilk = (word: string): word is Silk => (SILKS as readonly string[]).includes(word);

/** 選び手の語の説明 (欄には綴りだけを出し、説明は吹き出しに回す — 帯を 1 行に収めるため)。 */
export const SILK_HINT: Readonly<Record<Silk, string>> = {
  board: '基板の刷りどおり (既定。書かない)',
  fence: '英字が行 (上から)・数字が列 (左から)',
  'alpha-rows': '英字が行 (下から)・数字が列 (左から)',
  'alpha-cols': '英字が列 (左から)・数字が行 (下から)',
};

const BOARD_LINE = /^board:[ \t]*(.*)$/;
const SILK_LINE = /^([ \t]+)silk:[ \t]*([^\s#]*)/;
const FLOW_SILK = /(,[ \t]*)?silk:[ \t]*[\w-]+[ \t]*(,[ \t]*)?/;

const splitLines = (source: string): string[] => source.split('\n');

/** 最上位の `board:` の行の番号。無ければ -1。 */
const boardAt = (lines: readonly string[]): number => lines.findIndex((line) => BOARD_LINE.test(line));

/** `board:` の block の終わり (次の最上位の行の番号、または末尾)。字下げした行と空行は block の中。 */
function blockEnd(lines: readonly string[], from: number): number {
  let end = from + 1;
  while (end < lines.length && /^[ \t]/.test(lines[end] ?? '')) end += 1;
  return end;
}

/** いまの `silk:`。書いていなければ `board`。読めない語も `board` (断るのは図を描くコア)。 */
export function silkOf(source: string): Silk {
  const lines = splitLines(source);
  const at = boardAt(lines);
  if (at < 0) return 'board';
  const value = BOARD_LINE.exec(lines[at] ?? '')?.[1] ?? '';
  if (value.startsWith('{')) {
    const word = /silk:[ \t]*([\w-]+)/.exec(value)?.[1] ?? '';
    return isSilk(word) ? word : 'board';
  }
  for (const line of lines.slice(at + 1, blockEnd(lines, at))) {
    const word = SILK_LINE.exec(line)?.[2];
    if (word !== undefined) return isSilk(word) ? word : 'board';
  }
  return 'board';
}

/** フロー形 (`board: {size: 5x7cm}`) の書き換え。 */
function inFlow(line: string, silk: Silk): string {
  if (silk === 'board') return line.replace(FLOW_SILK, (_all, _before, after) => (after === undefined ? '' : ', ')).replace(/,[ \t]*\}/, '}');
  if (FLOW_SILK.test(line)) return line.replace(/silk:[ \t]*[\w-]+/, `silk: ${silk}`);
  return line.replace(/[ \t]*\}[ \t]*$/, `, silk: ${silk}}`);
}

/**
 * `silk:` を書き換えた本文。**board: が無ければ null** (どこにも書けない)。
 * `board` を選ぶと `silk:` の行を消す (既定に戻す)。
 */
export function withSilk(source: string, silk: Silk): string | null {
  const lines = splitLines(source);
  const at = boardAt(lines);
  if (at < 0) return null;

  const line = lines[at] ?? '';
  const value = (BOARD_LINE.exec(line)?.[1] ?? '').trim();

  if (value.startsWith('{')) {
    return [...lines.slice(0, at), inFlow(line, silk), ...lines.slice(at + 1)].join('\n');
  }

  if (value !== '') {
    // 1 行形 (`board: 5x7cm`) は block 形に直す。既定のままなら何も変えない。
    if (silk === 'board') return source;
    return [...lines.slice(0, at), 'board:', `  size: ${value}`, `  silk: ${silk}`, ...lines.slice(at + 1)].join('\n');
  }

  const end = blockEnd(lines, at);
  const body = lines.slice(at + 1, end);
  const found = body.findIndex((one) => SILK_LINE.test(one));
  const indent = /^([ \t]+)\S/.exec(body.find((one) => /\S/.test(one)) ?? '')?.[1] ?? '  ';

  if (found >= 0) {
    const next = silk === 'board'
      ? body.filter((_one, index) => index !== found)
      : body.map((one, index) => (index === found ? `${indent}silk: ${silk}` : one));
    return [...lines.slice(0, at + 1), ...next, ...lines.slice(end)].join('\n');
  }
  if (silk === 'board') return source;
  // block の最後の中身の行の後ろに足す (末尾の空行は block の外へ残す)。
  let last = body.length;
  while (last > 0 && !/\S/.test(body[last - 1] ?? '')) last -= 1;
  return [...lines.slice(0, at + 1), ...body.slice(0, last), `${indent}silk: ${silk}`, ...body.slice(last), ...lines.slice(end)].join('\n');
}
