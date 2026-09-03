import { readTar } from './tar.ts';

/**
 * TeX の資材 (WASM・コアダンプ・スタイルファイル) を落として広げる。
 *
 * **落とすのは最初に circuit の図を描くときだけ。** 3 つで合わせて 4.8 MB
 * あるので、頁を開いた人全員に払わせない (breadboard と perfboard は要らない)。
 * 出所は node-tikzjax の `tex/`。中身はもともとブラウザ版 TikZJax
 * (artisticat1/tikzjax) のもので、circuitikz が入っている。
 */

/** `dist/tex/` に置く。ビルドが node_modules から写す。 */
const BASE = 'tex/';

export type Engine = {
  /** TeX を起こした直後のメモリの写し。 */
  readonly coredump: Uint8Array<ArrayBuffer>;
  /**
   * TeX の WASM。**`ArrayBuffer` を後ろに持つと書いておく** —
   * `WebAssembly.compile` は共有メモリを後ろに持つ列を受け取らないので、
   * ここを緩めると渡せない。
   */
  readonly bytecode: Uint8Array<ArrayBuffer>;
  /** `\usepackage` で読まれるファイル。名前で引く。 */
  readonly files: ReadonlyMap<string, Uint8Array>;
};

async function fetchGz(name: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(`${BASE}${name}`);
  if (!response.ok) throw new Error(`${name} を取れませんでした (${response.status})`);
  if (response.body === null) throw new Error(`${name} の中身が空でした`);

  // gzip を解くのはブラウザの仕事にする (zlib も pako も持ち込まない)。
  const unzipped = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(unzipped).arrayBuffer());
}

let loading: Promise<Engine> | null = null;

async function load(say: (text: string) => void): Promise<Engine> {
  say('TeX を読み込んでいます (初回だけ 4.8 MB)');
  const [coredump, bytecode, tarball] = await Promise.all([
    fetchGz('core.dump.gz'),
    fetchGz('tex.wasm.gz'),
    fetchGz('tex_files.tar.gz'),
  ]);
  return { coredump, bytecode, files: readTar(tarball) };
}

/**
 * 一度読んだら覚えておく。**失敗したら覚えない** —
 * 通信が切れただけのときに、以後ずっと同じ失敗を返し続けないため。
 */
export function loadEngine(say: (text: string) => void): Promise<Engine> {
  loading ??= load(say).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
