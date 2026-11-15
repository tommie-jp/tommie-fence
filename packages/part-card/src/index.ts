/**
 * 部品カード (`*.part.yaml`) を読む (52 の docs/158)。ここはブラウザでも呼べる字の読み取りだけ。
 * 置き場のディレクトリを読むのは `part-card/node`。
 */
export { MAX_CARD_BYTES, cardTooLarge, readCardText } from './text.ts';
export type { CardTextIssue, CardTextRead } from './text.ts';
export { ROW_BLOCKS, replaceRowBlock, rowBlockText } from './docRows.ts';
export type { RowBlock } from './docRows.ts';
