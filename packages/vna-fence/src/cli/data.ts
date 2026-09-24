import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DataSource } from '../core/index.ts';
import { DATA_NAME, LIMITS } from '../core/limits.ts';

/**
 * `data:` の読み口 (CLI と拡張のデスクトップ版)。**入力の `.md` と同じディレクトリの
 * 通常のファイルだけ**。読めなければ null (core が「見つかりません」と言う)。
 *
 * 名前は core が `DATA_NAME` で絞っているが、名前の形だけでは足りない:
 *
 * - **シンボリックリンクは辿らない。** 共有されたリポジトリに `x.s1p -> ~/.ssh/id_rsa`
 *   や `-> /dev/zero` を置かれると、名前は正しいまま外を読む (レビューで見つかった)。
 *   `lstat` で断り、開くときも `O_NOFOLLOW` (有る OS だけ) で差し替えに備える
 * - **通常のファイル以外は読まない** (デバイス・FIFO・ソケット)。`/dev/zero` は大きさが
 *   0 と出るので、大きさの検査だけでは止まらない
 * - **読むのは上限まで。** 開いた後の大きさを信じず、`dataBytes` を超えたら捨てる
 */
export const dataFrom = (home: string): DataSource => (name) => {
  if (!DATA_NAME.test(name) || basename(name) !== name) return null;
  const path = join(home, name);
  let fd: number | null = null;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > LIMITS.dataBytes) return null;
    const buffer = Buffer.alloc(LIMITS.dataBytes + 1);
    let length = 0;
    for (;;) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
      if (length > LIMITS.dataBytes) return null;
    }
    return buffer.subarray(0, length).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
};
