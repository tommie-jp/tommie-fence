/**
 * ラベルに書ける数式の**部分集合**。`$\dot{E}$` のように教科書と同じ綴りで
 * 書けるようにするためのもの。
 *
 * **書かれた TeX をそのまま渡すのではない**。ここで読み直し、こちらが組み直す
 * (CLAUDE.md 約束 3・6)。生で通すと、フォントの無い数式は例外ではなく
 * **プロセスごと落ち**、TeX のエラーは行番号に引き戻せず、
 * 図の検査 (SVG の許可リスト) の前提も崩れる。
 *
 * 読めるのは次だけ。知らない綴りは、書ける形を添えて理由を返す。
 *
 * - 英数字
 * - `\dot{…}` 点 (フェーザの標準の書き方)
 * - `\mathrm{…}` 立体 (2 字以上の本体。`SW` など)
 * - `_` 添字。1 文字か `{…}` のまとまり
 *
 * 空白は書けない (部品の 1 行は空白で区切って読むため)。
 */

/** 読めた形の TeX か、読めなかった理由。 */
export type MathLabel = { readonly ok: true; readonly tex: string } | { readonly ok: false; readonly message: string };

/** 通す命令。名前 → TeX の綴り (こちらが組み直すので、書かれた字は入らない)。 */
const COMMANDS: Readonly<Record<string, string>> = { dot: '\\dot', mathrm: '\\mathrm' };

const COMMAND_LIST = Object.keys(COMMANDS)
  .map((name) => `\\${name}{…}`)
  .join(' ');

const FORM = `使えるのは 英数字 と ${COMMAND_LIST} と 添字 _ です`;

const isPlain = (char: string): boolean => /^[A-Za-z0-9]$/.test(char);

/** `$…$` で囲んで書かれているか。囲んでいないラベルは ID と同じ組み方で出す。 */
export const isMathLabel = (text: string): boolean =>
  text.length >= 2 && text.startsWith('$') && text.endsWith('$');

/** `$…$` の中身。呼ぶ前に isMathLabel で確かめること。 */
export const mathInnerOf = (text: string): string => text.slice(1, -1);

type Cursor = { readonly text: string; index: number };

const fail = (message: string): MathLabel => ({ ok: false, message: `${message} (${FORM})` });

/**
 * 1 つのまとまりを読む。英数字 1 文字か、通す命令か、`{…}` のまとまり。
 * 読めたら組み直した TeX を返す。
 */
function readAtom(cursor: Cursor): MathLabel {
  const char = cursor.text[cursor.index];
  if (char === undefined) return fail('字が足りません');

  if (isPlain(char)) {
    cursor.index += 1;
    return { ok: true, tex: char };
  }

  if (char === '{') {
    cursor.index += 1;
    const inner = readSequence(cursor, true);
    if (!inner.ok) return inner;
    if (cursor.text[cursor.index] !== '}') return fail('{ に対する } がありません');
    cursor.index += 1;
    // 空のまとまりは TeX としては通るが、名前の無い字が図に出る。
    // ID にも落ちてくれないので、読めなかったことにする。
    if (inner.tex === '') return fail('{} の中身がありません');
    return { ok: true, tex: `{${inner.tex}}` };
  }

  if (char !== '\\') return fail(`${char} は書けません`);

  // 命令。名前は表から引き、引数は同じ読み方で読み直す。
  cursor.index += 1;
  const name = /^[a-z]+/.exec(cursor.text.slice(cursor.index))?.[0] ?? '';
  const spelling = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (spelling === undefined) return fail(`\\${name} は書けません`);

  cursor.index += name.length;
  if (cursor.text[cursor.index] !== '{') return fail(`\\${name} には {…} が要ります`);
  cursor.index += 1;
  const argument = readSequence(cursor, true);
  if (!argument.ok) return argument;
  if (cursor.text[cursor.index] !== '}') return fail(`\\${name} の { に対する } がありません`);
  cursor.index += 1;
  if (argument.tex === '') return fail(`\\${name} の中身がありません`);

  return { ok: true, tex: `${spelling}{${argument.tex}}` };
}

/** まとまりを並べて読む。添字 (`_`) は直前のまとまりに付く。 */
function readSequence(cursor: Cursor, nested: boolean): MathLabel {
  let tex = '';
  // 直前のまとまりに添字が付いているか。`R_1_2` は TeX が「添字が 2 つ」と
  // 言って止まるので、読めたことにすると図が描けずログも行番号に戻せない。
  let subscripted = false;

  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (char === '}') {
      if (nested) break;
      return fail('} に対する { がありません');
    }

    if (char === '_') {
      if (tex === '') return fail('添字を付ける字がありません');
      if (subscripted) return fail('添字を 2 つ続けて書けません');
      cursor.index += 1;
      const subscript = readAtom(cursor);
      if (!subscript.ok) return subscript;
      // 添字は必ず {…} で包む。1 文字でも包んでおけば、組み方が 1 通りに決まる。
      const inner = subscript.tex.startsWith('{') ? subscript.tex : `{${subscript.tex}}`;
      tex += `_${inner}`;
      subscripted = true;
      continue;
    }

    const atom = readAtom(cursor);
    if (!atom.ok) return atom;
    tex += atom.tex;
    subscripted = false;
  }

  return { ok: true, tex };
}

/**
 * `$…$` の中身を読み直して、組み直した TeX を返す。
 * 返るのは `$…$` を含まない中身だけ (囲むのは呼ぶ側の仕事)。
 */
export function mathLabelTex(inner: string): MathLabel {
  if (inner === '') return fail('$ の中身がありません');

  const cursor: Cursor = { text: inner, index: 0 };
  const read = readSequence(cursor, false);
  if (!read.ok) return read;
  if (cursor.index < inner.length) return fail(`${inner[cursor.index]} は書けません`);

  return read;
}
