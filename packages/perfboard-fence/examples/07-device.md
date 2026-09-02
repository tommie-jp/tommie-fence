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

下の図は `-b1` `-b13` (板の上) と `n16` (板の下)。帯に並べると置きたかった場所と
関係なく散るので、**並べ方を自分で決めたいときは番地で書く**。

**足は穴の格子に載る**ので、機器の足からまず真下 (真上) の穴へ落として、そこから
板の上を配線できる (`IN.SIG -- a13`、`a13 -- a11`…)。斜めに 1 本で引くより、
どの穴を通っているかが読みやすい。

```perfboard
board: 18x12
title: 図02 入りと出を上下に分ける
parts:
  U1: dip8 e8 NE555
  R1: resistor j3 j6 10k
  R2: resistor j9 j12 68k
  C1: capacitor/ceramic j13 l13 10n
  C2: capacitor/ceramic j18 l18 10n
  R3: resistor c16 f16 100
  BAT:
    type: device
    at: -b1
    label: 電池 5V
    pins: + -
  IN:
    type: device
    at: -b13
    label: 信号源
    pins: SIG GND
  SPK:
    type: device
    at: n16
    label: スピーカー 8Ω
    pins: + -
wires:
  - BAT.+ -- a1 red
  - a1 -- h1 red
  - h1 -- h8 red
  - h1 -- j1 red
  - j1 -- j3 red
  - BAT.- -- a2 black
  - a2 -- e2 black
  - e2 -- l2 black
  - e8 -- e7 black
  - e7 -- e2 black
  - l2 -- l13 black
  - l13 -- l14 black
  - a14 -- k14 black
  - k14 -- l14 black
  - k14 -- k18 black
  - k18 -- l18 black
  - l18 -- l17 black
  - SPK.- -- l17 black
  - IN.GND -- a14 black
  - IN.SIG -- a13
  - a13 -- a11
  - a11 -- e11
  - e9 -- d9 white
  - d9 -- c9 white
  - c9 -- c13 white
  - c13 -- i13 white
  - i13 -- j13 white
  - h10 -- i10 white
  - i10 -- i12 white
  - i12 -- j12 white
  - j12 -- j13 white
  - h9 -- i9 yellow
  - i9 -- j9 yellow
  - j6 -- j9 yellow
  - h11 -- h12 yellow
  - h12 -- h18 yellow
  - h18 -- j18 yellow
  - e10 -- d10 yellow
  - d10 -- d16 yellow
  - d16 -- c16 yellow
  - f16 -- l16 yellow
  - SPK.+ -- l16 yellow
notes:
  - source blue
```

![図02 入りと出を上下に分ける](out/07-device-2.svg)

足の名前は空白を含まなければ何でもよい (`+` `-` `SIG` `GND` など)。
実物の端子に書いてある綴りをそのまま使うと、組むときに読み替えずに済む。

中身は **NE555 の非安定マルチバイブレータ**で、`R1` `R2` `C1` が周波数を決める
(1.44 / ((10k + 2×68k) × 10n) ≒ 1 kHz)。**信号源は 4 番ピン (RESET) を開け閉め
する** — H の間だけ発振してスピーカーが鳴り、L で止まる。`C2` は 5 番ピン
(CONT) の安定用、`R3` は 555 の出力電流を 8Ω に対して抑えるための直列抵抗。
