import type { SceneFence } from 'fence-kit';
import { KINDS } from './check.ts';
import type { Finding, Kind, NetPair } from './check.ts';

/** 1 枚の図の検査結果。`file` と `line` は Markdown の中の場所 (フェンスの開き記号の行)。 */
export type FigureResult = {
  readonly file: string;
  readonly line: number;
  readonly fence: SceneFence;
  readonly title: string | null;
  readonly sheet: string | null;
  readonly findings: readonly Finding[];
  readonly skipped: number;
  /** 幾何に起こせなかった理由 (読めないフェンスなど)。起こせたら null。 */
  readonly failure: string | null;
};

/** JSON に出す 1 件。テキストの 1 行と同じ中身。 */
export type FindingRow = {
  readonly file: string;
  readonly line: number;
  readonly fence: SceneFence;
  readonly title: string | null;
  readonly sheet: string | null;
  readonly kind: Kind;
  readonly a: string;
  readonly b: string;
  readonly amount: number;
  readonly unit: 'px' | 'point';
  readonly grade: 'sure' | 'uncertain';
  /** 交差した 2 本のネットの組 (`crossing` で、ネットの分かる図だけ)。件の鍵には入れない。 */
  readonly nets?: NetPair;
};

export type Summary = {
  readonly fences: number;
  readonly byFence: Readonly<Record<SceneFence, number>>;
  readonly byKind: Readonly<Record<Kind, number>>;
  readonly uncertain: number;
  readonly figuresWithFindings: number;
  readonly skipped: number;
  readonly failures: number;
};

/** フェンスの中の行を Markdown の行に直す。行が分からない件は開き記号の行。 */
const markdownLine = (figure: FigureResult, finding: Finding): number =>
  finding.line === null ? figure.line : figure.line + finding.line;

export function rowsOf(figures: readonly FigureResult[]): readonly FindingRow[] {
  return figures.flatMap((figure) => figure.findings.map((finding) => ({
    file: figure.file,
    line: markdownLine(figure, finding),
    fence: figure.fence,
    title: figure.title,
    sheet: figure.sheet,
    kind: finding.kind,
    a: finding.a,
    b: finding.b,
    amount: finding.amount,
    unit: finding.unit,
    grade: finding.grade,
    ...(finding.nets === undefined ? {} : { nets: finding.nets }),
  })));
}

/** 1 行の形: `<file>:<行> <フェンス>[枚] <図の題> <項目> A × B <量>`。近似は末尾に `?`。 */
export function formatRow(row: FindingRow): string {
  const sheet = row.sheet === null ? '' : `[${row.sheet}]`;
  const title = row.title === null ? '' : ` ${row.title}`;
  const amount = row.unit === 'px' ? `${row.amount}px` : '';
  const mark = row.grade === 'uncertain' ? '?' : '';
  const nets = row.nets === undefined ? '' : ` (${row.nets})`;
  return `${row.file}:${row.line} ${row.fence}${sheet}${title} ${row.kind} ${row.a} × ${row.b} ${amount}${mark}${nets}`.trimEnd();
}

const zeroKinds = (): Record<Kind, number> =>
  Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<Kind, number>;

export function summarize(figures: readonly FigureResult[]): Summary {
  const byFence: Record<SceneFence, number> = { circuit: 0, breadboard: 0, perfboard: 0 };
  const byKind = zeroKinds();
  let uncertain = 0;
  for (const figure of figures) {
    byFence[figure.fence] += 1;
    for (const finding of figure.findings) {
      byKind[finding.kind] += 1;
      if (finding.grade === 'uncertain') uncertain += 1;
    }
  }
  return {
    fences: figures.length,
    byFence,
    byKind,
    uncertain,
    figuresWithFindings: figures.filter((figure) => figure.findings.length > 0).length,
    skipped: figures.reduce((sum, figure) => sum + figure.skipped, 0),
    failures: figures.filter((figure) => figure.failure !== null).length,
  };
}

export function formatSummary(summary: Summary): string {
  const fences = `${summary.fences} fences (circuit ${summary.byFence.circuit} / breadboard ${summary.byFence.breadboard} / perfboard ${summary.byFence.perfboard})`;
  const kinds = KINDS.map((kind) => `${kind} ${summary.byKind[kind]}`).join(' / ');
  const extra = [
    `figures with findings ${summary.figuresWithFindings}`,
    `uncertain ${summary.uncertain}`,
    `skipped wires ${summary.skipped}`,
    `unreadable ${summary.failures}`,
  ].join(' / ');
  return `${fences}\n${kinds}\n${extra}`;
}

/** 件の多い図から順に `n` 枚。棚卸しで目で見る図を選ぶのに使う。 */
export function topFigures(figures: readonly FigureResult[], n: number): readonly FigureResult[] {
  return [...figures]
    .filter((figure) => figure.findings.length > 0)
    .sort((a, b) => b.findings.length - a.findings.length || a.file.localeCompare(b.file) || a.line - b.line)
    .slice(0, n);
}

export const formatTop = (figure: FigureResult): string => {
  const counts = KINDS
    .map((kind) => [kind, figure.findings.filter((finding) => finding.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ');
  const sheet = figure.sheet === null ? '' : `[${figure.sheet}]`;
  return `${figure.findings.length}\t${figure.file}:${figure.line} ${figure.fence}${sheet}${figure.title === null ? '' : ` ${figure.title}`} (${counts})`;
};
