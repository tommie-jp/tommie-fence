export type FenceBlock = {
  /** フェンスの中身 (末尾は改行で終わる)。 */
  readonly source: string;
  /** 開き記号が書かれた行 (1 始まり)。 */
  readonly line: number;
};

const FENCE_LINE = /^(\s{0,3})(`{3,}|~{3,})\s*(.*)$/;
const CLOSING_LINE = /^\s{0,3}(`{3,}|~{3,})\s*$/;
const LANGUAGE = 'circuit';

type OpenFence = {
  readonly char: string;
  readonly length: number;
  readonly indent: number;
  readonly isTarget: boolean;
  readonly startLine: number;
  readonly body: string[];
};

const stripIndent = (line: string, indent: number): string => {
  let removed = 0;
  while (removed < indent && line[removed] === ' ') removed += 1;
  return line.slice(removed);
};

/**
 * Markdown から ```circuit フェンスだけを取り出す。
 * markdown-it を通さずに使えるので、CLI や別アプリのサーバー側描画から呼べる。
 */
export function extractCircuitFences(markdown: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let open: OpenFence | null = null;

  for (const [index, raw] of markdown.split('\n').entries()) {
    if (open) {
      const closing = CLOSING_LINE.exec(raw);
      const marker = closing?.[1];
      if (marker && marker[0] === open.char && marker.length >= open.length) {
        if (open.isTarget) blocks.push({ source: open.body.join(''), line: open.startLine });
        open = null;
        continue;
      }
      open.body.push(`${stripIndent(raw, open.indent)}\n`);
      continue;
    }

    const opening = FENCE_LINE.exec(raw);
    if (!opening) continue;
    const [, indent = '', fence = '', info = ''] = opening;
    open = {
      char: fence[0] ?? '`',
      length: fence.length,
      indent: indent.length,
      isTarget: info.trim().split(/\s+/)[0] === LANGUAGE,
      startLine: index + 1,
      body: [],
    };
  }

  if (open?.isTarget) blocks.push({ source: open.body.join(''), line: open.startLine });

  return blocks;
}

/**
 * 1 枚の図を書き出すときのファイル名 (拡張子を除く)。
 *
 * 1 つの `.md` に図が 2 枚以上あるときだけ連番を付ける。CLI が書き出す名前で
 * あり、`.md` に貼る画像の名前であり、スナップショットの期待値を探す名前でも
 * あるので、**規則はここにだけ置く** (3 通りに書き写していた経緯がある)。
 */
export const outputStem = (stem: string, index: number, count: number): string =>
  count === 1 ? stem : `${stem}-${index + 1}`;
