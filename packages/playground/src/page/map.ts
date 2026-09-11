import type { MapHandle } from '../map/index.ts';
import { els } from './els.ts';
import { note, reason, warn, warnTo } from './log.ts';
import { showMarkdown } from './markdown.ts';
import { changed, ws } from './workspace.ts';

/**
 * 図を掴んで動かすマップ。**拡張と同じ殻**を iframe の中で動かす。
 * **頁は editor から始まる**ので、開いたら閉じない (52 の docs/48)。
 */

let map: MapHandle | null = null;

/** 本文が外で変わったときに、マップを組み直す (まだ無ければ何もしない)。 */
export const refreshMap = (): void => map?.refresh();

/**
 * マップを開く。一式は `import()` で別のかたまりにしてある — とはいえ
 * 重い中身 (3 つの editor) は描画と共有していて最初から読んであり、
 * ここで取りに行くのは殻の入口の数 KB だけ (実測)。
 */
export async function showMap(): Promise<void> {
  let openMap: typeof import('../map/index.ts').openMap;
  try {
    ({ openMap } = await import('../map/index.ts'));
  } catch (error) {
    // **黙って空の枠にしない。** 頁の主役が出ないので、何が起きたかを残し
    // (電波が切れて束が取れなかった、など)、字と図の窓を開いて、直す道を残す。
    warn(`図を掴む editor を開けませんでした: ${reason(error)} (Markdown の窓で直せます)`);
    showMarkdown();
    return;
  }

  map = openMap({
    frame: els.map,
    text: ws.text,
    // **殻が書き換えたのは文書の全文。** 数え直して、いまのフェンスを描く。
    // どこが変わったかは、窓を開いたときのために控えておく。
    // **マップは組み直さない** — 殻がした書き換えなので、殻はもう知っている。
    setText: (next) => {
      ws.replace(next);
      changed('replace');
    },
    fenceLine: () => ws.current()?.line ?? 0,
    // 殻が中の帯へ出す一言も記録する (「R1 を a7 へ動かしました」など)。
    // **帯には出さない** — マップは自分の帯に出しているので、二重になる。
    onStatus: note,
    // 殻の一覧で選び直されたら、頁の側も揃える。**組み直しは頼まない** —
    // 殻はもうそのフェンスを見ているので、呼ぶと堂々巡りになる。
    onBind: (line) => {
      if (ws.bind(line)) changed('bind');
    },
  });
  // しくじりはマップの帯にも出す (実機で頼まれた)。
  warnTo((text) => map?.notice(text));
}
