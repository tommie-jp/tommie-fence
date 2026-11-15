import { discreteTable } from '../discretes.ts';
import type { DiscreteRow } from '../discretes.ts';
import { moduleTable } from '../modules.ts';
import type { ModuleRow } from '../modules.ts';
import { pinoutTable } from '../pinouts.ts';
import type { PinoutRow } from '../pinouts.ts';
import { BUNDLED_CARD_DOCS } from './bundled.docs.gen.ts';
import type { CardDocs } from './types.ts';

/**
 * 表の行に、文書だけの欄 (出典・注・標準の品・見る向き) を足した物 (52 の docs/162)。
 * **描く側はここを読まない** — 読むのは文書の書き出し (`npm run rows`) と試験だけなので、束には入らない
 * (束ねる道具が、使われない書き出しを落とす)。TS で書いた行 (Debug Probe) は元から全部の欄を持つ。
 */
const docsOf = (kind: string, model: string | undefined): CardDocs => BUNDLED_CARD_DOCS[`${kind}:${model ?? ''}`] ?? {};

const merged = <Row extends { readonly models: readonly string[]; readonly card?: 'bundled' | 'local' }>(kind: string, row: Row): Row & CardDocs =>
  (row.card === 'bundled' ? { ...row, ...docsOf(kind, row.models[0]) } : row);

export const pinoutDocTable = (): readonly (PinoutRow & CardDocs)[] => pinoutTable().map((row) => merged('chip', row));
export const discreteDocTable = (): readonly (DiscreteRow & CardDocs)[] => discreteTable().map((row) => merged('discrete', row));
export const moduleDocTable = (): readonly (ModuleRow & CardDocs)[] => moduleTable().map((row) => merged('module', row));
export const bundledCardDocs = (): Readonly<Record<string, CardDocs>> => BUNDLED_CARD_DOCS;
