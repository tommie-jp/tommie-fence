/**
 * 図の隅に刻む字と、CLI の `--version` が答える字。
 *
 * **名前まで書く。** 番号だけでは、何の `0.1.0` なのかが図から離れると分からない。
 * 3 つのフェンスが同じ形で刻むので、綴りの作り方はここ 1 か所に置く
 * (以前は circuit が定数、breadboard が関数、perfboard は書き出しの中に
 * 直書き、と 3 通りに分かれていた)。
 *
 * **版そのものは各パッケージが持つ。** core は Node を使えず `package.json` を
 * 読めないので、写しを定数で持つほかない (各パッケージの `core/version.ts`)。
 */
export const stampText = (name: string, version: string): string => `${name} ${version}`;
