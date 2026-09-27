# わざと読めなく書いた例

どのフェンスも、読めない所を言う。図は読めた所まで描く。

device: が無い (計算の道が決まらない):

```spectrum
title: 図01 device が無い
sweep: 0-960M 450
signal: square 100MHz -10dBm
```

FFT 型の ad2 に rbw: (掃引型だけのキー) と、単位の無い数:

```spectrum
title: 図02 型に無いキーと単位の無い数
device: ad2
sweep: 0-20kHz
rbw: 1kHz
signal: sine 1000 1
```

signal: に操作 (scope の物) と、5 つ目のマーカー:

```spectrum
title: 図03 操作つきの signal と 5 つ目のマーカー
device: tinysa-ultra
sweep: 0-100M 101
rbw: 300kHz
signal: square 1MHz -10dBm | rc 1us
markers: [1M, 3M, 5M, 7M, 9M]
```
