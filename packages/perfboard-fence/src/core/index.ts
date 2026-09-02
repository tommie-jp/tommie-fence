import { element, normalizeNewlines, num } from 'fence-kit';
import { attachSourceText } from './errors.ts';
import { createLayout } from './model/layout.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';
import { renderBoard } from './render/board.ts';
import { renderSlots } from './render/slots.ts';
import { renderJoints } from './render/joints.ts';
import { renderParts } from './render/parts.ts';
import { renderDeviceWires, renderWires } from './render/wires.ts';
import { renderTitle } from './render/title.ts';
import { renderNotes } from './render/notes.ts';
import { renderSourceListing, sourceBandSize, sourceListing } from './render/sourceListing.ts';
import { backSideLayout, renderBackSide } from './render/backSide.ts';
import { deviceOverhang, layoutDevices, renderDevices } from './render/devices.ts';
import { netlistOf, resolveWires } from './wiring/wiring.ts';
import { checkErc } from './erc/erc.ts';
import { checkFit } from './placement/collide.ts';
import { drawnExtent } from './placement/geometry.ts';
import { holeStrip } from './model/board.ts';
import { parseAddress } from './model/address.ts';
import { offBoardReason } from './model/board.ts';
import { fenceError, notice, safeToken } from './errors.ts';
import { renderDocument } from './render/document.ts';
import { renderErrorBanner, renderErrorCard } from './render/errorHtml.ts';
import { resolveStyle, themeForBoard } from './render/theme.ts';
import type { Address, FenceError, ResolvedNote } from './types.ts';
import type { Net } from 'fence-kit';

/** 行の無いものを先に、あとは行の順に。同じ行なら見つけた順を保つ。 */
const byLine = (errors: readonly FenceError[]): FenceError[] =>
  [...errors].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

export type RenderResult = {
  /**
   * それ自体で完結した SVG。外部リソースもスクリプトも参照しない。
   * **図が 1 つも組めなかったときは空文字列**で、言うことは `errorHtml` に入る。
   */
  readonly svg: string;
  /**
   * 穴と配線から導いたネットリスト。意図した回路との突き合わせに使える。
   * svg と違い**エスケープしていない生のデータ**なので、画面に出す側で必ず
   * エスケープすること。
   */
  readonly netlist: readonly Net[];
  /** 読めなかったところ。行番号と、行の中身と、綴りを指す印を持つ。 */
  readonly errors: readonly FenceError[];
  /** 読めてはいるが、思ったとおりには出ないところ。 */
  readonly notices: readonly FenceError[];
  /**
   * 図の下に貼る帯 (図は描けた) か、カード (読めなかった) の HTML。
   * 言うことが無ければ空文字列。**図の SVG には何も書き込まない**ので、
   * 書き出した SVG を貼ったときに報告が付いてこない。
   */
  readonly errorHtml: string;
};

/**
 * フェンスの中身 1 つを図に変換する。DOM も Node も使わない同期の純関数なので、
 * VS Code のプレビュー・CLI・サーバー側描画のどこからでも同じように呼べる。
 *
 * **Phase 6 まで。** 板・穴・2 本足の部品・配線を描き、ネットリストを導き、
 * ERC と当たり判定をかけ、題を付けて書き出す。3 本足・DIP、注釈は次 (52 の docs/05)。
 */
export function renderPerfboard(input: string): RenderResult {
  // 外から来た字は、読む前に改行を揃える。行数は変わらないので行番号はそのまま。
  const source = normalizeNewlines(input);
  const parsed = parseFence(source);

  if (!parsed.doc) {
    // **お知らせは図が出せないときも硬いエラーにしない。** 混ぜると CLI の
    // 終了コードとカードの色分けが、直さなくても図が出るものを壊れ扱いする。
    const reported = attachSourceText(parsed.errors, source);
    const errors = reported.filter((error) => error.notice !== true);
    const notices = reported.filter((error) => error.notice === true);
    return { svg: '', netlist: [], errors, notices, errorHtml: renderErrorCard([...errors, ...notices]) };
  }

  const { board, title } = parsed.doc;
  const style = resolveStyle(parsed.doc.style);
  const THEME = style.theme;
  // 板・ランド・スロットの色は**板の性質**。板の側を描くものにだけ渡す
  // (題や書き出しは紙の上の字なので、板の色に引きずられない)。
  const PLATE = themeForBoard(parsed.doc.board, THEME);
  const { devices } = parsed.doc;

  // 書き出し (`- source`) は板の上に置かないので、帯の分だけ画布を伸ばす。
  // **図を組む前に測る** — 帯の大きさが決まらないと板の置き場所も決まらない。
  const sourceNotes = parsed.doc.notes.filter((note) => note.kind === 'source');
  const listing = sourceNotes.length > 0 ? sourceListing(source) : [];
  // 半田面は自分の寸法を持つので、**先に測ってから**表の図に場所を空けさせる。
  const back = style.back ? backSideLayout(board, style.labels) : null;
  // 番地で置いた機器のはみ出しを**先に測る**。板の寸法だけで組むと、
  // 上は題に、下は書き出しや半田面に重なる。
  const overhang = deviceOverhang(devices, createLayout(board, { title: title !== null }));
  const layout = createLayout(board, {
    title: title !== null,
    // 帯を空けるのは、番地で置いていない機器のぶんだけ。
    deviceTop: devices.some((device) => device.where === null && device.at === 'top'),
    deviceBottom: devices.some((device) => device.where === null && device.at === 'bottom'),
    source: listing.length > 0 ? sourceBandSize(listing, THEME) : null,
    back: back === null ? null : { height: back.height },
    labelRight: style.labels.sides.includes('right'),
    labelBottom: style.labels.sides.includes('bottom'),
    deviceAbove: overhang.above,
    deviceBelow: overhang.below,
  });
  const placedDevices = layoutDevices(devices, layout);
  const devicePins = new Map(devices.map((device) => [device.id, new Set(device.pins)]));
  const placement = placeParts(parsed.doc.parts, board);

  const pointErrors: FenceError[] = [];
  const points = new Map<string, Address>();
  const named: [Address, string][] = [];
  for (const { name, written, line } of parsed.doc.points) {
    const address = parseAddress(written);
    const reason = address === null
      ? `穴の番地として読めません: ${safeToken(written)}`
      : offBoardReason(board, address);
    if (address === null || reason !== null) {
      pointErrors.push(fenceError(reason ?? '', line, written));
      continue;
    }
    points.set(name, address);
    named.push([address, name]);
  }

  // 注釈は回路の一員ではないので、読めなくても図は出る。
  const noteErrors: FenceError[] = [];
  const notes: ResolvedNote[] = [];
  for (const note of parsed.doc.notes) {
    // 書き出しは板の外に出すので、指し先の番地を持たない。帯は別に描く。
    if (note.kind === 'source') continue;
    const from = parseAddress(note.from ?? '');
    const to = note.to === null ? null : parseAddress(note.to);
    // 見るのは書かれた番地だけ (`to` を書かない印では `from` 1 つ)。
    const written = note.to === null ? [from] : [from, to];
    const offBoard = written.some((address) => address === null || offBoardReason(board, address) !== null);
    if (from === null || offBoard) {
      noteErrors.push(fenceError(
        `注釈の番地を板に置けません: ${safeToken(note.to === null ? note.from ?? '' : `${note.from} ${note.to}`)}`,
        note.line,
      ));
      continue;
    }
    notes.push({ kind: note.kind, from, to, color: note.color, text: note.text });
  }

  // **同じ書き出しを 2 枚重ねない。** 2 つ目を書いた人には、消えたのではなく
  // 1 つしか描かないことを言う (黙って捨てると、色を書き直したつもりが効かない)。
  for (const extra of sourceNotes.slice(1)) {
    noteErrors.push(notice('書き出し (source) は 1 つだけ描きます (後のものは描いていません)', extra.line));
  }

  const wiring = resolveWires(parsed.doc.wires, points, board, devicePins);
  const netlist = netlistOf(placement.parts, wiring.wires, named, devices, wiring.deviceLinks);

  // **読めなかったところがあるうちは ERC を掛けない。** 落ちた配線を勘定に
  // 入れないまま「つながっていません」と言うと、**書いた配線について書き忘れを
  // 指摘する**ことになる。掛けなかったことは黙らずに言う。
  const hardErrors = [...parsed.errors, ...pointErrors, ...placement.errors, ...wiring.errors]
    .filter((error) => error.notice !== true);
  // **`erc: off` は「伏せる」ではなく「見ない」。** 書いた人が外したのだから、
  // 外したことをこちらから言い足さない (`debug: off` との違いは文法の説明に書く)。
  const erc = !style.check
    ? []
    : hardErrors.length > 0
    ? [notice('読めなかったところがあるので ERC と当たり判定は掛けていません (直すと掛かります)', null)]
    : [
      ...checkErc({
        parts: placement.parts,
        wires: wiring.wires,
        netlist,
        namedStrips: new Set(named.map(([address]) => holeStrip(address))),
        devices,
      }),
      ...checkFit(placement.parts, layout),
    ];

  // **画布からはみ出す部品ぶん、画布を広げる。** 端面実装のコネクタは板の外へ
  // 張り出すので、板の寸法だけで画布を決めると図が黙って切れる。
  // **半田付けする穴。** 足が入った穴と、配線が来た穴のどちらも埋まる。
  // 埋めた穴と空いた穴が同じ形だと、どこを付けるのか図から読めない。
  const soldered = [
    ...placement.parts.flatMap((part) => part.pins.map((pin) => pin.address)),
    ...wiring.wires.flatMap((wire) => [wire.from, wire.to]),
    ...wiring.deviceWires.map((wire) => wire.hole),
  ];

  // 配線や注釈も板の外を指せるので、部品の胴と一緒に見る。
  const pointsOn = (on: typeof layout) => [
    ...wiring.wires.flatMap((wire) => [on.point(wire.from), on.point(wire.to)]),
    ...notes.flatMap((note) => (note.to === null
      ? [on.point(note.from)]
      : [on.point(note.from), on.point(note.to)])),
  ];
  // 機器の箱も数える。**番地で置いた機器は帯の外**へ出るので、板の寸法だけでは
  // 画布が足りない (黙って切れる)。
  const deviceCorners = placedDevices.placed.flatMap(({ box }) => [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y + box.height + 14 },
  ]);
  const front = drawnExtent(placement.parts, layout, [...pointsOn(layout), ...deviceCorners]);
  // **半田面も数える。** 裏返すと張り出す向きが逆になるので、表だけ見て決めると
  // 裏の板でコネクタが切れる。
  const behind = back === null || layout.backTop === null
    ? null
    : drawnExtent(placement.parts, back, pointsOn(back));
  const shifted = behind === null || layout.backTop === null ? null : {
    minX: behind.minX,
    maxX: behind.maxX,
    minY: behind.minY + layout.backTop,
    maxY: behind.maxY + layout.backTop,
  };
  const extent = front === null || shifted === null
    ? front ?? shifted
    : {
      minX: Math.min(front.minX, shifted.minX),
      maxX: Math.max(front.maxX, shifted.maxX),
      minY: Math.min(front.minY, shifted.minY),
      maxY: Math.max(front.maxY, shifted.maxY),
    };
  // 線の太さと印の丸のぶんを見込む (端がちょうど画布の縁に来ると欠ける)。
  const OVERHANG_MARGIN = 12;
  const spillLeft = extent === null ? 0 : Math.max(0, OVERHANG_MARGIN - extent.minX);
  const spillTop = extent === null ? 0 : Math.max(0, OVERHANG_MARGIN - extent.minY);
  const spillRight = extent === null ? 0 : Math.max(0, extent.maxX + OVERHANG_MARGIN - layout.width);
  const spillBottom = extent === null ? 0 : Math.max(0, extent.maxY + OVERHANG_MARGIN - layout.height);
  const spilled = spillLeft > 0 || spillTop > 0 || spillRight > 0 || spillBottom > 0;

  // 配線は板の上、部品の下。線が部品の胴を隠すと、何が載っているか読めなくなる。
  const drawn = renderTitle(title, layout, THEME)
      + renderBoard(board, layout, PLATE, style.labels)
      // スロット用の銅箔は板の上、配線の下。**挿す穴ではない**ので、
      // 部品や線に隠れても困らない。
      + renderSlots(board, layout, PLATE)
      // 半田付けした穴。**配線と部品の前に敷く** — 線の先が半田の玉に入って
      // 見えるほうが、実物の見た目に近い。
      + renderJoints(soldered, layout, PLATE)
      + renderWires(wiring.wires, layout, PLATE)
      // 機器へつなぐ線も板の上まで引く。**どの穴へ行くのかが図に出ないと、
      // 帯に浮いた箱と板が結び付かない。**
      + renderDeviceWires(wiring.deviceWires, placedDevices.placed, layout, THEME)
      + renderDevices(placedDevices.placed, THEME)
      + renderParts(placement.parts, layout, PLATE)
      // 注釈は一番上。**指したものが下に隠れると印の意味が無くなる。**
      + renderNotes(notes, layout, PLATE)
      // 書き出しは板の外の帯。図とは重ならないので、順番はどこでもよい。
      + (layout.sourceBand === null
        ? ''
        : renderSourceListing(listing, layout.sourceBand, THEME, sourceNotes[0]?.color ?? null))
      // 半田面は板のすぐ下。裏返すのは板 (列の並び) だけで、字はそのまま。
      + (back === null || layout.backTop === null
        ? ''
        : renderBackSide(
          board,
          back,
          { wires: wiring.wires, parts: placement.parts, soldered },
          PLATE,
          style.labels,
          layout.backTop,
        ));

  const svg = renderDocument(
    layout,
    spilled
      ? element('g', { transform: `translate(${num(spillLeft)} ${num(spillTop)})` }, drawn)
      : drawn,
    {
      theme: THEME,
      width: style.width,
      stamp: style.stamp,
      canvas: spilled
        ? { width: layout.width + spillLeft + spillRight, height: layout.height + spillTop + spillBottom }
        : null,
    },
  );

  // **行順に並べる。** 段ごとに集めた順のままだと、帯の打ち切り (8 件) で
  // 後ろの段の報告から先に消え、行を追って直せなくなる。
  const collected = [
    ...parsed.errors, ...pointErrors, ...placement.errors, ...wiring.errors, ...noteErrors,
    ...placedDevices.notices, ...erc,
  ];
  const reported = attachSourceText(byLine(collected), source);
  const errors = reported.filter((error) => error.notice !== true);
  const notices = reported.filter((error) => error.notice === true);
  // **帯は読めなかったものを先に。** ERC のお知らせは足 1 本につき 1 件出るので、
  // 行順のまま並べると打ち切りで**直さないと図が出ないほうが消える**。
  //
  // `style: debug: off` で伏せられるのは**お知らせだけ**。読めなかった行は
  // この切り替えの対象ではない (伏せると「無かったこと」に化ける)。
  const shown = style.debug ? [...errors, ...notices] : errors;
  return { svg, netlist, errors, notices, errorHtml: renderErrorBanner(shown) };
}

export { extractPerfboardFences } from './fences.ts';
export type { FenceBlock } from './fences.ts';
export type { FenceError } from './types.ts';
export type { Net } from 'fence-kit';
export { errorText } from './render/errorText.ts';
export { VERSION } from './version.ts';
