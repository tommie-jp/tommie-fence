# ボードの印字

実物のブレッドボードの印字はメーカーごとに割れている。レールの並び、行ラベルの大小、
列番号の間引き。`board:` をマップで書くと、手元のボードに図の印字を寄せられる。
**番地系はどの印字でも共通**なので、どれで描いても回路は同じに読める。

サイズ (`mini` / `half` / `full`) と**レールの有無は直交**していて、
`rails:` でどの組み合わせにもできる。

## 既定 (+--+ / 小文字 / 5 毎)

`board: half` のスカラー形と同じ。最も普及した印字 (Fritzing もこれ)。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図01 既定の印字
board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
  - c13 -- -t13 black
notes:
  - source blue
```

![図01 既定の印字](out/03-board-variants-1.svg)

## レールの並びを +-+- に

下側のペアが上側と同順 (+ が内側) のボード。同じ回路を下側のレールで組んだ例。
`+b` は「下側の + レール」という極性ベースの番地なので、
**並びを変えても配線の書き方は変わらない**。挿す行が図の中で入れ替わるだけ。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図02 レールの並びを +-+- に
board:
  rails: "+-+-"
parts:
  R1: resistor f5 f10 330
  D1: led g12(A) g13(K) red
wires:
  - +b5 -- j5 red
  - f10 -- g12
  - i13 -- -b13 black
notes:
  - source blue
```

![図02 レールの並びを +-+- に](out/03-board-variants-2.svg)

## 大文字ラベルと全列番号

行ラベルが A〜J で、列番号が全列に印字されたボード。
`letters: upper` のときは番地も `A5` と大文字で書ける (`a5` と同じ意味)。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図03 大文字ラベルと全列番号
board:
  letters: upper
  numbers: all
parts:
  R1: resistor A5 A10 330
  D1: led B12(A) B13(K) red
wires:
  - +t5 -- A5 red
  - A10 -- B12
  - C13 -- -t13 black
notes:
  - source blue
```

![図03 大文字ラベルと全列番号](out/03-board-variants-3.svg)

## ミニボード (17 列、レール無し)

170 穴のミニ。実物にレールが無いので、`board: mini` の既定もレール無しになる。
電源は穴のブロックまで直接引く。**レール番地 (`+t5`) は使えない** — 挿す先が無いので、
書くと行番号つきのエラーになる。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図04 ミニボードに組む
board: mini
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
  BAT:
    type: device
    at: top
    label: 電池ボックス 3V
    pins: ["+", "-"]
wires:
  - BAT.+ -- a5 red
  - a10 -- b12
  - c13 -- BAT.- black
notes:
  - source blue
```

![図04 ミニボードに組む](out/03-board-variants-4.svg)

## ミニボードにレールを継ぎ足す

実物のレールは基板と一体ではなく、両面テープで貼られた独立ストリップ。
剥がすことも継ぎ足すこともできるので、`rails:` を書けば mini にも付けられる。
こうすると `+t5` が使えるようになる。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図05 ミニボードにレールを継ぎ足す
board:
  size: mini
  rails: "+--+"
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
  - c13 -- -t13 black
notes:
  - source blue
```

![図05 ミニボードにレールを継ぎ足す](out/03-board-variants-5.svg)

## レールを剥がした half

逆向きの組み合わせ。`rails: none` はどのサイズにも効く。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図06 レールを剥がした half
board:
  size: half
  rails: none
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - a10 -- b12
notes:
  - source blue
```

![図06 レールを剥がした half](out/03-board-variants-6.svg)

## 基板を縦に継ぐ (stack)

実物のブレッドボードは縁の凸凹で何枚でも継げる。`stack:` に枚数を書くと、同じ基板を縁を接して縦に並べる。
**2 枚めの穴は番地の頭に `2:` を付ける** (`2:a5` `2:+t5`)。頭の無い番地は 1 枚め。
継ぎ目をまたげるのは線と 2 ピンの部品で、**導通は枚ごとに別** (継ぎ目は電気を渡さない)。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図07 2 枚を継ぐ
board:
  size: half
  stack: 2
parts:
  R1: resistor j8 2:a8 330
  D1: led 2:b8(A) 2:b9(K) red
wires:
  - +b8 -- i8 red
  - 2:a9 -- 2:-t9 black
  - -b2 -- 2:-t2 black
notes:
  - source blue
```

![図07 2 枚を継ぐ](out/03-board-variants-7.svg)

- 1 枚めの j 行から 2 枚めの a 行までは 7 ピッチ (穴の格子に乗る)。またぐ抵抗は縦にまっすぐ届く
- 部品表の基板の行は `half (400 穴) × 2` になる

## 機器を基板の横に置く (at: left / right)

ボード外の機器は `at: left` / `at: right` で基板の横にも置ける。ピンは基板に向いた辺に縦に並び、
線は基板の外を縦に走ってから行と行の間を横に入る (レールへは行に沿って入る)。

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: 図08 電池を基板の右に置く
board: half
parts:
  R1: resistor a20 a25 330
  D1: led b27(A) b28(K) red
  BAT:
    type: device
    at: right
    label: 電池 3V
    pins: ["+", "-"]
wires:
  - BAT.+ -- +t30 red
  - BAT.- -- -t30 black
  - +t20 -- a20 red
  - a25 -- b27
  - c28 -- -t28 black
notes:
  - source blue
```

![図08 電池を基板の右に置く](out/03-board-variants-8.svg)
