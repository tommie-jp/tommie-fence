import type { DiscreteKind, PartCard } from 'fence-kit';

/**
 * 部品カード 1 枚を確かめる図 (52 の docs/158 の 2-5・2-6)。**その部品 1 個だけを置いたフェンス**を
 * フェンスごとに組む。カードの姿 (`package:`) がそのフェンスに無ければ、その図は作らない
 * (例: ボードは回路図に無い)。
 */
export type PreviewFence = {
  readonly fence: 'breadboard' | 'perfboard' | 'circuit';
  readonly source: string;
};

const PERF_HEAD = ['board:', '  size: 46x24', '  h: 1.6mm', '  material: FR-4', '  slots: on', 'style:', '  check: off'];

/** 回路図の記号 (3 ピン)。レギュレータは記号に型番の並びを当てないので描かない。 */
const SYMBOL: Readonly<Record<DiscreteKind, string | null>> = {
  npn: 'npn', pnp: 'pnp', 'nch-mos': 'nmos', 'pch-mos': 'pmos', 'nch-jfet': 'njfet', 'pch-jfet': 'pjfet', regulator: null,
};

const titled = (card: PartCard, fence: string, lines: readonly string[]): string =>
  [`title: 部品カード ${card.models[0] ?? ''} (${fence})`, ...lines].join('\n');

const deviceLines = (model: string, extra: readonly string[] = []): readonly string[] =>
  ['  M1:', '    type: device', `    model: ${model}`, ...extra];

/** カード 1 枚の確かめの図。 */
export function previewFences(card: PartCard): readonly PreviewFence[] {
  const model = card.models[0] ?? '';
  const out: PreviewFence[] = [];
  const add = (fence: PreviewFence['fence'], lines: readonly string[]): void => {
    out.push({ fence, source: titled(card, fence, lines) });
  };

  switch (card.kind) {
    case 'chip': {
      const token = card.package;
      const isDip = token.startsWith('dip');
      add('breadboard', ['parts:', `  U1: ${token} ${isDip ? 'e5' : 'c5'} ${model}`]);
      add('perfboard', [...PERF_HEAD, 'parts:', `  U1: ${token} ${isDip ? 'e5' : 'c5'} ${model}`]);
      const circuitToken = token.split('/')[0] ?? token;
      add('circuit', [
        'parts:', `  U1: ${circuitToken} 2,2 ${model}`,
        ...(card.ic === undefined ? [] : [`  U2: ic 9,3 ${model}`]),
      ]);
      break;
    }
    case 'discrete': {
      add('breadboard', ['parts:', `  Q1: ${card.package} a5 a6 a7 ${model}`]);
      add('perfboard', [...PERF_HEAD, 'parts:', `  Q1: ${card.package} c5 c6 c7 ${model}`]);
      const symbol = SYMBOL[card.discreteKind];
      if (symbol !== null) add('circuit', ['parts:', `  Q1: ${symbol} 2,2 ${model}`]);
      break;
    }
    case 'module':
      add('breadboard', ['parts:', ...deviceLines(model)]);
      add('perfboard', [...PERF_HEAD, 'parts:', ...deviceLines(model)]);
      add('circuit', ['parts:', ...deviceLines(model, ['    at: 3,3'])]);
      break;
    case 'board':
      add('breadboard', ['parts:', `  B1: ${model} @ h5`]);
      add('perfboard', [...PERF_HEAD, 'parts:', `  U1: ${model} b2`]);
      break;
  }
  return out;
}
