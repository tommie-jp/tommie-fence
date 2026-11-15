# 部品ギャラリー: 型番のある DIP

[早見表](../docs/02-cheatsheet.md) の「DIP のピンの名前の表」の**型番を全部**、`dipN` に書いて置いた。
型番を書くと、箱の中にピンの名前と番号が出る。配線はしていない。
1 列のヘッダや外形を持つ型番 (センサ・モジュール・フィルタなど) は [23-gallery-modules.md](23-gallery-modules.md) に機器の箱で置いた。

**このファイルは書き出した物** — 直すときは `src/gallery/gallery.ts` を直して `npm run gallery`。

## DIP4・DIP8

表にある 4・8 ピンの型番 (`dip4` `dip8`)。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図01 ギャラリー DIP4・DIP8 の型番
parts:
  U1: dip4 1.75,2 3SK291
  U2: dip8 3.5,2 AE-SI5351A-B
  U3: dip8 5.5,2 ATtiny85
  U4: dip8 7.25,2 LM358
  U5: dip8 9.25,2 LM386
  U6: dip8 11.25,2 LM393
  U7: dip8 13.25,2 LM741
  U8: dip8 15.25,2 LM75
  U9: dip8 1.75,4 MCP6002
  U10: dip8 3.75,4 MCP9808
  U11: dip8 5.75,4 NE5532
  U12: dip8 7.75,4 NE555
  U13: dip8 9.75,4 NJM4556A
  U14: dip8 11.5,4 PIC12F1822
  U15: dip8 13.25,4 PIC12F683
  U16: dip8 15.25,4 SA612
  U17: dip8 1.75,6 TL071
  U18: dip8 3.75,6 TL072
  U19: dip8 5.5,6 TLC555
```

![図01 ギャラリー DIP4・DIP8 の型番](out/21-gallery-chips-1.png)

## DIP14

表にある 14 ピンの型番 (`dip14`)。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図02 ギャラリー DIP14 の型番
parts:
  U1: dip14 1.75,2.5 74HC00
  U2: dip14 3.75,2.5 74HC02
  U3: dip14 5.5,2.5 74HC04
  U4: dip14 7.5,2.5 74HC08
  U5: dip14 9.25,2.5 74HC10
  U6: dip14 11.25,2.5 74HC11
  U7: dip14 13.25,2.5 74HC125
  U8: dip14 15,2.5 74HC126
  U9: dip14 1.75,5.5 74HC132
  U10: dip14 3.75,5.5 74HC14
  U11: dip14 5.5,5.5 74HC164
  U12: dip14 7.5,5.5 74HC20
  U13: dip14 9.25,5.5 74HC27
  U14: dip14 11.25,5.5 74HC30
  U15: dip14 13.25,5.5 74HC32
  U16: dip14 15,5.5 74HC393
  U17: dip14 1.75,8.5 74HC4066
  U18: dip14 3.75,8.5 74HC74
  U19: dip14 5.75,8.5 74HC86
  U20: dip14 7.5,8.5 74LS00
  U21: dip14 9.5,8.5 CD4001B
  U22: dip14 11.25,8.5 CD40106B
  U23: dip14 13.25,8.5 CD4011B
  U24: dip14 15.25,8.5 CD4013B
  U25: dip14 1.75,11.5 CD4069UB
  U26: dip14 3.75,11.5 CD4070B
  U27: dip14 5.5,11.5 CD4071B
  U28: dip14 7.5,11.5 CD4081B
  U29: dip14 9.5,11.5 LM324
```

![図02 ギャラリー DIP14 の型番](out/21-gallery-chips-2.png)

## DIP16

表にある 16 ピンの型番 (`dip16`)。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図03 ギャラリー DIP16 の型番
parts:
  U1: dip16 1.75,2.5 74HC112
  U2: dip16 3.75,2.5 74HC123
  U3: dip16 5.75,2.5 74HC138
  U4: dip16 7.75,2.5 74HC139
  U5: dip16 9.75,2.5 74HC151
  U6: dip16 11.5,2.5 74HC153
  U7: dip16 13.5,2.5 74HC157
  U8: dip16 15.5,2.5 74HC161
  U9: dip16 1.75,5.5 74HC163
  U10: dip16 4,5.5 74HC165
  U11: dip16 6,5.5 74HC174
  U12: dip16 7.75,5.5 74HC175
  U13: dip16 9.75,5.5 74HC193
  U14: dip16 11.75,5.5 74HC194
  U15: dip16 13.75,5.5 74HC390
  U16: dip16 15.75,5.5 74HC4040
  U17: dip16 1.75,8.5 74HC4051
  U18: dip16 3.75,8.5 74HC4052
  U19: dip16 5.5,8.5 74HC4053
  U20: dip16 7.5,8.5 74HC4060
  U21: dip16 9.75,8.5 74HC595
  U22: dip16 11.75,8.5 74HC85
  U23: dip16 13.75,8.5 CD4017B
  U24: dip16 1.75,11.5 CD4040B
  U25: dip16 4.25,11.5 CD4511B
  U26: dip16 6.5,11.5 CD74HC283
  U27: dip16 8.5,11.5 L293D
  U28: dip16 10.75,11.5 MCP3008
  U29: dip16 12.75,11.5 ULN2003A
```

![図03 ギャラリー DIP16 の型番](out/21-gallery-chips-3.png)

## DIP18・DIP20

表にある 18・20 ピンの型番 (`dip18` `dip20`)。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図04 ギャラリー DIP18・DIP20 の型番
parts:
  U1: dip20 1.75,2.5 74HC240
  U2: dip20 3.75,2.5 74HC244
  U3: dip20 5.5,2.5 74HC245
  U4: dip20 7.5,2.5 74HC273
  U5: dip20 9.25,2.5 74HC541
  U6: dip20 11.25,2.5 74HC573
  U7: dip20 13.25,2.5 74HC574
  U8: dip18 15,2.5 PIC16F628A
  U9: dip18 1.75,6 PIC16F84A
```

![図04 ギャラリー DIP18・DIP20 の型番](out/21-gallery-chips-4.png)

## DIP24・DIP28

表にある 24・28 ピンの型番 (`dip24` `dip28`)。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図05 ギャラリー DIP24・DIP28 の型番
parts:
  U1: dip24 1.75,3 6116
  U2: dip28 3.75,3 62256
  U3: dip24 5.5,3 74HC154
  U4: dip28 7.5,3 ATmega328P
  U5: dip28 9.5,3 PIC16F57
  U6: dip28 11.5,3 PIC16F886
```

![図05 ギャラリー DIP24・DIP28 の型番](out/21-gallery-chips-5.png)
