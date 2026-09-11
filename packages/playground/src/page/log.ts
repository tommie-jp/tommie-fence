import { els } from './els.ts';

/**
 * 何が起きたかを言う口。**出来事は 1 か所を通す** (52 の docs/45) —
 * 帯の一言 (2 秒で消える) とログ (最後の 20 行) の両方がここから出る。
 * 別の口を作ると、呼び忘れた出来事だけがログに出ない。
 */

const LOG_ROWS = 20;
const log: { readonly at: string; readonly text: string; readonly bad: boolean }[] = [];

const clock = (): string => new Date().toTimeString().slice(0, 5);

/** しくじりの理由を字にする。 */
export const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** ログを組み直す。**新しいものが上**。 */
export function renderLog(): void {
  els.logRows.replaceChildren();
  if (log.length === 0) {
    const none = document.createElement('li');
    none.className = 'none';
    none.textContent = 'まだ何も起きていません';
    els.logRows.append(none);
    return;
  }
  for (const row of [...log].reverse()) {
    const line = document.createElement('li');
    // **しくじりは赤で。** 並んだ記録の中から、目で拾えるようにする。
    if (row.bad) line.className = 'bad';
    const at = document.createElement('time');
    at.textContent = row.at;
    line.append(at, row.text);
    els.logRows.append(line);
  }
}

/**
 * 記録だけ足す (帯には出さない)。マップの帯へ出た一言もここへ落とす。
 * **残すのは最後の 20 行**で、読み込み直すと消える (文書は外のファイルなので、
 * そちらを見れば分かる)。
 */
export function note(text: string, bad = false): void {
  log.push({ at: clock(), text, bad });
  if (log.length > LOG_ROWS) log.shift();
  renderLog();
}

/** 帯に出す。`holds` を立てると消えない。 */
function show(text: string, holds: boolean): void {
  els.said.textContent = text;
  if (holds) return;
  window.setTimeout(() => {
    if (els.said.textContent === text) els.said.textContent = '';
  }, 2_000);
}

/**
 * 帯に一言。**`holds` を立てると消えない** — 読めなかったリンクの断りは、
 * 2 秒で消すと「別の図が出ている」ことに気づけないまま終わる。
 */
export function say(text: string, holds = false): void {
  note(text);
  show(text, holds);
}

/** しくじりを出す先 (マップの帯)。マップが開いているあいだだけある。 */
let sink: ((text: string) => void) | null = null;

/** しくじりをマップの帯へも出すようにする。null で外す。 */
export function warnTo(next: ((text: string) => void) | null): void {
  sink = next;
}

/**
 * しくじりを言う。**ログに赤で残し、マップの帯にも出す** (実機で頼まれた)。
 *
 * 帯の一言 (`say`) には出さない — 長い断りを入れると、畳んだ姿の 1 行の帯が
 * 崩れて釦が押しのけられる (実機で踏んだ)。読む場所は**残る所**にまとめる。
 * マップを開いていないときだけ、頁の側の帯に出す (そちらは畳まれていない)。
 */
export function warn(text: string): void {
  note(text, true);
  // 帯へ出すときも**ログには 1 度しか書かない** (`say` を通すと 2 行並ぶ)。
  if (sink !== null) sink(text);
  else show(text, true);
}
