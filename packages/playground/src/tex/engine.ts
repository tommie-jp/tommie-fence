import { Buffer } from 'buffer';
import * as library from 'node-tikzjax/dist/library.js';
import { loadEngine } from './assets.ts';

/**
 * TeX を走らせて DVI を作る。中身は node-tikzjax の `bootstrap.ts` と同じ段取りで、
 * **Node に縛られている部分だけを差し替えた**もの:
 * ファイルの読み込みは `fetch`、gzip はブラウザ、tar は自前 (`tar.ts`)、
 * 展開先の memfs は名前で引く表。エンジン本体 (`library.js`) はそのまま使う。
 */

/** WASM のページは 64 KiB。 */
const PAGE = 65_536;

/** `library.js` は `/tex_files/<名前>` の形で聞いてくる。 */
const TEX_DIR = '/tex_files/';

export async function texToDvi(source: string, say: (text: string) => void): Promise<Uint8Array> {
  const { coredump, bytecode, files } = await loadEngine(say);
  say('図を描いています');

  library.writeFileSync('input.tex', Buffer.from(source));

  // コアダンプは「TeX を起こした直後のメモリ」。写してから動かす。
  const memory = new WebAssembly.Memory({ initial: library.pages, maximum: library.pages });
  new Uint8Array(memory.buffer, 0, library.pages * PAGE).set(coredump);
  library.setMemory(memory.buffer);
  // 第 2 引数は「終わったときに呼ぶもの」。ここでは待たないので渡さない
  // (型の宣言は必須のように書かれているが、中身は `if (cb)` で見ている)。
  library.setInput(' input.tex \n\\end\n', undefined);

  // **無い名前は無いと返す。** library.js は例外を握り潰して「そのファイルは
  // 無かった」として進むので、こちらは分かるように投げておく。
  library.setFileLoader(async (name: string) => {
    const found = files.get(name.startsWith(TEX_DIR) ? name.slice(TEX_DIR.length) : name);
    if (found === undefined) throw new Error(`TeX の資材にありません: ${name}`);
    return Buffer.from(found);
  });

  // 組み立てと生成を分ける。1 回で書くと、型の上では「Module を渡した」形と
  // 見分けが付かず、返るものが食い違う。
  const engine = await WebAssembly.compile(bytecode);
  const instance = await WebAssembly.instantiate(engine, { library, env: { memory } });
  await library.executeAsync(instance.exports);

  try {
    const dvi = new Uint8Array(library.readFileSync('input.dvi'));
    return dvi;
  } catch {
    throw new Error('TeX が図を組めませんでした (フェンスの書き方が TeX まで通っていません)');
  } finally {
    // 次に描くときのために、必ず片付ける (残すと 2 枚目が壊れる)。
    library.deleteEverything();
  }
}
