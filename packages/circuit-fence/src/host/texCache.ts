import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 描いた回路図 (TeX → SVG) をディスクに控える (52 の docs/163 の段 1・2)。**Node の API を使う**ので、
 * デスクトップの拡張と CLI だけが使う (web 版は TeX を回さない)。
 *
 * TeX → SVG は 1 枚 0.8 秒掛かる (初回 1.1 秒)。同じ TeX なら同じ SVG なので、TeX の字のハッシュを鍵に控える。
 * プレビューの控えはメモリの中だけだったので、VS Code を開き直すと全部描き直していた。CLI は毎回全部描いていた
 * (教科書の 920 枚で約 12 分)。
 *
 * - 置き場は `<dir>/<key>/<hash>.svg`。`key` は処理系の版 (circuit-fence と TeX のエンジン)。版が変われば別の
 *   ディレクトリになり、古い控えは使われない (`prune` が消す)
 * - 控えるのは描けた図だけ。描けなかった図 (TeX の誤り) は控えない — 直したら描き直す
 * - 読めない・書けないときは黙って控え無しで動く (控えは速くするための物で、無くても図は出る)
 */
export type FigureStore = {
  readonly get: (hash: string) => string | undefined;
  readonly put: (hash: string, svg: string) => void;
};

/** ハッシュは自前の 14 桁 (`hash.ts`)。ファイルの名前にするので、ほかの字が来たら使わない。 */
const HASH = /^[0-9a-z]{8,32}$/;
/** 1 つの置き場に控える枚数の上限。越えたら古い順に消す (1 枚 6〜70 KB)。 */
const DEFAULT_LIMIT = 5000;

/**
 * 処理系の版から置き場の鍵を作る。TeX のエンジン (node-tikzjax) の版は circuit-fence の依存に書いてあり、
 * 上げるときは circuit-fence の版も上がるので、処理系の版だけで分ければ足りる。
 */
export const texCacheKey = (version: string): string => `v1-${version}`.replace(/[^0-9A-Za-z.-]/g, '_');

/** 置き場の控え。`dir` の下に `key` のディレクトリを作る。作れなければ何も控えない控えを返す。 */
export function createDiskStore(dir: string, key: string, limit = DEFAULT_LIMIT): FigureStore {
  const home = join(dir, key);
  try {
    mkdirSync(home, { recursive: true });
    prune(dir, key, limit);
  } catch {
    return { get: () => undefined, put: () => undefined };
  }
  const fileOf = (hash: string): string | null => (HASH.test(hash) ? join(home, `${hash}.svg`) : null);
  return {
    get: (hash) => {
      const file = fileOf(hash);
      if (file === null) return undefined;
      try {
        const svg = readFileSync(file, 'utf8');
        // 書きかけで切れた物を図として出さない。
        return svg.includes('</svg>') ? svg : undefined;
      } catch {
        return undefined;
      }
    },
    put: (hash, svg) => {
      const file = fileOf(hash);
      if (file === null) return;
      try {
        // 書きかけを読ませないよう、隣に書いてから名前を替える。
        const partial = `${file}.${process.pid}.tmp`;
        writeFileSync(partial, svg);
        renameSync(partial, file);
      } catch {
        // 書けなくても図は出ている。
      }
    },
  };
}

/** 古い版の置き場を消し、今の版の置き場が上限を越えていれば古い順に消す。 */
function prune(dir: string, key: string, limit: number): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== key) rmSync(join(dir, entry.name), { recursive: true, force: true });
  }
  const home = join(dir, key);
  if (!existsSync(home)) return;
  const files = readdirSync(home).filter((name) => name.endsWith('.svg') || name.endsWith('.tmp'));
  if (files.length <= limit) return;
  const dated = files.map((name) => ({ name, at: statSync(join(home, name)).mtimeMs })).sort((a, b) => a.at - b.at);
  for (const { name } of dated.slice(0, files.length - limit)) rmSync(join(home, name), { force: true });
}
