# Graph Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```graph ` フェンス (YAML) を**教科書の x-y グラフ** — 周波数応答 (共振曲線・ボード線図) と
特性曲線 (I-V・リアクタンス) — として描くライブラリ + CLI。VS Code では拡張 `tommie-fence` の中で動く。

![共振曲線 — 15.9 kHz で山になり、輪の抵抗が小さいほど高い](examples/out/00-resonance.png)

## 何のためか

実験の手引きには「読めるはずの値」の表があり、読者はそれを片対数の方眼紙にグラフで描く。
曲線を式か表の点で書けばフェンスが描き、測った値の CSV を指せば上に重ねる。`mark` の所の値は
字で出るので、本文の数と図が食い違わない。

```yaml
title: 図3 RC ローパス — −3 dB の所が −45°
x: 周波数 Hz log 100..100k           # 名前 単位 [log] [範囲]。範囲の区切りは ..
y:
  - 利得 dB
  - 位相 deg
lines:
  利得 dB: 20*log10(1/sqrt(1+(x/1.59k)^2))   # キーの最後の語が単位
  位相 deg: -deg(atan(x/1.59k))
data: 5-1.csv                        # 測った点 (.md の隣) → ○
notes:
  - level -3dB
  - mark 1.59k
```

- **線**は `x` (横軸の値。接頭辞 `1.59k` `25.9m` `10M` は倍率) の式か、1 行 1 点の点列 (`- 2k 0.38`)。理想は破線
- **単位が枠を分ける**: 単位の違う線は、横軸を共有して縦に積んだ枠に置く (3 つまで)。軸の名札は「量/単位」
- 範囲を省くと**大きさの量は 0 から**。dB と deg は値を包む
- **測った値** (`data:`) は **Markdown と同じ場所の CSV だけ**を読み、○ で打って線で結ばない。
  列は単位と名前で線に当たる。core はファイルを開かず、読むのは宿主
- **mark と peak の読み値**を図の下に出す (`1.59 kHz  −3.01 dB  −45.0°`)
- **式は小さな再帰下降で読む** (`eval` は使わない)

## 兄弟との違い

| | 描くもの | 何から |
| --- | --- | --- |
| [scope-fence](../scope-fence/) | オシロの画面 (時間) | 波 + 操作、WaveForms の CSV |
| [spectrum-fence](../spectrum-fence/) | スペクトラムの画面 (周波数) | 波と受信機、測った CSV |
| [vna-fence](../vna-fence/) | VNA の画面 (周波数) | 模型と Touchstone |
| graph-fence | **教科書のグラフ** | **式と点列、測った CSV** |

計器の画面を見せる題は scope・spectrum・vna、値を集めて描く題は graph。
ネットリストも ERC も、部品を掴んで動かすマップも無い。

## 使い方

文法の全部は [docs/01-syntax.md](docs/01-syntax.md)、1 画面の早見表は
[docs/02-cheatsheet.md](docs/02-cheatsheet.md)、例は [examples/](examples/README.md)。

```bash
npx graph-fence check notes/            # 読めたか、読み値はいくつか (何も書かない)
npx graph-fence render notes/ --out out # SVG を書き出す
```

`check` は読み値 (mark と peak) を字で出す。**図を見る前に数を合わせる。**

npm には出していない。Release の tgz を `file:` で指す。
ライブラリの入口は `graph-fence/core` (`renderGraph` / `extractGraphFences`)。

## ライセンス

MIT
