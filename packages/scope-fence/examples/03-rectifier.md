# 整流と平滑

50 Hz、10 V の正弦を整流する。ダイオードの順電圧 (0.7 V) は `offset -0.7V` で引く。

半波整流: 負の側を切る (`clip 0V` は下だけを切る)。

```scope
title: 図01 半波整流
time: 5ms/div
trigger: ch1 rising
ch1: sine 50Hz 10V
ch2: ch1 | clip 0.7V | offset -0.7V
measure: [vmax, avg, rms]
```

![図01 半波整流](out/03-rectifier-1.svg)

全波整流 (ブリッジ): 絶対値からダイオード 2 本ぶん (1.4 V) を引く。

```scope
title: 図02 全波整流
time: 5ms/div
trigger: ch1 rising
ch1: sine 50Hz 10V
ch2: ch1 | abs | clip 1.4V | offset -1.4V
measure: [vmax, avg, rms]
```

![図02 全波整流](out/03-rectifier-2.svg)

平滑: 全波整流の後ろに τ = 10 ms の RC を置いた目安 (`| rc 10ms`)。実際の平滑コンデンサは
充電が速く放電が遅いが、ここでは 1 次の RC で形だけを見る。CH2 と CH3 は**同じ V/div と基準**に
揃えて重ねる (Auto のままだと CH3 はリプルだけを拡大して 0 V が画面の外に出る)。

```scope
title: 図03 全波整流の後ろに RC
time: 5ms/div
trigger: ch1 rising
ch1: sine 50Hz 10V
ch2: {wave: ch1 | abs | clip 1.4V | offset -1.4V, range: 2V/div, position: -2div}
ch3: {wave: ch2 | rc 10ms, range: 2V/div, position: -2div}
measure: [vmax, vmin, avg]
```

![図03 全波整流の後ろに RC](out/03-rectifier-3.svg)
