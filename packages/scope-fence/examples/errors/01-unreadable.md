# 読めなかったときに何が出るか

読めなかった行は図の下の帯に、**行番号と、その行の中身と、綴りを指す印**つきで
出る。格子は必ず描く (読めた所まで)。

単位の無い数。`1000` は 1 kHz か 1000 Hz か、`1` は 1 V か 1 Vpp か、道具は決めない。

```scope
time: 1ms/div
ch1: sine 1000 1
```

知らない波。

```scope
time: 1ms/div
ch1: cosine 1kHz 1V
```

ch1 が後ろの ch2 を参照している (参照できるのは前の ch だけ)。

```scope
time: 1ms/div
ch1: ch2 | rc 1ms
ch2: sine 1kHz 1V
```

3 つ目のカーソル。

```scope
time: 1ms/div
ch1: sine 1kHz 1V
cursors: [0, 1ms, 2ms]
```

`/div` の無い `time:`。

```scope
time: 1ms
ch1: sine 1kHz 1V
```
