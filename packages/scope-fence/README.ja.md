# Scope Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```scope ` フェンス (YAML) を **オシロスコープの画面** — 時間波形・
トリガ・カーソル・Measurements — として描くライブラリと CLI。VS Code では拡張
`tommie-fence` の中で動く。

![RC の充電 — 入力と C の電圧をカーソルで読む](examples/out/00-rc-charging-3.png)

## 何のためか

オシロで測る実験のノートには、**測る前に「こう見えるはず」の画面**と、
**測った後の画面**が要る。画面写しは測った後にしか無い。計器の設定の表と同じ語
(`square 100Hz 1V offset 1V`、`1ms/div`) で理想の波を書けばフェンスが波形を計算し、
WaveForms から書き出した CSV を指せば実測が重なる。

```yaml
title: 図3 RC の充電 — 見えるはずの画面
time: 1ms/div
trigger: ch1 rising 1V
ch1: square 100Hz 1V offset 1V     # 波形発生器の波 → 破線
ch2: ch1 | rc 1ms                  # ch1 を τ = 1 ms の RC に通した波
data: 5-1-rc.csv                   # 測った値 (.md の隣) → 実線
cursors: [0, 1ms]
measure: [vpp, freq]
```

- **波**は波形発生器の語 (`sine` `square` `triangle` `sawtooth` `pulse` `dc`)。振幅は
  peak (`2Vpp` `0.707Vrms` `-10dBm` とも書ける)、`offset` `phase` `duty` は順不同
- **操作** (`| rc 1ms`、`| clip -0.7V 0.7V`、`| offset` `| gain` `| abs`) で、前の ch を
  回路に通した波を作る。RC の充電・整流と平滑・クリッパとクランパが書ける
- **測った値** (`data:`) は WaveForms の Scope の Export (CSV / TXT)。
  **Markdown と同じ場所のファイルだけ**。core はファイルを開かず、宿主が読む
- **カーソルと Measurements** の読み値は図の下に WaveForms の書式で出る
  (`Vpp 2.00 V`、`Freq 100.0 Hz`)。実測があれば実測から
- **単位の無い数は断る** (`sine 1000 1` は 1 kHz か、1 V か 1 Vpp か決まらない)

## 兄弟との違い

| | 描くもの | 元になるもの |
| --- | --- | --- |
| [vna-fence](../vna-fence/) | VNA の画面 (周波数) | 模型と Touchstone |
| scope-fence | **オシロの画面 (時間)** | **波 + 操作と、WaveForms の CSV** |
| [spectrum-fence](../spectrum-fence/) | スペクトラムの画面 (周波数) | 波と受信機、測った CSV |

波の書き方は spectrum と同じ。ネットリスト・ERC・掴んで動かすマップは無い。

## 使い方

文法の全部は [docs/01-syntax.md](docs/01-syntax.md)、1 画面の早見表は
[docs/02-cheatsheet.md](docs/02-cheatsheet.md)、例は [examples/](examples/README.md)。

```bash
npx scope-fence check notes/            # 読めたか・読み値を確かめる (書き出さない)
npx scope-fence render notes/ --out out # SVG を書き出す
```

`check` は読み値 (Measurements とカーソル) を字で出す。**図を見る前に数で突き合わせる**。

npm には無い。Release の tgz を `file:` で指す。
ライブラリの入口は `scope-fence/core` (`renderScope` / `extractScopeFences`)。

## ライセンス

MIT
