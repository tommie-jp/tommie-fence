---
name: readable-schematic
description: 人が読む回路図 (教科書・解説・記事の図) を、読みやすい配置で書く・直すときに使う。信号は左から右・電位の高いほうを上・4 方向の交点を作らない・計器は測る所の隣、といった回路図の一般的な流儀と、それを ```circuit フェンスの番地と style でどう実現するか (実測した寸法の目安)、PNG に焼いて確かめる点検表をまとめてある。文法そのものは tommie-fence の skill。Use when drawing or cleaning up circuit schematics meant for human readers — layout conventions (signal flow, power at top, ground at bottom, junctions, label placement, meter placement) and how to achieve them in the circuit fence.
---

# 人が読みやすい回路図を書く

文法・`check`・PNG に焼く手順は [tommie-fence の skill](../tommie-fence/SKILL.md)。
ここに書くのは**つながりは正しいが読みにくい図**を避けるための配置の決めごと。
`check` はネットリストしか見ないので、この skill の点検は PNG を目で見て行う。

- §1 は回路図の一般的な流儀 (出典は末尾)。どの道具で描いても通用する
- §2 は circuit フェンスでの実現。**寸法の目安は実測** (circuit-fence 0.11.0 の CLI、
  `standard: jis` の図で確かめた)。版が上がって字や記号の大きさが変わったら測り直す

## 1. 回路図の一般的な流儀

| # | 決め | なぜ |
| --- | --- | --- |
| 1 | **信号は左から右**。入力を左、出力を右に置く | 文を読む向きと同じで、目で追える |
| 2 | 帰還 (フィードバック) だけは右から左へ戻してよい | 帰還は流れに逆らうものなので、逆向きに描くほうが意味が伝わる |
| 3 | **電位の高いほうを上、低いほうを下**。電源は上、GND は下 | 電圧の高低が図の上下で読める。正の電源へは上へ、負の電源へは下へ引く |
| 4 | GND の記号は下向きにする | 上下の約束 (#3) と揃う |
| 5 | 線は縦と横だけ、曲がり角は直角 | 斜めの線は、どこへ行くかを目で追いにくい |
| 6 | **4 方向の交点を作らない**。つなぐ所は T 字にして黒丸を打つ | `+` の交点は、つながっているのか横切っているだけなのか、黒丸の有無でしか区別できず、縮小や複写で黒丸が消えると読み違える |
| 7 | 横切るだけの交差には黒丸を打たない。交差の数そのものを減らす | 黒丸の無い交差 = つながっていない、を一貫させる |
| 8 | 部品の ID と値は部品のすぐ横に置き、字は正立・水平で揃える | 回した字や、隣の部品の近くに流れた字は、どの部品のものか分からなくなる |
| 9 | 関係する部品をまとめて置き、まとまりの間は線だけが渡るようにする | まとまり (電源、負荷、測定) が図の上でも塊に見える |
| 10 | 詰めすぎず、空けすぎない | 詰めると字が重なり、空けると部品が小さく線ばかりになって、目が部品を探し回る |
| 11 | 電流計は測る線に直列、電圧計は測る部品のすぐ横に並列に置く | 計器がどこの何を測っているかが、位置だけで分かる |

## 2. circuit フェンスでの実現

### 2.1 大きさの基本

- `pitch` (1 マスの大きさ) は既定で 2 cm。**2 端子部品の記号は 1 マスに収まる
  大きさ**で、番地の間がそれより長いと、残りは線になる
- 番地の間を 3〜4 マス取ると、部品が小さく線ばかりの図になる (§1 #10 の「空けすぎ」)。
  **図が間延びして見えたら、まず番地の間を詰めるか `pitch` を下げる**
- `pitch` を下げると記号と字の大きさはそのままで、線だけが短くなる

### 2.2 寸法の目安 (実測)

| 何と何の間 | 目安 | 実測で見たこと |
| --- | --- | --- |
| 縦に並べた枝どうし (左に ID、右に値が出る部品) | **2.4 cm 以上** (`pitch: 1.2` で 2 マス、既定の 2 cm なら 2 マス) | 2 cm (既定で 1 マス、`pitch: 1` で 2 マス) では、左の枝の値 (`10 mH`) と右の枝の ID (`C1`) がくっついた |
| `i=` の矢を付けた部品の番地の間 | **2 マス以上** | 1 マスだと矢が分岐の黒丸に重なった |
| 部品と、それに並列に置く計器 | **1 マス** (行や列を 1 つずらす) | 既定の `pitch` で半マス (`a1f0` など) だと、部品の値と計器のラベルが重なった |
| 縦に 2 つ直列に置く部品 (R と L など) | 1 つ 1 マスずつ | 並列の枝と上下の段を揃えるなら、枝全体の高さを電源の高さに合わせる |

実測に使った図 (3 本の並列の枝と、シャント抵抗に並列の電圧計) では、
**`pitch: 1.2`・縦の部品は 2 マス・枝の間は 2 マス** が、字の重なりが無く、
空白も少ない組み合わせだった。まずこの組から始めて、PNG を見て直す。

### 2.3 流儀の書き方

| §1 の決め | circuit フェンスでの書き方 |
| --- | --- |
| #1 左から右 | 電源や入力を小さい列番号 (`1` 側)、負荷や出力を大きい列番号に置く |
| #3 上下 | 上の段 (行 `b` など) を電源側の線、下の段を GND の線にし、GND の記号 (`ground`) は下の線の上に置く。電源 (`vsource` / `sine` など) は**先に書いた番地が +** なので、上の番地を先に書く |
| #4 GND 下向き | `ground` は既定で下向き。回さない |
| #5 縦横だけ | 足へは `\|-` か `-\|` で引く (`--` は斜めに入る) |
| #6 4 方向の交点 | 端が 3 つ以上集まる点には黒丸が自動で付く。**同じ番地に 4 方向から線を集めない** — 1 マスずらして T 字を 2 つにする |
| #8 字 | 字の置き場所は処理系が決める。重なったら、字ではなく**部品の番地の間を空ける** |
| #11 計器 | 電圧計は測る部品と同じ 2 点を、1 マス外へ出した番地で結ぶ (横の部品なら 1 行上、縦の部品なら 1 列横)。測る点から遠く回して輪を大きくしない |

## 3. 手順

1. 回路をまとまり (電源・測定・負荷など) に分け、左から右の順を決める
2. 上の段・下の段の行と、各まとまりの列を決め、§2.2 の目安で番地を振る
3. `check` でネットリストが意図どおりかを確かめる
4. PNG に焼いて (tommie-fence の skill §3)、下の点検表で見る
5. 引っかかった所は番地の間か `pitch` で直し、4 に戻る

### 点検表 (PNG を見て)

- [ ] 信号は左から右、電源は上・GND は下に並んでいるか
- [ ] 字 (ID・値・`i=` `v=` の記号・計器のラベル) がほかの字・線・記号に重なっていないか。**1 字ずつ読めるか**
- [ ] 矢が黒丸や記号に重なっていないか
- [ ] 4 方向から線が集まる点が無いか
- [ ] 計器は測る部品のすぐ横か。遠回りの大きな輪になっていないか
- [ ] 部品に比べて線が長すぎないか (図の大半が空白になっていないか)
- [ ] 同じ本の中で、同じ種類の回路が同じ向き・同じ並びで描かれているか

## 4. 描き手では直せないもの

次のものは番地や `style:` では直らない。図を直そうとせず、そのまま残して報告する。

- **題 (`title:`) と一番上の記号の間が狭い**。題の位置は図の広がりから決まるので、
  一番上に計器などを置くと、題の文字と記号がほとんど接する
- **値の `u` は µ にならない** (`1.5u` は `1.5 uF` と出る)。フェンスの中の TeX には
  単位を組む仕組み (siunitx) が無いため。`.tex` を書き出したときだけ µ で出る
- PNG で `Ω` が `¬` に、小数点が `:` に化けるのは、焼いた環境に TeX のフォントが
  無いため。図の誤りではない (TeX のフォントがある環境で焼けば正しく出る。
  `packages/circuit-fence/scripts/figures.mjs` の注記)

## 出典 (§1)

- [Rules and guidelines for drawing schematics? — Electrical Engineering Codidact](https://electrical.codidact.com/posts/278601)
- [Rules For Drawing Readable Schematics — Electro Tech Online](https://www.electro-tech-online.com/threads/rules-for-drawing-readable-schematics.144863/)
- [How to Read a Schematic — SparkFun Learn](https://learn.sparkfun.com/tutorials/how-to-read-a-schematic/all)
- [Schematic Design Best Practices: 30 Rules — Schemalyzer](https://www.schemalyzer.com/en/blog/schematic-review/best-practices/schematic-design-best-practices)
- [PCB Schematic Design Best Practices — Flux](https://www.flux.ai/p/blog/pcb-schematic-best-practices)
- [How to draw schematics: the good, the bad, and the ugly — Tiago Gala](https://medium.com/@tiago.gala/the-art-of-drawing-good-schematics-be3e7e59eb40)
- [回路図の作法 — トランジスタ技術 2018 年 6 月号](https://toragi.cqpub.co.jp/Portals/0/backnumber/2018/06/p063.pdf)
- [回路図 Schematics — 高知工科大学 橘 昌良](https://www.ele.kochi-tech.ac.jp/tacibana/etc/analog-intro/schematics.html)
- [Voltmeters and Ammeters — Physics LibreTexts](https://phys.libretexts.org/Bookshelves/University_Physics/Physics_(Boundless)/20:_Circuits_and_Direct_Currents/20.4:_Voltmeters_and_Ammeters)
