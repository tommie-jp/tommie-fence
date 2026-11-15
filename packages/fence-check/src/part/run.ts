import { renderBreadboard } from 'breadboard-fence/src/core';
import { compileCircuit } from 'circuit-fence/src/core';
import { renderPerfboard } from 'perfboard-fence/src/core';
import { buildCardTable } from 'fence-kit';
import type { CardTable, PartCard } from 'fence-kit';
import { readCardText } from 'part-card';
import { previewFences } from './fences.ts';
import type { PreviewFence } from './fences.ts';

/**
 * `part-card check` の中身 (52 の docs/158 の 2-5)。**Node の API を使わない** — 字を受けて、
 * 言うことの行と、描いた図 (SVG。回路図は TeX の字) を返す。ファイルを読み書きするのは main。
 */

export type CardLine = { readonly severity: 'error' | 'notice'; readonly text: string };

export type CheckedCard = {
  readonly card: PartCard | null;
  readonly table: CardTable | null;
  readonly lines: readonly CardLine[];
  /** 確かめの図。カードが読めなければ空。 */
  readonly figures: readonly (PreviewFence & { readonly svg: string | null; readonly tex: string | null })[];
};

/** 1 枚のカードの字を検め、その部品 1 個の図を 3 つのフェンスで組む。 */
export function checkCardText(text: string, label: string): CheckedCard {
  const read = readCardText(text);
  const lines: CardLine[] = read.issues.map((issue) => ({
    severity: issue.severity,
    text: `${label}:${issue.line}: ${issue.severity === 'error' ? '誤り' : 'お知らせ'}: ${issue.message}`,
  }));
  if (read.card === null) return { card: null, table: null, lines, figures: [] };

  const { table, notices } = buildCardTable([{ card: read.card, file: label }]);
  for (const notice of notices) lines.push({ severity: 'notice', text: `${label}: お知らせ: ${notice.message}` });

  const figures = previewFences(read.card).map((fence) => {
    const drawn = draw(fence, table);
    for (const message of drawn.errors) lines.push({ severity: 'error', text: `${label}: ${fence.fence} の図: 誤り: ${message}` });
    for (const message of drawn.notices) lines.push({ severity: 'notice', text: `${label}: ${fence.fence} の図: お知らせ: ${message}` });
    return { ...fence, svg: drawn.svg, tex: drawn.tex };
  });
  return { card: read.card, table, lines, figures };
}

type Drawn = {
  readonly svg: string | null;
  readonly tex: string | null;
  readonly errors: readonly string[];
  readonly notices: readonly string[];
};

const texts = (items: readonly { readonly message: string }[]): readonly string[] => items.map((item) => item.message);

function draw(fence: PreviewFence, cards: CardTable): Drawn {
  switch (fence.fence) {
    case 'breadboard': {
      const result = renderBreadboard(fence.source, { cards });
      return { svg: result.svg || null, tex: null, errors: texts(result.errors), notices: texts(result.notices) };
    }
    case 'perfboard': {
      const result = renderPerfboard(fence.source, { cards });
      return { svg: result.svg || null, tex: null, errors: texts(result.errors), notices: texts(result.notices) };
    }
    case 'circuit': {
      const result = compileCircuit(fence.source, { cards });
      return { svg: null, tex: result.tex, errors: texts(result.errors), notices: texts(result.notices) };
    }
  }
}
