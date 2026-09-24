# 板の外の機器

電池・スピーカー・測定器のように**盤面に載らないもの**は `device` で書く。
`parts:` の中に**入れ子で**書く — 足の名前の並びを持つので 1 行に畳めない。

```perfboard
board: 14x8
title: 図01 電池でLEDを点ける
parts:
  R1: resistor c4 c8 470
  D1: led c10 c12 red
  BAT:
    type: device
    at: -c4
    label: 電池 3V
    pins: + -
wires:
  - BAT.+ -- a4 red
  - a4 -- c4 red
  - c8 -- c10
  - BAT.- -- a5 black
  - a5 -- a12 black
  - a12 -- c12 black
notes:
  - source blue
```

![図01 電池でLEDを点ける](out/07-device-1.svg)

`type: device` は必ず書く。**入れ子なら機器、とは決めない** — 部品を書き
間違えて字下げした人が、板の外に箱が出ているのを見て気づけないまま終わる。

配線からは `BAT.+` のように `名前.足` で指す。番地にも `points:` の名前にも
`.` は現れないので、綴りだけで機器の足だと分かる。

**足は `+ -` と空白で区切って書く。** YAML の並び (`[+, -]`) に書くと `-` に続く空白が
箱の始まりに読まれて `["+", "-"]` と括らされる。電池の端子を書くたびに
引っかかるので、1 行の書き方を正にしている。

**機器へつなぐ配線も板の上まで線を引く。** 電池の線も実物では板の穴に半田付け
するので、どの穴へ行くのかが図に出ないと、帯に浮いた箱と板が結び付かない。
色を書けばその色で引く。**機器どうしを結んだ配線だけは板に触れない**ので線が無く、
色を書いたときはその旨のお知らせが出る。

```text
N1 : R1.1, BAT.+
N2 : R1.2, D1.1
N3 : D1.2, BAT.-
```

## 上と下に分ける

`at:` で置き場所を選ぶ。`top` / `bottom` なら板の上下の帯に並び、**番地を書けば
その場所**に置ける (箱の左上がその番地)。入る側と出る側を分けると、信号の流れが
図の上から下へ読める。

下の図は `-b17` `-b5` (板の上) と `n2` (板の下)。帯に並べると置きたかった場所と
関係なく散るので、**並べ方を自分で決めたいときは番地で書く**。

**足は穴の格子に載る**ので、機器の足からまず真下 (真上) の穴へ落として、そこから
板の上を配線できる (`IN.SIG -- a6`、`a6 -- a8`…)。斜めに 1 本で引くより、
どの穴を通っているかが読みやすい。

```perfboard
board: 18x12
title: 図02 入りと出を上下に分ける
parts:
  U1: dip8 h11 r180 NE555
  R1: resistor j16 j13 10k
  R2: resistor j10 j7 68k
  C1: capacitor/ceramic j6 l6 10n
  C2: capacitor/ceramic j1 l1 10n
  R3: resistor c3 f3 100
  BAT:
    type: device
    at: -b17
    label: 電池 5V
    pins: "- +"
  IN:
    type: device
    at: -b5
    label: 信号源
    pins: GND SIG
  SPK:
    type: device
    at: n2
    label: スピーカー 8Ω
    pins: "- +"
wires:
  - BAT.+ -- a18 red
  - a18 -- h18 red
  - h18 -- h11 red
  - h18 -- j18 red
  - j18 -- j16 red
  - BAT.- -- a17 black
  - a17 -- e17 black
  - e17 -- l17 black
  - e11 -- e12 black
  - e12 -- e17 black
  - l17 -- l6 black
  - l6 -- l5 black
  - a5 -- k5 black
  - k5 -- l5 black
  - k5 -- k1 black
  - k1 -- l1 black
  - l1 -- l2 black
  - SPK.- -- l2 black
  - IN.GND -- a5 black
  - IN.SIG -- a6
  - a6 -- a8
  - a8 -- e8
  - e10 -- d10 white
  - d10 -- c10 white
  - c10 -- c6 white
  - c6 -- i6 white
  - i6 -- j6 white
  - h9 -- i9 white
  - i9 -- i7 white
  - i7 -- j7 white
  - j7 -- j6 white
  - h10 -- i10 yellow
  - i10 -- j10 yellow
  - j13 -- j10 yellow
  - h8 -- h7 yellow
  - h7 -- h1 yellow
  - h1 -- j1 yellow
  - e9 -- d9 yellow
  - d9 -- d3 yellow
  - d3 -- c3 yellow
  - f3 -- l3 yellow
  - SPK.+ -- l3 yellow
notes:
  - source blue
```

![図02 入りと出を上下に分ける](out/07-device-2.svg)

足の名前は空白を含まなければ何でもよい (`+` `-` `SIG` `GND` など)。
`-` で始まる並び (`- +`) は YAML の箇条書きと読まれるので引用符で囲む。

NE555 は `r180` で切り欠きを右に向けて挿している (`dip8 h11 r180`)。電池を右上に、
信号源を左上に置いたので、4 番ピン (RESET) が信号源の側に来る向きにした。
実物の端子に書いてある綴りをそのまま使うと、組むときに読み替えずに済む。

中身は **NE555 の非安定マルチバイブレータ**で、`R1` `R2` `C1` が周波数を決める
(1.44 / ((10k + 2×68k) × 10n) ≒ 1 kHz)。**信号源は 4 番ピン (RESET) を開け閉め
する** — H の間だけ発振してスピーカーが鳴り、L で止まる。`C2` は 5 番ピン
(CONT) の安定用、`R3` は 555 の出力電流を 8Ω に対して抑えるための直列抵抗。
