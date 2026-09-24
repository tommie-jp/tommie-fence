# Copper Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```copper ` フェンス (YAML) を、**銅張り基板の寸法図**として描く
ライブラリ + CLI。マイクロストリップ・コプレーナ (CPW / CPWG)・Manhattan の島を、
手で切る・剥がす・貼るための図にする。VS Code では拡張 `tommie-fence` の中で動く。

![50Ω のスルー線路](examples/out/00-through.png)

## 何を目指しているか

NanoVNA で GHz の治具を作るとき、銅張り基板に**何 mm の線路を、どこに残すか**を
実験ノートの中に書けるようにする。線路の幅から**Z0 を出して図に添える**ので、
「FR4 1.6mm で 50Ω の幅を計算して作る」がそのまま図のキャプションになる。

```yaml
board: 40x20mm
f: 2.4G
copper:
  L1: line 0,10 40,10 3.06
parts:
  J1: sma left 10 CH0
  J2: sma right 10 CH1
  C1: capacitor/1608 20,10 10p
```

- 位置は **mm の `x,y`** (板の左上から)。格子の無い板なので、文字の番地は振らない。
  板の上と左の目盛と 1mm の方眼で、図から寸法を読んで切れる
- 線路は**縦横の折れ線と幅**。字に**幅・Z0・電気長**が出る (`L1 3.06mm 50.0Ω 210°`)。
  式は Hammerstad-Jensen (マイクロストリップ) と、完全楕円積分の CPW / CPWG
- **線路の上に置いたチップは線路を切る** — 実物もカッターで切って半田付けする。
  切れ目を別に書かせないので、部品と切れ目が食い違わない
- 端面 SMA は**辺と位置**で置く (`sma left 10`)。中心導体が線路に乗り、外皮は地へ
- 導出するのは**ネットリスト** (触れ合う銅は 1 つのネット) と **ERC** — 銅に乗って
  いない足、切れ目の無いチップ、SMA の芯が表の地に触れる、手で切れない細さ
- 面実装の寸法は perfboard と同じ表 (fence-kit) から引く。**綴りも perfboard と同じ**

## 姉妹パッケージとの違い

| | 描くもの | 位置 | 導通 |
| --- | --- | --- | --- |
| [circuit-fence](../circuit-fence/) | 回路図 | 番地 | — |
| [breadboard-fence](../breadboard-fence/) | ブレッドボード | 穴の番地 | 列の 5 穴がつながる |
| [perfboard-fence](../perfboard-fence/) | ユニバーサル基板 | 穴の番地 | 全穴独立。配線でつなぐ |
| copper-fence | 銅張り基板 | **mm** | **銅の形そのもの** (触れ合う形は 1 つ) |

言語は別、作法は同じ (YAML をホストにしたフェンス、Markdown の行番号とその行の
中身で返るエラー、同じ縮尺 2.54mm = 20px)。

## 使い方

文法の全部は [docs/01-syntax.md](docs/01-syntax.md)、治具 1 つずつの例は
[examples/](examples/README.md)。

```bash
npx copper-fence check  doc.md             # 読めたか・つながったか (ネットリストと ERC)
npx copper-fence render doc.md --out out   # SVG を書き出す
```

Release の tgz を `file:` で指して使う (npm レジストリには出していない)。
ライブラリの出口は `copper-fence/core` (`renderCopper` / `extractCopperFences`)。

## ライセンス

MIT
