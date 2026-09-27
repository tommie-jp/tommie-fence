import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * `data:` の読み口 (CLI と拡張のデスクトップ版)。**`home` (入力の `.md` と同じ
 * ディレクトリ) の通常のファイルだけ**。読めなければ null (core が「見つかりません」と言う)。
 * vna が持っていた物を、scope が 2 つ目の使い手になったので引き上げた。
 *
 * 名前は core が `pattern` で絞っているが、名前の形だけでは足りない:
 *
 * - **名前はそのままファイル名であること。** `pattern` を通っても `basename` と違えば断る
 * - **シンボリックリンクは辿らない。** 共有されたリポジトリに `x.s1p -> ~/.ssh/id_rsa`
 *   や `-> /dev/zero` を置かれると、名前は正しいまま外を読む (レビューで見つかった)。
 *   `lstat` で断り、開くときも `O_NOFOLLOW` (有る OS だけ) で差し替えに備える。
 *   **`O_NOFOLLOW` の無い OS (Windows) では、`lstat` と `open` の間に差し替えられると
 *   外を開ける** (TOCTOU)。開いた後で、開いた物 (`fstat`) と名前の指す物 (取り直した
 *   `lstat`) が同じファイル (`dev` と `ino`) かを見て、違えば捨てる (`sameFile`)
 * - **通常のファイル以外は読まない** (デバイス・FIFO・ソケット)。`/dev/zero` は大きさが
 *   0 と出るので、大きさの検査だけでは止まらない
 * - **読むのは上限まで。** 開いた後の大きさを信じず、`maxBytes` を超えたら捨てる
 */
export type NeighborLimits = { readonly pattern: RegExp; readonly maxBytes: number };

/** ファイルの身元 (`stat` の `bigint: true` の形。`ino` は number だと 2^53 を超えて丸まる)。 */
export type FileIdentity = { readonly dev: bigint; readonly ino: bigint; isSymbolicLink(): boolean };

/**
 * 開いた物 (`opened` = `fstat`) と、開いた直後に名前が指している物 (`named` = `lstat`) が
 * **同じ通常のファイル**か。名前がシンボリックリンクになっていれば、身元が同じでも断る。
 */
export const sameFile = (opened: FileIdentity, named: FileIdentity): boolean =>
  !named.isSymbolicLink() && opened.dev === named.dev && opened.ino === named.ino;

export function readNeighbor(home: string, name: string, limits: NeighborLimits): string | null {
  if (!limits.pattern.test(name) || basename(name) !== name) return null;
  const path = join(home, name);
  let fd: number | null = null;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.size > BigInt(limits.maxBytes)) return null;
    if (!sameFile(stat, lstatSync(path, { bigint: true }))) return null;
    const buffer = Buffer.alloc(limits.maxBytes + 1);
    let length = 0;
    for (;;) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
      if (length > limits.maxBytes) return null;
    }
    return buffer.subarray(0, length).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
