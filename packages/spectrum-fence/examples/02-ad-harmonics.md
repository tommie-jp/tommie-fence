# 方形波の高調波 — Analog Discovery の Spectrum

Wavegen の 1 kHz・1 V の方形波を Scope の CH1 に繋ぎ、Spectrum で 0〜20 kHz を見る
(AD の 4-2)。FFT 型でも縦軸は既定で dBm (50 Ω の電力。dBV にするなら `unit: dBV`)、分解能は 20 kHz × 2.56 ÷ 8192 = 6.25 Hz。

```spectrum
title: 図01 1 kHz の方形波 — 奇数次の高調波
device: ad2
sweep: 0-20kHz
samples: 8192
window: hann
signal: square 1kHz 1V
markers:
  - 1kHz
  - 3kHz
  - 5kHz
  - 7kHz
```

![図01 1 kHz の方形波 — 奇数次の高調波](out/02-ad-harmonics.svg)

読み方:

- 基本波は peak 4/π V = 0.900 V rms = **+12.10 dBm** (−0.91 dBV)。3 次は 1/3 で +2.56 dBm、
  5 次 −1.88 dBm、7 次 −4.80 dBm
- 偶数次が無いのは duty 50% の方形波だから (`duty 25%` にすると偶数次も立つ)
