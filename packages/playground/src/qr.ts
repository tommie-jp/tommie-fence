import qrcode from 'qrcode-generator';

/**
 * この頁の URL を入れた QR。**スマホで開き直すための道**
 * (実機で「クリックするとページの URL を埋め込んだ QR コードを表示する」)。
 *
 * 共有リンクは本文を base64 で `#` に載せるので長くなる。手で打ち直せる長さでは
 * ないから、画面に出して読ませるのがいちばん短い道になる。
 *
 * **符号を自分で書かない。** Reed-Solomon と型の選び方を持つのは
 * `qrcode-generator` (MIT、依存なし) で、ビルド時に束ねる — 頁から外へ
 * 取りに行くものは増やさない。
 */

/** 誤り訂正の強さ。**M** — 画面に出した図をカメラで読むには十分で、型が小さく済む。 */
const LEVEL = 'M';

/**
 * URL が長すぎて QR に入らないときのため、**型は自動**にする (`0`)。
 * それでも入らなければ投げてくるので、呼ぶ側が断りを出す。
 */
const AUTO = 0;

/** 1 升の辺 (px)。**4 以上**あればスマホのカメラが読める。 */
const CELL = 4;

/** 静かな縁 (升の数)。**4 升**が規格の下限で、これを削ると読めなくなる。 */
const QUIET = 4;

/**
 * URL 1 つを QR の SVG にする。読めない長さなら null
 * (図を出さないだけで、頁はそのまま動く)。
 */
export function qrSvg(url: string): string | null {
  try {
    const code = qrcode(AUTO, LEVEL);
    code.addData(url);
    code.make();

    const count = code.getModuleCount();
    const side = (count + QUIET * 2) * CELL;
    const dark: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (!code.isDark(row, col)) continue;
        dark.push(`M${(col + QUIET) * CELL} ${(row + QUIET) * CELL}h${CELL}v${CELL}h-${CELL}z`);
      }
    }
    // **地は白で塗る。** 暗い配色の頁でも、QR は白地に黒でないと読めない。
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"`
      + ` viewBox="0 0 ${side} ${side}" role="img" aria-label="この頁の QR コード">`
      + `<rect width="${side}" height="${side}" fill="#ffffff"/>`
      + `<path d="${dark.join('')}" fill="#000000"/></svg>`;
  } catch {
    return null;
  }
}
