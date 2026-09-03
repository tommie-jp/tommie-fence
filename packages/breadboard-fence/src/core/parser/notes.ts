import { fail, ok, safeToken } from '../errors.ts';
import { LIMITS, clampText, isReferenceable } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import {
  DEFAULT_MARK_COLOR, DEFAULT_PLACE, NOTE_ALIGNS, NOTE_COLORS, NOTE_KINDS, NOTE_LEADINGS, NOTE_MIRROR_WORD,
  NOTE_PLACES, NOTE_SIZES, PLACEABLE_KINDS, isNoteRotation, noteRotationOf, noteTargetCount,
} from '../notes.ts';
import type {
  NoteAlign, NoteColor, NoteKind, NoteLeading, NotePlace, NoteSize, NoteTurn,
} from '../notes.ts';
import type { NoteSpec, Result } from '../types.ts';


/** その種類が受け取れる語。ここに無い語を書いたら、黙って捨てずに報告する。 */
type WordSlot = 'color' | 'size' | 'align' | 'bold' | 'solid' | 'leading' | 'rotate' | 'mirror';

const SLOTS: Record<NoteKind, readonly WordSlot[]> = {
  circle: ['color'],
  box: ['color', 'solid'],
  arrow: ['color'],
  line: ['color'],
  // **向きは字だけ。** 印や枠には表と裏が無い。語彙は部品と揃える。
  text: ['color', 'size', 'align', 'bold', 'rotate', 'mirror'],
  source: ['color', 'size', 'align', 'bold', 'leading'],
};

const SLOT_NAMES: Record<WordSlot, string> = {
  color: '色', size: '大きさ', align: '寄せ', bold: '太字', solid: '実線', leading: '行送り',
  rotate: '向き', mirror: '反転',
};

const isKind = (word: string): word is NoteKind => (NOTE_KINDS as readonly string[]).includes(word);

/** 語 → どの枠に入るか。順不同に書けるので、語のほうから枠を決める。 */
function slotOf(word: string): WordSlot | null {
  if ((NOTE_COLORS as readonly string[]).includes(word)) return 'color';
  if ((NOTE_SIZES as readonly string[]).includes(word)) return 'size';
  if ((NOTE_ALIGNS as readonly string[]).includes(word)) return 'align';
  if ((NOTE_LEADINGS as readonly string[]).includes(word)) return 'leading';
  if (word === 'bold') return 'bold';
  if (word === 'solid') return 'solid';
  if (isNoteRotation(word)) return 'rotate';
  if (word === NOTE_MIRROR_WORD) return 'mirror';
  return null;
}

/** 指し先として書ける形か。部品があるか・穴が板の中かは、あとで図を組むときに見る。 */
const isNoteTarget = (token: string): boolean => parseAddress(token) !== null || isReferenceable(token);

const isPlace = (token: string): token is NotePlace => (NOTE_PLACES as readonly string[]).includes(token);

/**
 * 注釈 1 つを読む。
 *
 *   - circle R1 red
 *   - box a5 e12 blue solid
 *   - arrow a5 R1
 *   - text a5 blue large: ここで分圧する
 *   - source a20 tiny tight
 *
 * `text` だけは**字を YAML の値の側に置く**ので、`head` (キー) と `text` (値) に
 * 分かれて渡ってくる。`- text a5 "R1: resistor …"` と書けないのは YAML の都合で、
 * プレーンスカラーに `: ` を書くとマップになってしまうため。値の側に置けば、
 * 引用が要るかどうかを YAML 自身に決めさせられる。
 */
export function parseNoteLine(head: string, text: string | null, line: number): Result<NoteSpec> {
  const tokens = head.trim().split(/\s+/).filter(Boolean);
  const [kindToken, ...rest] = tokens;
  if (!kindToken || !isKind(kindToken)) {
    return fail(
      `知らない注釈です: ${safeToken(kindToken ?? '')} (${NOTE_KINDS.join(' / ')} が使えます)`,
      line,
    );
  }
  const kind = kindToken;

  if (kind === 'text' && text === null) {
    return fail('text は「- text 番地 [語]: 字」の形で、字を : の後ろに書きます', line);
  }
  if (kind !== 'text' && text !== null) {
    return fail(`${kind} に字は書けません (字を置くのは text です)`, line);
  }

  // 字を置く種類は、番地の代わりに場所を書ける。**どちらも書かなければ場所の既定**。
  // 見た目の語 (`tiny` など) が先頭に来たときは場所ではなく語として読む
  // (語の並びは閉じているので、ここで割り切れる)。
  const placeable = PLACEABLE_KINDS.has(kind);
  const first = rest[0];
  const placed = placeable && (first === undefined || isPlace(first) || slotOf(first) !== null);
  if (!placeable && first !== undefined && isPlace(first)) {
    return fail(`${kind} に ${first} は書けません (字を図の外に置けるのは text と source です)`, line, first);
  }

  const wanted = placed ? 0 : noteTargetCount(kind);
  const targets = rest.slice(0, wanted);
  if (targets.length !== wanted) {
    return fail(`${kind} は指し先を ${wanted} つ書きます (今は ${targets.length} つ)`, line);
  }
  for (const target of targets) {
    if (!isNoteTarget(target)) {
      return fail(`注釈の指し先として読めません: ${safeToken(target)} (部品 ID か穴番地を書きます)`, line, target);
    }
  }

  // 場所の語そのものは、読んだら語の並びから外す。
  const tail = rest.slice(wanted);
  const words = readWords(kind, first !== undefined && isPlace(first) ? tail.slice(1) : tail, line);
  if (!words.ok) return words;

  return ok({
    kind,
    targets,
    place: placed ? DEFAULT_PLACE : null,
    // 印は赤が既定。字だけは既定を置かず、図の文字色にそのまま従わせる。
    color: words.value.color ?? (kind === 'text' || kind === 'source' ? null : DEFAULT_MARK_COLOR),
    size: words.value.size,
    align: words.value.align,
    turn: { rotate: words.value.rotate, mirror: words.value.mirror },
    bold: words.value.bold,
    solid: words.value.solid,
    leading: words.value.leading,
    text: text === null ? null : clampText(text, LIMITS.noteLength),
    line,
  });
}

type Words = {
  color: NoteColor | null;
  size: NoteSize | null;
  align: NoteAlign | null;
  bold: boolean;
  solid: boolean;
  leading: NoteLeading | null;
  /** 字の向き。**時計回り**の角度で、語は部品と同じ (`r90` / `r180` / `r270`)。 */
  rotate: NoteTurn['rotate'];
  /** 字を指し先の反対側へ移すか (`mirror`)。**鏡文字にはしない** — 読めなくなる。 */
  mirror: boolean;
};

/**
 * 見た目の語を読む。**順不同**で、同じ枠に 2 回書いたら後勝ちにせず報告する
 * (`red blue` と書いた人は、どちらが効くかを当てにできない)。
 */
function readWords(kind: NoteKind, tokens: readonly string[], line: number): Result<Words> {
  const words: Words = {
    color: null, size: null, align: null, bold: false, solid: false, leading: null,
    rotate: 0, mirror: false,
  };
  const filled = new Set<WordSlot>();
  const allowed = SLOTS[kind];

  for (const token of tokens) {
    const slot = slotOf(token);
    if (slot === null) {
      // 番地や ID がここに来たということは、指し先を書きすぎている。
      // 「知らない語です」より、数のほうを言ったほうが直す場所が分かる。
      if (isNoteTarget(token)) {
        return fail(`${kind} は指し先を ${noteTargetCount(kind)} つ書きます (${safeToken(token)} が余っています)`, line);
      }
      return fail(`注釈の知らない語です: ${safeToken(token)}`, line, token);
    }
    if (!allowed.includes(slot)) {
      return fail(`${kind} に ${token} は書けません (書けるのは ${allowed.map((s) => SLOT_NAMES[s]).join(' / ')})`, line);
    }
    if (filled.has(slot)) {
      return fail(`注釈の ${SLOT_NAMES[slot]} が 2 回書かれています: ${safeToken(token)}`, line);
    }
    filled.add(slot);

    if (slot === 'color') words.color = token as NoteColor;
    else if (slot === 'size') words.size = token as NoteSize;
    else if (slot === 'align') words.align = token as NoteAlign;
    else if (slot === 'leading') words.leading = token as NoteLeading;
    else if (slot === 'bold') words.bold = true;
    else if (slot === 'rotate') words.rotate = noteRotationOf(token) ?? 0;
    else if (slot === 'mirror') words.mirror = true;
    else words.solid = true;
  }

  return ok(words);
}
