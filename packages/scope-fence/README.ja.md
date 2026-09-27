# Scope Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```scope ` フェンス (YAML) を **オシロスコープの画面** — 時間波形・
トリガ・カーソル・Measurements — として描くライブラリと CLI。VS Code では拡張
`tommie-fence` の中で動く。

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
cursors: [0, 1ms]
measure: [vpp, freq]
```

## CLI

```bash
npx scope-fence check notes/            # 読めたか・読み値を確かめる (書き出さない)
npx scope-fence render notes/ --out out # SVG を書き出す
```

`check` は読み値 (Measurements とカーソル) を字で出す。**図を見る前に数で突き合わせる**。

## ライセンス

MIT
