import { findCardDir, loadCardDir } from 'part-card/node';
import type { CardDirRead } from 'part-card/node';
import type { CardTable } from 'fence-kit';

/**
 * ワークスペースの部品カードの控え (52 の docs/158 の 3-1)。**vscode を知らない形**にしてある (試験で使うため)。
 *
 * プレビューはフェンスを 1 つ描くたびに表を訊くので、ファイルからカードの置き場を探すのも、置き場を読むのも
 * 1 度だけにして控える。カードが変わったら `clear` で全部捨てる (置き場は少なく、読み直しは軽い)。
 */
export type CardStore = {
  /** その文書を描くときの表。置き場が無い・読まない (信頼されていない) なら undefined。 */
  readonly tableFor: (path: string) => CardTable | undefined;
  /** 置き場を読んだ結果 (Problems に出す)。 */
  readonly readDir: (dir: string) => CardDirRead;
  readonly clear: () => void;
};

export type CardStoreOptions = {
  /** その文書のワークスペースのフォルダ。ここより上は探さない。無ければ null (探さない)。 */
  readonly stopFor: (path: string) => string | null;
  /** 読んでよいか (信頼されたワークスペースだけ)。 */
  readonly enabled: () => boolean;
};

export function createCardStore(options: CardStoreOptions): CardStore {
  const dirOf = new Map<string, string | null>();
  const reads = new Map<string, CardDirRead>();

  const readDir = (dir: string): CardDirRead => {
    const known = reads.get(dir);
    if (known !== undefined) return known;
    const read = loadCardDir(dir);
    reads.set(dir, read);
    return read;
  };

  const tableFor = (path: string): CardTable | undefined => {
    if (!options.enabled()) return undefined;
    if (!dirOf.has(path)) {
      const stop = options.stopFor(path);
      dirOf.set(path, stop === null ? null : findCardDir(path, stop));
    }
    const dir = dirOf.get(path) ?? null;
    if (dir === null) return undefined;
    try {
      return readDir(dir).table;
    } catch {
      // 読めない置き場 (権限・途中で消えた) は無いものとして描く。何が起きたかは Problems の側で出る。
      return undefined;
    }
  };

  return {
    tableFor,
    readDir,
    clear: () => {
      dirOf.clear();
      reads.clear();
    },
  };
}
