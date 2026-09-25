---
name: readable-schematic
description: 人が読む回路図を ```circuit フェンスで書く・直すときに使う。回路図の配置の流儀そのもの (信号は左から右・電位の高いほうを上・4 方向の交点を作らない・計器は測る所の隣、と出典) は electronics-drawing-skills の readable-schematic にあり、ここには circuit フェンスでそれを実現する番地と style の目安 (実測) と、確かめる手順だけを置く。Use when laying out human-readable schematics in the circuit fence — this holds only the circuit-fence specifics (measured spacing, how each convention maps to addresses and style); the conventions themselves live in electronics-drawing-skills.
---

# circuit フェンスで読みやすい回路図を書く

**回路図の配置の流儀 (出典つき) と、画像で確かめる点検表は
[electronics-drawing-skills の readable-schematic](https://github.com/tommie-jp/electronics-drawing-skills/blob/main/plugins/readable-schematic/skills/readable-schematic/SKILL.md)
にある。先にそちらを読む。** 入れていなければ、Claude Code の入力欄で
`/plugin marketplace add tommie-jp/electronics-drawing-skills` と
`/plugin install readable-schematic@electronics-drawing-skills`。

ここに置くのは、その流儀を ` ```circuit ` フェンスで実現するための目安だけ。流儀を 2 か所に
書くと片方だけ直るので、流儀の中身はここに写さない。文法・`check`・PNG に焼く手順は
[tommie-fence の skill](../tommie-fence/SKILL.md)。

寸法の目安は circuit-fence 0.11.0 の CLI で、`standard: jis` の図を描き比べて測った。
記号や字の大きさ・置き方を変えたら測り直す。

## 1. circuit フェンスでの目安

### 1.1 大きさの基本

- `pitch` (1 マスの大きさ) は既定で 2 cm。**2 端子部品の記号は 1 マスに収まる
  大きさ**で、番地の間がそれより長いと、残りは線になる
- 番地の間を 3〜4 マス取ると、部品が小さく線ばかりの図になる (流儀 #11 の「空けすぎ」)。
  **図が間延びして見えたら、まず番地の間を詰めるか `pitch` を下げる**
- `pitch` を下げると記号と字の大きさはそのままで、線だけが短くなる

### 1.2 寸法の目安 (実測)

| 何と何の間 | 目安 | 実測で見たこと |
| --- | --- | --- |
| 縦に並べた枝どうし (左に ID、右に値が出る部品) | **2.4 cm 以上** (`pitch: 1.2` で 2 マス、既定の 2 cm なら 2 マス) | 2 cm (既定で 1 マス、`pitch: 1` で 2 マス) では、左の枝の値 (`10 mH`) と右の枝の ID (`C1`) がくっついた |
| `i=` の矢を付けた部品の番地の間 | **2 マス以上** | 1 マスだと矢が分岐の黒丸に重なった |
| 部品と、それに並列に置く計器 | **1 マス** (行や列を 1 つずらす) | 既定の `pitch` で半マス (`a1f0` など) だと、部品の値と計器のラベルが重なった |
| 縦に 2 つ直列に置く部品 (R と L など) | 1 つ 1 マスずつ | 並列の枝と上下の段を揃えるなら、枝全体の高さを電源の高さに合わせる |

実測に使った図 (3 本の並列の枝と、シャント抵抗に並列の電圧計) では、
**`pitch: 1.2`・縦の部品は 2 マス・枝の間は 2 マス** が、字の重なりが無く、
空白も少ない組み合わせだった。まずこの組から始めて、PNG を見て直す。

### 1.3 流儀の書き方

| 流儀の決め (番号は electronics-drawing-skills の §1) | circuit フェンスでの書き方 |
| --- | --- |
| #1 左から右 | 電源や入力を小さい列番号 (`1` 側)、負荷や出力を大きい列番号に置く |
| #3・#4 上下 | 上の段 (行 `b` など) を電源側の線、下の段を GND の線にし (単電源のとき)、GND の記号 (`ground`) は下の線の上に置く。電源 (`vsource` / `sine` など) は**先に書いた番地が +** なので、上の番地を先に書く |
| #5 GND 下向き | `ground` は既定で下向き。回さない |
| #6 縦横だけ | 足へは `\|-` か `-\|` で引く (`--` は斜めに入る) |
| #7 4 方向の交点 | 端が 3 つ以上集まる点には黒丸が自動で付く。**同じ番地に 4 方向から線を集めない** — 1 マスずらして T 字を 2 つにする |
| #10 字 | 字の置き場所は処理系が決める。重なったら、字ではなく**部品の番地の間を空ける** |
| #12 計器 | 電圧計は測る部品と同じ 2 点を、1 マス外へ出した番地で結ぶ (横の部品なら 1 行上、縦の部品なら 1 列横)。測る点から遠く回して輪を大きくしない |

## 2. 手順

1. 流儀 (electronics-drawing-skills の §1) に従って、まとまりと左から右の順、電源と GND の段を決める
2. §1.2 の目安で番地を振る。まず `pitch: 1.2`・縦の部品は 2 マス・枝の間は 2 マスから始める
3. `check` でネットリストが意図どおりかを確かめる
4. PNG に焼いて (tommie-fence の skill §3)、electronics-drawing-skills の点検表で見る
5. 引っかかった所は番地の間か `pitch` で直し、4 に戻る

## 3. 処理系の側で直したこと (circuit-fence 0.13.0)

前は描き手では直せなかったもの。0.13.0 より前の版で描いた図には、まだ出る。

- **題と一番上の記号の間** — 題を 4pt 持ち上げた。それでも近いと感じたら、一番上の記号を 1 段下げる
- **値の `u`** — `1.5u` は `1.5 µF` (数式の斜体の µ) で出る。立体の µ は `--emit-tex` (siunitx) だけ
- **プレビューの外で `Ω` や `µ` が化ける** — `render --embed-fonts` で書き出した `.svg` は、図が使う
  TeX のフォントを埋め込むので化けない (1 枚が 150 KB ほど大きくなる)。付けずに書き出した `.svg` を
  ブラウザや GitHub で開くと、今までどおり `Ω` が `¬`、`µ` が `¹`、小数点が `:` に化ける。
  PNG に焼く環境に TeX のフォントが無いときも同じ (図の誤りではない)

0.13.0 の次の版 (まだ版は切っていない) で直したもの:

- **LED・フォトダイオードの値と光の矢** — 値を矢の先より外に出す。そのぶん値が記号から
  0.6 cm ほど離れるので、値の側に隣の部品を寄せすぎない (1 マスあれば足りる)
- **DIP の型番と足の番号** — 立てた DIP の型番は箱の下の外に出る (名前 `U1` は上)。
  箱の下が 1 行ぶん (0.4 cm ほど) 埋まるので、箱の真下に部品や注釈を寄せない
- **反転した機器 (`turn: mirror`) の名前と足の名前** — 名前は足の名前の列の反対側に出る
