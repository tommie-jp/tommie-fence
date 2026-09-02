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

下の図は `-b1` `-b7` (板の上) と `k14` (板の下)。帯に並べると置きたかった場所と関係なく
散るので、**並べ方を自分で決めたいときは番地で書く**。

**足は穴の格子に載る**ので、機器の足からまず真下 (真上) の穴へ落として、そこから
板の上を配線できる (`IN.SIG -- a7`、`a7 -- c7`…)。斜めに 1 本で引くより、
どの穴を通っているかが読みやすい。

```perfboard
board: 16x10
title: 図02 入りと出を上下に分ける
parts:
  U1: dip8 d6 NE555
  R1: resistor d12 g12 10k
  C1: capacitor/electrolytic i12 j12 10u
  C2: capacitor/ceramic i11 j11 10n
  R3: resistor c14 f14 100
  BAT:
    type: device
    at: -c1
    label: 電池 5V
    pins: + -
  IN:
    type: device
    at: -c7
    label: 信号源
    pins: SIG GND
  SPK:
    type: device
    at: l14
    label: スピーカー 8Ω
    pins: + -
wires:
  - BAT.+ -- a1 red
  - a1 -- g1 red
  - g1 -- g6 red
  - g1 -- i1 red
  - i1 -- i10 red
  - i10 -- d10 red
  - d10 -- d9 red
  - d10 -- d12 red
  - BAT.- -- a2 black
  - a2 -- b2 black
  - b2 -- d2 black
  - d2 -- d6 black
  - d2 -- j2 black
  - IN.SIG -- a7
  - a7 -- c7
  - c7 -- d7
  - IN.GND -- a8 black
  - a8 -- b8 black
  - b8 -- b2 black
  - g7 -- h7 white
  - g8 -- h8 white
  - h7 -- h8 white
  - h8 -- h12 white
  - h12 -- g12 white
  - h12 -- i12 white
  - g9 -- g11 yellow
  - g11 -- i11 yellow
  - d8 -- c8 yellow
  - c8 -- c14 yellow
  - f14 -- j14 yellow
  - SPK.+ -- j14 yellow
  - SPK.- -- j15 black
  - j2 -- j11 black
  - j11 -- j12 black
  - j12 -- j13 black
  - j13 -- i13 black
  - i13 -- i15 black
  - i15 -- j15 black
notes:
  - source blue
```

![図02 入りと出を上下に分ける](out/07-device-2.svg)

足の名前は空白を含まなければ何でもよい (`+` `-` `SIG` `GND` など)。
実物の端子に書いてある綴りをそのまま使うと、組むときに読み替えずに済む。
