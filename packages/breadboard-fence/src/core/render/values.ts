/**
 * 抵抗値の読みとカラーコードは fence-kit にある。
 * **実物の部品の話で盤面に依らない**ので、perfboard も同じものを使う。
 * 呼び出し側を変えないよう、ここは名前をそのまま通すだけの包み。
 */
export { capacitorCode, parseOhms, parsePicofarads, parseResistor, resistorBands } from 'fence-kit';
