import { fail, fenceError, ok, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { addressHint, formatAddress, isSameAddress, parseAddress } from '../model/address.ts';
import type { Address, WireOperator } from '../model/address.ts';
import {
  DEFAULT_NOTE_ALIGN, DEFAULT_NOTE_SIZE, NOTE_ALIGNS, NOTE_BOX_SOLID, NOTE_COLOR_NAMES,
  NOTE_KINDS, NOTE_LEADINGS, NOTE_SIZE_NAMES, isNoteAlign, isNoteLeading, isNoteSize, noteColor,
} from '../notes.ts';
import type { NoteAlign, NoteLeading, NoteSize } from '../notes.ts';
import { closestPartType, lookupPartType, partTypeNames, resolvePartTypeName } from '../parts.ts';
import type { PartTypeName } from '../parts.ts';
import { isNoteDrawable } from '../tex/escape.ts';
import type { Endpoint, FenceError, NoteSpec, NoteTextStyle, PartSpec, Result, WireSpec } from '../types.ts';

/** 配線の演算子。TikZ と同じ 3 つだけ (学習コストを増やさない)。 */
const WIRE_OPERATOR = /\s*(--|-\||\|-)\s*/;

const typeList = (): string => partTypeNames().join(' / ');

/** `U1.out` `Q1.B` の形。部品 ID と足の名前を分ける。 */
const PIN_REFERENCE = /^([\w-]+)\.([^\s.]+)$/;

/** 書ける向き。今のところオペアンプの ± の上下だけ。 */
export const ORIENTATIONS = ['+up', '+down'] as const;

/**
 * 番地に付けた名前 (`points:`) の表。番地が書ける場所ならどこでも引く。
 * 名前が無いフェンスでは空の表が渡る (呼ぶ側で場合分けしない)。
 */
export type Points = ReadonlyMap<string, Address>;

export const NO_POINTS: Points = new Map();

/**
 * 番地を読む。**名前を先に引き、無ければ番地として読む**。
 * 名前には番地の形を許していない (parseFence) ので、どちらとも読める字はない。
 */
const readAddress = (token: string, line: number, points: Points = NO_POINTS): Result<Address> => {
  const named = points.get(token);
  if (named !== undefined) return ok(named);

  const address = parseAddress(token);
  if (address !== null) return ok(address);

  return fail(addressProblem(token, points), line, token);
};

/**
 * 番地として読めなかった綴りへの返事。**近い書き間違いには直せる形を先に返す**
 * (`a1.5` → `a_1.5`)。番地の形ですらないなら、書ける範囲を添える。
 */
function addressProblem(token: string, points: Points): string {
  const near = addressHint(token);
  if (near !== null) return `${safeToken(token)} は番地の形ではありません (${near})`;

  // 名前のつもりで書かれた可能性がある。名前を 1 つでも書いてある図では、
  // そちらの案内も添える。
  const form = `行 a〜z + 列 1〜${LIMITS.columns}。交点の間は a_1.5 / a.5_1.5`;
  const hint = points.size === 0 ? form : `${form}。points: に書いた名前でもありません`;
  return `${safeToken(token)} は番地の形ではありません (${hint})`;
}

/**
 * 読み取り中の 1 行の頭。種類は正式名に畳んであり、`written` だけが
 * 書かれた綴り (略記のことがある) を覚えている。
 * エラー文には `written` を出す — 書いた行と照らせないと行番号が生きない。
 */
type PartHead = {
  readonly id: string;
  readonly type: PartTypeName;
  readonly written: string;
  readonly line: number;
  readonly points: Points;
};

/**
 * `resistor a1 a3 10k` の 1 行を読む。略記 (`r a1 a3 10k`) もここで受ける。
 * 両端が斜めでも通す (circuitikz は任意の角度に引ける)。同じ番地どうしだけは
 * 向きも長さも決まらないので通さない。
 */
export function parseCompactPart(
  id: string,
  text: string,
  line: number,
  points: Points = NO_POINTS,
): Result<PartSpec> {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  const [written, ...rest] = tokens;

  if (written === undefined) {
    return fail(`部品 ${safeToken(id)} の種類がありません (${typeList()} が使えます)`, line);
  }

  // 略記はここで正式名に畳む。以降と中間モデルには正式名だけが流れる。
  const typeName = resolvePartTypeName(written);
  const type = typeName === null ? null : lookupPartType(typeName);
  if (typeName === null || type === null) {
    // 種類が増えるほど羅列は読みにくいので、近いものがあればそれだけを添える。
    const closest = closestPartType(written);
    const hint = closest === null ? `${typeList()} が使えます` : `${closest} のことですか?`;
    return fail(`種類 ${safeToken(written)} は知りません (${hint})`, line, written);
  }

  const head: PartHead = { id, type: typeName, written, line, points };
  if (type.kind === 'two-terminal') return readTwoTerminal(head, rest);
  return type.kind === 'one-terminal' ? readOneTerminal(head, rest) : readMultiTerminal(head, rest);
}

/**
 * `Q1: npn d8 2SC1815` / `U1: opamp c5 +up` の形。
 * 番地のあとに来るのは向きか値。向きは決まった語なので見分けられる。
 */
function readMultiTerminal(head: PartHead, rest: string[]): Result<PartSpec> {
  const { id, type, written, line, points } = head;
  const shape = `${safeToken(written)} は「種類 番地 [向き] [型番]」で書きます`;

  const [atToken, ...extra] = rest;
  if (atToken === undefined) return fail(shape, line);

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  let orientation: string | null = null;
  let value: string | null = null;

  for (const token of extra) {
    if ((ORIENTATIONS as readonly string[]).includes(token)) {
      orientation = token;
      continue;
    }
    if (value !== null) return fail(shape, line);
    if ([...token].length > LIMITS.valueLength) {
      return fail(`値が長すぎます (${LIMITS.valueLength} 文字まで)`, line);
    }
    value = token;
  }

  return ok({ kind: 'multi-terminal', id, type, at: at.value, value, orientation, line });
}

/**
 * 番地のあとに書ける `キー=字` の札。値と違って順番を決めない
 * (見た目の語を順不同で読むのと同じ。書き手が並びを覚えなくてよい)。
 */
const PART_TAGS = { i: '電流', v: '電圧', l: 'ラベル' } as const;
type PartTag = keyof typeof PART_TAGS;

/**
 * 矢を返す形 (`i<=` `v<=`)。**極性のある部品のための逃げ道**で、
 * 向きのない部品では番地を入れ替えるほうを使う (綴りを 1 つに保つ)。
 * 極性のある部品は番地の順が極性で決まるので、入れ替えでは返せない。
 */
const REVERSED = '<';

const tagList = (): string =>
  Object.entries(PART_TAGS)
    .map(([key, name]) => `${key}= ${name}`)
    .join(' と ');

const isPartTag = (key: string): key is PartTag => Object.hasOwn(PART_TAGS, key);

function readTwoTerminal(head: PartHead, rest: string[]): Result<PartSpec> {
  const { id, type, written, line, points } = head;
  const [fromToken, toToken, ...extra] = rest;

  if (fromToken === undefined || toToken === undefined) {
    return fail(`${safeToken(written)} は「種類 番地 番地 [値] [l=字] [i=字] [v=字]」で書きます`, line);
  }

  const from = readAddress(fromToken, line, points);
  if (!from.ok) return from;
  const to = readAddress(toToken, line, points);
  if (!to.ok) return to;

  if (isSameAddress(from.value, to.value)) {
    return fail(`${safeToken(written)} の両端が同じ番地です (${formatAddress(from.value)})`, line);
  }

  const tags: { -readonly [K in PartTag]: string | null } = { i: null, v: null, l: null };
  const reversed: { -readonly [K in PartTag]: boolean } = { i: false, v: false, l: false };
  let value: string | null = null;

  for (const token of extra) {
    // `=` を含む札は先に拾う。値には `=` を書けない (circuitikz がオプションの
    // 区切りとして読むため) ので、値と札が紛れることはない。
    const at = token.indexOf('=');
    if (at < 0) {
      if (value !== null) {
        return fail(`${safeToken(written)} は「種類 番地 番地 [値] [l=字] [i=字] [v=字]」で書きます`, line);
      }
      const checked = checkLabelLength(token, '値', line);
      if (checked !== null) return checked;
      value = token;
      continue;
    }

    const tag = token.slice(0, at);
    const label = token.slice(at + 1);
    // 末尾の `<` は「矢を返す」印。ラベル (`l=`) には向きが無いので付けられない。
    const back = tag.endsWith(REVERSED) && tag !== 'l<';
    const key = back ? tag.slice(0, -1) : tag;
    if (!isPartTag(key)) {
      // `=` は safeToken が落とす字なので、鍵だけ通して等号は外で足す。
      return fail(`${safeToken(tag)}= は知りません (${tagList()} が使えます)`, line, token);
    }
    if (tags[key] !== null) return fail(`${key}= を 2 回書いています`, line);
    if (label === '') return fail(`${key}= の字がありません`, line);
    const checked = checkLabelLength(label, `${key}= の字`, line);
    if (checked !== null) return checked;
    tags[key] = label;
    reversed[key] = back;
  }

  // 値・電流・電圧は circuitikz が図の同じ側に出す (実機で確認)。
  // 重ねて描くと字が潰れるので、書けた行のまま黙って壊さずに理由を返す。
  if (tags.v !== null && (value !== null || tags.i !== null)) {
    const other = value !== null ? '値' : 'i= の字';
    return fail(`v= の字と${other}は図の同じ側に出ます (どちらか片方にしてください)`, line);
  }

  return ok({
    kind: 'two-terminal',
    id,
    type,
    from: from.value,
    to: to.value,
    value,
    current: tags.i,
    currentReversed: reversed.i,
    voltage: tags.v,
    voltageReversed: reversed.v,
    label: tags.l,
    line,
  });
}

/** 図に出る字の長さは値と同じ上限で見る (組み方が同じなので、はみ出し方も同じ)。 */
function checkLabelLength(text: string, subject: string, line: number): Result<PartSpec> | null {
  return [...text].length > LIMITS.valueLength
    ? fail(`${subject}が長すぎます (${LIMITS.valueLength} 文字まで)`, line)
    : null;
}

function readOneTerminal(head: PartHead, rest: string[]): Result<PartSpec> {
  const { id, type, written, line, points } = head;
  const [atToken, ...extra] = rest;

  if (atToken === undefined || extra.length > 0) {
    return fail(`${safeToken(written)} は「種類 番地」で書きます`, line);
  }

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  return ok({ kind: 'one-terminal', id, type, at: at.value, line });
}

/** 配線 1 行の書き方。端点はいくつ並べてもよい。 */
const WIRE_FORM = '「端点 -- 端点 [-- 端点 …]」';

/**
 * `a3 -- a4` や `b1 -- b3 |- U1.+` の 1 行を読む。演算子は TikZ と同じ 3 つ。
 *
 * - `--` まっすぐ。端点が揃っていなくてもそのまま斜めに引く (勝手に折らない)
 * - `-|` 先に横、それから縦
 * - `|-` 先に縦、それから横
 *
 * 端点は 3 つ以上並べられる。1 行が 1 本の信号経路として読めるようにするための
 * 書き方で、**ここで隣どうしの 1 区間ずつに開いて返す**。中間モデルから先は
 * 区間の並びしか見ないので、黒丸も T 字もネットリストもそのまま使える。
 * どの区間も行番号は書かれた 1 行のまま (折り返した先を指しても直しに行けない)。
 */
export function parseWireLine(
  text: string,
  line: number,
  points: Points = NO_POINTS,
): Result<readonly WireSpec[]> {
  // 端点 n 個と演算子 n-1 個が交互に並ぶので、割った結果は必ず奇数長になる。
  const tokens = text.trim().split(WIRE_OPERATOR);
  if (tokens.length < 3 || tokens.length % 2 === 0) {
    return fail(`配線は ${WIRE_FORM} で書きます`, line);
  }

  const endpoints: Endpoint[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index] ?? '';
    // 端点を書き忘れた (`a1 -- a3 --`)。空の字を「番地の形ではありません」と
    // 返しても、どこが空なのか読めない。書き方のほうを返す。
    if (token.length === 0) return fail(`配線は ${WIRE_FORM} で書きます`, line);

    const endpoint = readEndpoint(token, line, points);
    if (!endpoint.ok) return endpoint;
    endpoints.push(endpoint.value);
  }

  const wires: WireSpec[] = [];
  for (const [index, from] of endpoints.slice(0, -1).entries()) {
    const to = endpoints[index + 1];
    const operator = tokens[index * 2 + 1];
    if (to === undefined || operator === undefined) continue;

    if (from.kind === 'cell' && to.kind === 'cell' && isSameAddress(from.address, to.address)) {
      return fail(`配線の両端が同じ番地です (${formatAddress(from.address)})`, line);
    }
    wires.push({ from, to, operator: operator as WireOperator, line });
  }

  return ok(wires);
}

/**
 * 配線の端。`a3` のような番地か、`U1.out` のような足。
 *
 * **番地として読める綴りは番地**。交点の間の番地 (`a_1.5`) は足と同じく `.` を
 * 含むが、足の綴りに `_` の区切りは無いので、取り違えは起きない
 * (`U1.5` は番地の形ではないので、これまでどおり DIP の 5 番ピンのまま)。
 */
function readEndpoint(token: string, line: number, points: Points): Result<Endpoint> {
  const named = points.get(token);
  if (named !== undefined) return ok({ kind: 'cell', address: named });

  const address = parseAddress(token);
  if (address !== null) return ok({ kind: 'cell', address });

  const pin = PIN_REFERENCE.exec(token);
  if (pin) {
    const [, part = '', name = ''] = pin;
    return ok({ kind: 'pin', part, pin: name });
  }

  // ここまで来た綴りは番地でも足でもない。案内だけを返す
  // (番地としての読み直しは済んでいる)。
  return fail(addressProblem(token, points), line, token);
}

/** 印の既定の色。目立たせるために書くものなので、書かなければ赤。 */
const DEFAULT_MARK_COLOR = 'red';

/** 太字にする語。大きさや寄せと違って 1 語しかないので、表を持たない。 */
const BOLD_WORD = 'bold';

/** 注釈の字に使える字。escape.ts の関門と対にして書く (片方だけ増やさない)。 */
const NOTE_CHARSET = '英数字と . + - / ( ) _ % : 、日本語、µ Ω °';

/**
 * 字は YAML の値として書く。**フェンスの側で引用符を決めない**のは、
 * YAML のプレーンスカラーに `: ` を書けないため (`- text b1 "R1: resistor"` は
 * 黙ってマップになり、エラーにもならない)。値にすれば引用は YAML の仕事になる。
 */
const TEXT_FORM = '「- text 番地 [色や大きさ]: 文字」';
const CIRCLE_FORM = '「- circle 部品IDか番地 [色]」';
const BOX_FORM = '「- box 番地 番地 [色]」';
const ARROW_FORM = '「- arrow 起点 終点 [色]」';
const LINE_FORM = '「- line 起点 終点 [色]」';
const SOURCE_FORM = '「- source 番地 [色や大きさ]」';

/** 字を持たない注釈の書き方。`:` を書いてしまった人に、正しい形を返すのに使う。 */
const LINE_FORMS: Readonly<Record<string, string>> = {
  circle: CIRCLE_FORM,
  box: BOX_FORM,
  arrow: ARROW_FORM,
  source: SOURCE_FORM,
};

/**
 * その種類の書き方。**自分の持ちものだけ**を見る。素の `[名前]` で引くと
 * `toString` のような Object.prototype の名前が当たり、書き方でない値を
 * そのまま図の下の帯に出してしまう。
 */
const lineFormOf = (kind: string): string | null =>
  Object.hasOwn(LINE_FORMS, kind) ? (LINE_FORMS[kind] ?? null) : null;

const noteKindList = (): string => NOTE_KINDS.join(' / ');

/**
 * 字に添えられる語ぜんぶ。知らない語を返すときの案内に使う。
 * 行送りは書き出しにしか効かないので、**そこに書けるときだけ**添える
 * (どこでも並べると、字の注釈で書いて効かない語を勧めることになる)。
 */
const wordHint = (forSource: boolean): string =>
  `色: ${NOTE_COLOR_NAMES.join(' / ')}、` +
  `大きさ: ${NOTE_SIZE_NAMES.join(' / ')}、` +
  `寄せ: ${NOTE_ALIGNS.join(' / ')}、太字: ${BOLD_WORD}` +
  (forSource ? `、行送り: ${NOTE_LEADINGS.join(' / ')}` : '');

/** 行送りの語を書ける場所。効かないところに書かれたら、これを添えて返す。 */
const LEADING_BELONGS = `書き出し (source) にだけ書けます`;

const readNoteColor = (token: string, line: number): Result<string> =>
  noteColor(token) === null
    ? fail(`注釈の色 ${safeToken(token)} は知りません (${NOTE_COLOR_NAMES.join(' / ')} が使えます)`, line, token)
    : ok(token);

const writtenTwice = (what: string, first: string, second: string, line: number): FenceError =>
  fenceError(
    `注釈の${what}が二重に書かれています (${safeToken(first)} と ${safeToken(second)})`,
    line,
    null,
    // 指すのは**後に書いたほう**。同じ語を 2 度書いたときだけ先のほうに立つが、
    // どちらを消しても直るので迷わせない。
    second,
  );

/** 注釈に添えられた語ぜんぶ。行送りは書き出しにしか無いので、字の見た目と分けて返す。 */
type NoteWords = {
  readonly style: NoteTextStyle;
  readonly leading: NoteLeading | null;
};

/**
 * 字に添えられた語を読む。**語ごとに読む場所を決めない**ので、
 * 色・大きさ・寄せ・太字・行送りをどの順に書いてもよい
 * (書き手が順を覚えなくて済む)。
 *
 * 二重に書かれたら理由を返す。後に書いたほうを黙って勝たせると、
 * 直したつもりの指定が効かない図が出る (約束 5)。
 */
function readNoteWords(tokens: readonly string[], line: number, forSource: boolean): Result<NoteWords> {
  let color: string | null = null;
  let size: NoteSize | null = null;
  let align: NoteAlign | null = null;
  let bold = false;
  let leading: NoteLeading | null = null;

  for (const token of tokens) {
    if (noteColor(token) !== null) {
      if (color !== null) return { ok: false, error: writtenTwice('色', color, token, line) };
      color = token;
    } else if (isNoteSize(token)) {
      if (size !== null) return { ok: false, error: writtenTwice('大きさ', size, token, line) };
      size = token;
    } else if (isNoteAlign(token)) {
      if (align !== null) return { ok: false, error: writtenTwice('寄せ', align, token, line) };
      align = token;
    } else if (token === BOLD_WORD) {
      if (bold) return { ok: false, error: writtenTwice('太字', BOLD_WORD, token, line) };
      bold = true;
    } else if (isNoteLeading(token)) {
      if (!forSource) return fail(`${safeToken(token)} は${LEADING_BELONGS}`, line, token);
      if (leading !== null) return { ok: false, error: writtenTwice('行送り', leading, token, line) };
      leading = token;
    } else {
      return fail(`注釈の言葉 ${safeToken(token)} は知りません (${wordHint(forSource)} が使えます)`, line, token);
    }
  }

  return {
    ok: true,
    value: {
      style: { color, size: size ?? DEFAULT_NOTE_SIZE, align: align ?? DEFAULT_NOTE_ALIGN, bold },
      leading,
    },
  };
}

/**
 * `circle R1 red` の 1 行を読む (`notes:` に文字列で並べた項目)。
 * 指し先が部品 ID か番地かはここでは決めない (部品の表を持っていないため)。
 */
export function parseNoteLine(
  text: string,
  line: number,
  points: Points = NO_POINTS,
): Result<NoteSpec> {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  const [kind, ...rest] = tokens;

  if (kind === undefined) return fail(`注釈の種類がありません (${noteKindList()} が使えます)`, line);
  if (kind === 'text') return fail(`text は ${TEXT_FORM} で書きます (文字は YAML の値にします)`, line);

  switch (kind) {
    case 'circle':
      return readCircleNote(rest, line);
    case 'box':
      return readBoxNote(rest, line, points);
    case 'arrow':
      return readArrowNote(rest, line);
    case 'line':
      return readLineNote(rest, line);
    case 'source':
      return readSourceNote(rest, line, points);
    default:
      return fail(`注釈の種類 ${safeToken(kind)} は知りません (${noteKindList()} が使えます)`, line, kind);
  }
}

/** 印に書けるのは指し先と色だけ。字の言葉を書いても効かないので、形を示して返す。 */
function readMarkColor(token: string | undefined, form: string, line: number): Result<string> {
  if (token === undefined) return ok(DEFAULT_MARK_COLOR);
  if (isNoteLeading(token)) {
    return fail(`${form} で書きます (${safeToken(token)} は${LEADING_BELONGS})`, line, token);
  }
  if (isNoteSize(token) || isNoteAlign(token) || token === BOLD_WORD) {
    return fail(`${form} で書きます (${safeToken(token)} は字の注釈にだけ書けます)`, line, token);
  }
  if (token === NOTE_BOX_SOLID) {
    return fail(`${form} で書きます (${safeToken(token)} は枠 (box) にだけ書けます)`, line, token);
  }
  return readNoteColor(token, line);
}

function readCircleNote(rest: readonly string[], line: number): Result<NoteSpec> {
  const [target, colorToken, ...extra] = rest;
  if (target === undefined || extra.length > 0) return fail(`circle は ${CIRCLE_FORM} で書きます`, line);
  if (!isNoteTarget(target)) return fail(notReferenceable(target), line, target);

  const color = readMarkColor(colorToken, `circle は ${CIRCLE_FORM}`, line);
  return color.ok ? ok({ kind: 'circle', target, color: color.value, line }) : color;
}

/**
 * `box a1 c3 blue` を読む。2 つの番地が枠の対角になる。
 * 同じ番地を 2 回書くのは書き間違いではない (1 マスだけを囲むということ)。
 */
function readBoxNote(rest: readonly string[], line: number, points: Points): Result<NoteSpec> {
  const [fromToken, toToken, ...words] = rest;
  if (fromToken === undefined || toToken === undefined || words.length > 2) {
    return fail(`box は ${BOX_FORM} で書きます`, line);
  }

  const from = readAddress(fromToken, line, points);
  if (!from.ok) return from;
  const to = readAddress(toToken, line, points);
  if (!to.ok) return to;

  // 色と線の引き方は**順不同**。見た目の語をどこでも順不同で読むのと同じ。
  const solid = words.includes(NOTE_BOX_SOLID);
  const colorToken = words.find((word) => word !== NOTE_BOX_SOLID);
  const color = readMarkColor(colorToken, `box は ${BOX_FORM}`, line);
  return color.ok
    ? ok({ kind: 'box', from: from.value, to: to.value, color: color.value, solid, line })
    : color;
}

/**
 * `arrow a5 R1 blue` を読む。両端とも部品 ID か番地で、
 * どちらかはここでは決めない (印と同じ扱い)。
 */
function readArrowNote(rest: readonly string[], line: number): Result<NoteSpec> {
  const [fromToken, toToken, colorToken, ...extra] = rest;
  if (fromToken === undefined || toToken === undefined || extra.length > 0) {
    return fail(`arrow は ${ARROW_FORM} で書きます`, line);
  }
  if (!isNoteTarget(fromToken)) return fail(notReferenceable(fromToken), line, fromToken);
  if (!isNoteTarget(toToken)) return fail(notReferenceable(toToken), line, toToken);

  const color = readMarkColor(colorToken, `arrow は ${ARROW_FORM}`, line);
  return color.ok ? ok({ kind: 'arrow', from: fromToken, to: toToken, color: color.value, line }) : color;
}

/** `line a1 a5 ink` を読む。指し棒と同じ形で、矢が付かないだけ。 */
function readLineNote(rest: readonly string[], line: number): Result<NoteSpec> {
  const [fromToken, toToken, colorToken, ...extra] = rest;
  if (fromToken === undefined || toToken === undefined || extra.length > 0) {
    return fail(`line は ${LINE_FORM} で書きます`, line);
  }
  if (!isNoteTarget(fromToken)) return fail(notReferenceable(fromToken), line, fromToken);
  if (!isNoteTarget(toToken)) return fail(notReferenceable(toToken), line, toToken);

  const color = readMarkColor(colorToken, `line は ${LINE_FORM}`, line);
  return color.ok ? ok({ kind: 'line', from: fromToken, to: toToken, color: color.value, line }) : color;
}

/**
 * 印と指し棒の指し先になれる綴りか。**部品 ID か番地**のどちらか。
 * 交点の間の番地 (`a_1.5`) は `.` を含むので、部品 ID の字種だけでは足りない。
 */
const isNoteTarget = (token: string): boolean => isReferenceable(token) || parseAddress(token) !== null;

const notReferenceable = (token: string): string =>
  `${safeToken(token)} は部品 ID にも番地にもなりません`
  + ` (部品 ID は英数字と _ - だけの ${LIMITS.idLength} 文字まで、番地は a1 / a_1.5)`;

/**
 * `source a6 blue tiny` を読む。中身はフェンス自身から作るので、
 * ここでは場所と見た目だけ。見た目の言葉は字の注釈と同じものが使える。
 */
function readSourceNote(rest: readonly string[], line: number, points: Points): Result<NoteSpec> {
  const [atToken, ...words] = rest;
  if (atToken === undefined) return fail(`source は ${SOURCE_FORM} で書きます`, line);

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  const looks = readNoteWords(words, line, true);
  if (!looks.ok) return looks;

  const { style, leading } = looks.value;
  return ok({ kind: 'source', at: at.value, ...style, leading, line });
}

/**
 * `text b1 blue: ここで分圧する` を読む。`head` が `:` の左、`body` が右。
 * 字は的を問わず日本語まで通す (フェンスでは TeX に渡さないため。escape.ts)。
 */
export function parseNoteText(
  head: string,
  body: string,
  line: number,
  points: Points = NO_POINTS,
): Result<NoteSpec> {
  const tokens = head.trim().split(/\s+/).filter((token) => token.length > 0);
  const [kind, atToken, ...words] = tokens;

  if (kind !== 'text') {
    // `- box a1: c3` は YAML がマップとして読む。知っている種類なのに
    // 「種類を知りません」と返すと、直すのは種類ではないのに種類を疑わせる。
    const form = kind === undefined ? null : lineFormOf(kind);
    return form === null
      ? fail(`注釈の種類 ${safeToken(kind ?? '')} は知りません (${noteKindList()} が使えます)`, line, kind)
      : fail(`${kind} は ${form} の 1 行で書きます (文字は付きません)`, line);
  }
  if (atToken === undefined) return fail(`text は ${TEXT_FORM} で書きます`, line);

  const at = readAddress(atToken, line, points);
  if (!at.ok) return at;

  if (body.trim().length === 0) return fail(`注釈の文字がありません (${TEXT_FORM} で書きます)`, line);
  if ([...body].length > LIMITS.noteLength) {
    return fail(`注釈の文字が長すぎます (${LIMITS.noteLength} 文字まで)`, line);
  }
  if (!isNoteDrawable(body)) {
    return fail(`注釈の文字に使えない文字があります (${NOTE_CHARSET} が使えます)`, line);
  }

  const looks = readNoteWords(words, line, false);
  return looks.ok ? ok({ kind: 'text', at: at.value, text: body, ...looks.value.style, line }) : looks;
}
