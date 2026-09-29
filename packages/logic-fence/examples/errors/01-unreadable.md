# 読めなかったときに何が出るか

読めなかった行は図の下の帯に、**行番号と、その行の中身と、綴りを指す印**つきで
出る。格子は必ず描く (読めた所まで)。

device: が無く、時間軸も無い。

```logic
title: 図01 device と時間軸が無い
signals:
  CLK: clock 1Hz
```

知らない種類と、単位の無い数。

```logic
title: 図02 知らない種類と単位の無い数
device: ad3
time: 1s/div
signals:
  A: dio0 sqare 1Hz
  B: dio1 clock 1000
```

counter の元が後ろに書いてある (前に書いたレーンだけ)、バスのレーンが無い。

```logic
title: 図03 つながらない counter とバス
device: ad3
time: 1s/div
signals:
  A: dio1..dio2 counter on CLK rising
  CLK: dio1 clock 1Hz
buses:
  Data: D1 D0 hex
```

3 つ目のカーソルと、time: と window: の両方。

```logic
title: 図04 カーソルは 2 つまで
device: ad3
time: 1s/div
window: 10s
signals:
  CLK: clock 1Hz
cursors: [1s, 2s, 3s]
```
