# Spectrum Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```spectrum ` フェンス (YAML) を **スペクトラムアナライザの画面** —
FFT 型 (Analog Discovery の Spectrum) か掃引型 (tinySA) — として描くライブラリと CLI。
VS Code では拡張 `tommie-fence` の中で動く。

## 何のためか

スペアナで測る実験のノートには、**測る前に「こう見えるはず」の画面**が要る。
信号を波形発生器の設定と同じ語 (`square 100MHz -10dBm`) で、計器をメニューの語
(`rbw: 300kHz`、`atten: 20dB`) で書けば、フェンスが線・受信機のノイズフロア・
マーカーの読み値を計算する。

```yaml
title: 図1 NanoVNA の出力の高調波
device: tinysa-ultra          # 必須。計器の型で計算の仕方が変わる
sweep: 0-960M 450
rbw: 300kHz
ref: -10dBm
signal: square 100MHz -10dBm
markers: [100M, 300M, 500M]
```

## CLI

```bash
npx spectrum-fence check notes/            # 読めたか・読み値を確かめる (書き出さない)
npx spectrum-fence render notes/ --out out # SVG を書き出す
```

`check` はマーカーの読み値を字で出す。**図を見る前に数で突き合わせる**。

## ライセンス

MIT
