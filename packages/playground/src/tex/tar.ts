/**
 * tar から「ファイル名 → 中身」だけを取り出す。
 *
 * TeX の資材 (`tex_files.tar.gz`) を読むためだけのもの。node-tikzjax は
 * `tar-fs` で memfs へ展開しているが、こちらが要るのは**名前で引ける表**
 * だけなので、外の道具を持ち込まずに読む (ブラウザで動かすため)。
 *
 * 読むのは ustar の素直な形だけ: 512 バイトのヘッダ + 中身 (512 の倍数に詰める)。
 * ディレクトリと、それ以外の種類 (リンクなど) は飛ばす。
 */

const BLOCK = 512;
const NAME = { at: 0, length: 100 } as const;
const SIZE = { at: 124, length: 12 } as const;
const TYPE = 156;

const decoder = new TextDecoder();

/** ヘッダの字は NUL で埋めてある。最初の NUL までが中身。 */
const textAt = (header: Uint8Array, at: number, length: number): string => {
  const raw = decoder.decode(header.subarray(at, at + length));
  const end = raw.indexOf('\0');
  return end === -1 ? raw : raw.slice(0, end);
};

/** 先頭の `./` は落とす (GNU tar が付ける)。 */
const nameOf = (raw: string): string => raw.replace(/^\.\//, '');

export function readTar(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();

  for (let at = 0; at + BLOCK <= bytes.length; ) {
    const header = bytes.subarray(at, at + BLOCK);
    // 終わりは NUL だけのブロック 2 つ。1 つ見つけた時点で止めてよい。
    if (header.every((byte) => byte === 0)) break;

    const name = nameOf(textAt(header, NAME.at, NAME.length));
    const size = Number.parseInt(textAt(header, SIZE.at, SIZE.length).trim(), 8);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`tar の大きさを読めません: ${name || '(名前なし)'}`);
    }

    const type = String.fromCharCode(header[TYPE] ?? 0);
    at += BLOCK;
    // '0' が普通のファイル。古い tar は NUL で書く。
    if ((type === '0' || type === '\0') && name !== '') {
      files.set(name, bytes.subarray(at, at + size));
    }
    at += Math.ceil(size / BLOCK) * BLOCK;
  }

  return files;
}
