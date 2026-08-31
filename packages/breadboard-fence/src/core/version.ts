/**
 * この処理系の版。**構文と処理系に同じ番号**を振る (回路図フェンスと同じ方針)。
 * 「どの版の文法で書いた図か」と「どの版が描いた図か」を別々に覚えずに済む。
 *
 * `package.json` と食い違わないことはテストで見張る。ビルド時に差し込む形にすると、
 * コアを直に import する側 (テストや他アプリのサーバー側描画) で値が入らない。
 */
export const VERSION = '0.3.0';

/** 図の右下に刻む字。`style: stamp: on` のときだけ出る。 */
export const stampText = (): string => `breadboard-fence ${VERSION}`;
