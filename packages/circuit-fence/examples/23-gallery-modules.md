# 部品ギャラリー: 型番のあるトランジスタ・レギュレータ・機器

型番の表のうち、DIP の箱で描かない物を**全部**置いた。配線はしていない。

- 3 ピンのトランジスタ・FET・レギュレータは記号に型番を添えた (`Q1: npn 番地 2SC1815`)
- 3 ピンの IC は `type: ic3` + `model:` (ピンの名前が表から出る)
- 1 列のヘッダの型番とモジュールは `type: device` + `model:`

**このファイルは書き出した物** — 直すときは `src/gallery/gallery.ts` を直して `npm run gallery`。

## トランジスタ・FET・レギュレータの型番

早見表の「3 ピンのトランジスタ・FET・レギュレータ」の表の型番。下の字は記号の種類。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図01 ギャラリー トランジスタ・FET・レギュレータの型番
parts:
  Q1: npn 2,2 2SC1815
  Q2: pnp 4.25,2 2SA1015
  Q3: npn 6.5,2 2SC2120
  Q4: pnp 8.75,2 2SA950
  Q5: npn 11.25,2 2SC2655
  Q6: pnp 13.5,2 2SA1020
  Q7: npn 2,4.5 2SC3355
  Q8: npn 4.25,4.5 2N3904
  Q9: pnp 6.5,4.5 2N3906
  Q10: npn 8.75,4.5 2N2222A
  Q11: npn 11.25,4.5 P2N2222A
  Q12: npn 13.5,4.5 2SC1008
  Q13: npn 2,7 2N5109
  Q14: npn 4.25,7 2N3866
  Q15: njfet 6.5,7 2SK30A
  Q16: njfet 8.75,7 J310
  Q17: njfet 11.25,7 2SK170
  Q18: njfet 13.5,7 2SK117
  Q19: pjfet 2,9.5 2SJ74
  Q20: nmos 4.25,9.5 2N7000
  Q21: nmos 6.5,9.5 BS170
  Q22: nmos 8.75,9.5 2N7002
  Q23: pmos 11.25,9.5 BSS84
  Q24: nmos 13.5,9.5 IRF520
  Q25: pmos 2,12.5 IRF9540
  Q26: nmos 4.25,12.5 2SK2231
  Q27: npn 6.5,12.5 2SD882
  Q28: pnp 8.75,12.5 2SB772
  U1: regulator 11.25,12.5 7805
  U2: regulator 13.5,12.5 78L05
  U3: regulator 2,15.5 7905
  U4: regulator 4.25,15.5 79L05
  U5: regulator 6.5,15.5 LM317
notes:
  - text 2,3.08 small center: npn
  - text 4.25,3.08 small center: pnp
  - text 6.5,3.08 small center: npn
  - text 8.75,3.08 small center: pnp
  - text 11.25,3.08 small center: npn
  - text 13.5,3.08 small center: pnp
  - text 2,5.57 small center: npn
  - text 4.25,5.57 small center: npn
  - text 6.5,5.57 small center: pnp
  - text 8.75,5.57 small center: npn
  - text 11.25,5.57 small center: npn
  - text 13.5,5.57 small center: npn
  - text 2,8.07 small center: npn
  - text 4.25,8.07 small center: npn
  - text 6.5,8.07 small center: njfet
  - text 8.75,8.07 small center: njfet
  - text 11.25,8.07 small center: njfet
  - text 13.5,8.07 small center: njfet
  - text 2,10.58 small center: pjfet
  - text 4.25,10.58 small center: nmos
  - text 6.5,10.58 small center: nmos
  - text 8.75,10.58 small center: nmos
  - text 11.25,10.58 small center: pmos
  - text 13.5,10.58 small center: nmos
  - text 2,13.58 small center: pmos
  - text 4.25,13.58 small center: nmos
  - text 6.5,13.58 small center: npn
  - text 8.75,13.58 small center: pnp
  - text 11.25,13.58 small center: regulator
  - text 13.5,13.58 small center: regulator
  - text 2,16.43 small center: regulator
  - text 4.25,16.43 small center: regulator
  - text 6.5,16.43 small center: regulator
```

![図01 ギャラリー トランジスタ・FET・レギュレータの型番](out/23-gallery-modules-1.png)

## 3 ピンの IC (`ic3`)

ピンの名前の表にある 3 ピンの型番。箱は三端子レギュレータと同じ (1 = 左、2 = 下、3 = 右)。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図02 ギャラリー ic3 の型番
parts:
  U1:
      type: ic3
      at: 2,2
      model: SFU455B
  U2:
      type: ic3
      at: 4.25,2
      model: SG90
  U3:
      type: ic3
      at: 6.5,2
      model: HC-SR501
  U4:
      type: ic3
      at: 8.75,2
      model: TA7642
  U5:
      type: ic3
      at: 11.25,2
      model: A3144
  U6:
      type: ic3
      at: 13.5,2
      model: A1324
  U7:
      type: ic3
      at: 2,4
      model: LM35
  U8:
      type: ic3
      at: 4.25,4
      model: SFELF10M7
  U9:
      type: ic3
      at: 6.5,4
      model: CFULA455
```

![図02 ギャラリー ic3 の型番](out/23-gallery-modules-2.png)

## 1 列の型番 (`device`)

ピンの名前の表のうち、センサ・モジュール・フィルタ・DIP 化キットなど 1 列で描く型番。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図03 ギャラリー device の型番 (1 列)
parts:
  M1:
      type: device
      at: 2,2.5
      model: SFU455B
  M2:
      type: device
      at: 4,2.5
      model: KY-040
  M3:
      type: device
      at: 6,2.5
      model: HC-SR04
  M4:
      type: device
      at: 7.75,2.5
      model: SG90
  M5:
      type: device
      at: 9.75,2.5
      model: DHT11
  M6:
      type: device
      at: 11.75,2.5
      model: HC-SR501
  M7:
      type: device
      at: 13.75,2.5
      model: GY-9833
  M8:
      type: device
      at: 2.25,5
      model: ADAFRUIT-1782
  M9:
      type: device
      at: 4.75,5
      model: ADAFRUIT-2045
  M10:
      type: device
      at: 7,5
      model: TA7642
  M11:
      type: device
      at: 9,5
      model: A3144
  M12:
      type: device
      at: 10.75,5
      model: A1324
  M13:
      type: device
      at: 12.75,5
      model: LM35
  M14:
      type: device
      at: 14.75,5
      model: SFELF10M7
  M15:
      type: device
      at: 2,8
      model: CFULA455
  M16:
      type: device
      at: 4.25,8
      model: AE-RJ-45-LAN-DIP-A
  M17:
      type: device
      at: 7.25,8
      model: AE-DC-POWER-JACK-DIP
  M18:
      type: device
      at: 10,8
      model: AE-PHONE-JACK-DIP
  M19:
      type: device
      at: 12.5,8
      model: OSTA5131A
  M20:
      type: device
      at: 14.5,8
      model: OSTAMA5B31A
```

![図03 ギャラリー device の型番 (1 列)](out/23-gallery-modules-3.png)

## モジュール (`device`)

文法リファレンスの「モジュールの表」の型番。

```circuit
# 回路図 (tommie-fence の circuit フェンス)
title: 図04 ギャラリー device のモジュール
parts:
  M1:
      type: device
      at: 2,3
      model: MBC2596-01
  M2:
      type: device
      at: 4.25,3
      model: 28BYJ-48
  M3:
      type: device
      at: 6.75,3
      model: ULN2003-BOARD
  M4:
      type: device
      at: 9.25,3
      model: TP4056-MODULE
  M5:
      type: device
      at: 11.5,3
      model: NRF24L01+
  M6:
      type: device
      at: 13.5,3
      model: EC11
  M7:
      type: device
      at: 2.25,7
      model: DRV8833-POLOLU
```

![図04 ギャラリー device のモジュール](out/23-gallery-modules-4.png)
