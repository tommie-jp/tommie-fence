/**
 * 部品と配線の色は fence-kit にある。**実物の色そのもの**なので盤面に依らず、
 * perfboard も同じものを使う (テーマで塗り替えると図が嘘になるので、
 * 板や印字の配色 = `theme.ts` の Palette とは別のまま)。
 * 呼び出し側を変えないよう、ここは名前をそのまま通すだけの包み。
 */
export {
  BAND_COLORS,
  DEFAULT_LED_COLOR,
  DEFAULT_WIRE_COLOR,
  LED_COLORS,
  WIRE_COLORS,
  bandColor,
  ledColor,
  wireColor,
  wireColorNames,
} from 'fence-kit';
