/**
 * 字の幅の見積もりと切り詰めは fence-kit にある。
 * **盤面に依らない**ので perfboard も同じものを使う。
 * 呼び出し側を変えないよう、ここは名前をそのまま通すだけの包み。
 */
export { fit, textWidth } from 'fence-kit';
