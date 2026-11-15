import { boardPartNames, discreteTable, lookupBoardPart, lookupRole, moduleTable, pinoutTable } from 'fence-kit';

/**
 * 同梱の部品の表の中身の控え (52 の docs/160 の段 0)。TS の行を部品カードへ移すあいだ、
 * **移す前と移したあとの表が、並びを除いて同じ**ことを見るために使う。次の Release のあとで消す。
 *
 * 鍵は表の種類と代表の型番。並びは見ない (カードはファイルの名前の順につながるので、ギャラリーの順は変わってよい)。
 * どこから読んだかの印 (`card`) は見ない。英語の働きは `lookupRole` の答え (`role-en:` と `pinoutRolesEn.ts` のどちらから来ても同じに見る)。
 */
export type TableSnapshot = Readonly<Record<string, unknown>>;

/** 鍵を並べ替えた写し (JSON の字を並びに依らず同じにする)。undefined の欄は落とす。 */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .map((key) => [key, sorted((value as Record<string, unknown>)[key])]));
}

const withoutCard = <T extends object>(row: T): Omit<T, 'card'> => {
  const { card: _card, ...rest } = row as T & { card?: unknown };
  return rest;
};

export function tableSnapshot(): TableSnapshot {
  const entries: [string, unknown][] = [
    ...pinoutTable().map((row) => [`pin:${row.models[0]}`, { ...withoutCard(row), roleEn: lookupRole(row.models[0] ?? '', 'en') }] as [string, unknown]),
    ...discreteTable().map((row) => [`discrete:${row.type}:${row.models[0]}`, withoutCard(row)] as [string, unknown]),
    ...moduleTable().map((row) => [`module:${row.models[0]}`, withoutCard(row)] as [string, unknown]),
    ...boardPartNames().map((name) => [`board:${name}`, lookupBoardPart(name)] as [string, unknown]),
  ];
  const keys = entries.map(([key]) => key);
  const twice = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (twice.length > 0) throw new Error(`表の鍵が重なっています: ${twice.join(' ')}`);
  return sorted(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))) as TableSnapshot;
}
