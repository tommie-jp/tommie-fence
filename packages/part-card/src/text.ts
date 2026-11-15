import { LineCounter, isNode, parseDocument } from 'yaml';
import { readCard } from 'fence-kit';
import type { PartCard } from 'fence-kit';

/**
 * 部品カードの字を読む (52 の docs/158 の 2-1)。YAML を読み、fence-kit の `readCard` で検め、
 * 言うことの道筋 (`['pins', 3]`) を**行番号に直す**。Node の API を使わないので、ブラウザでも呼べる。
 */
export type CardTextIssue = {
  /** 1 始まりの行。 */
  readonly line: number;
  readonly message: string;
  readonly severity: 'error' | 'notice';
};

export type CardTextRead = { readonly card: PartCard | null; readonly issues: readonly CardTextIssue[] };

/** 1 枚の字の上限。部品 1 つのカードがこれを越えることはない (大きな字で詰まらせない)。 */
export const MAX_CARD_BYTES = 64 * 1024;

/** 大きすぎるときの文 (ファイルを読む前に断る側も使う)。 */
export const cardTooLarge = (): string => TOO_LARGE_TEXT;

const TOO_LARGE_TEXT = `部品カードが大きすぎます (${MAX_CARD_BYTES / 1024} KB まで)`;

/** 字を読んで部品カードにする。読めなければ card は null で、行番号つきの理由が並ぶ。 */
export function readCardText(text: string): CardTextRead {
  if (text.length > MAX_CARD_BYTES) return { card: null, issues: [{ line: 1, message: TOO_LARGE_TEXT, severity: 'error' }] };
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) {
    return {
      card: null,
      issues: doc.errors.map((error) => ({
        line: error.linePos?.[0].line ?? 1,
        message: `YAML として読めません: ${error.message.split('\n')[0] ?? ''}`,
        severity: 'error' as const,
      })),
    };
  }

  /** 道筋の行。その節が無ければ (書き忘れた欄)、親をさかのぼる。 */
  const lineOf = (path: readonly (string | number)[]): number => {
    for (let depth = path.length; depth > 0; depth -= 1) {
      const node: unknown = doc.getIn(path.slice(0, depth), true);
      if (isNode(node) && node.range !== null && node.range !== undefined) return lineCounter.linePos(node.range[0]).line;
    }
    return 1;
  };

  // 別名 (`&a` `*a`) を重ねて膨らませる字は、toJS が数えて投げる。そのカードだけを誤りにする
  // (投げたままにすると、同じ置き場のほかのカードまで読めなくなる)。
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch (error) {
    return { card: null, issues: [{ line: 1, message: `YAML として読めません: ${error instanceof Error ? error.message : String(error)}`, severity: 'error' }] };
  }
  const { card, issues } = readCard(value);
  return {
    card,
    issues: issues.map((issue) => ({ line: lineOf(issue.path), message: issue.message, severity: issue.severity })),
  };
}
