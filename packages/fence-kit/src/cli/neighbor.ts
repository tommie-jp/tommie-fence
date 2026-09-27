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
 *   `lstat` で断り、開くときも `O_NOFOLLOW` (有る OS だけ) で差し替えに備える
 * - **通常のファイル以外は読まない** (デバイス・FIFO・ソケット)。`/dev/zero` は大きさが
 *   0 と出るので、大きさの検査だけでは止まらない
 * - **読むのは上限まで。** 開いた後の大きさを信じず、`maxBytes` を超えたら捨てる
 */
export type NeighborLimits = { readonly pattern: RegExp; readonly maxBytes: number };

export function readNeighbor(home: string, name: string, limits: NeighborLimits): string | null {
  if (!limits.pattern.test(name) || basename(name) !== name) return null;
  const path = join(home, name);
  let fd: number | null = null;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limits.maxBytes) return null;
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
