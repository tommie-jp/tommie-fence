# 例

[docs/01-syntax.md](../docs/01-syntax.md) の文法を、回路 1 つずつの形で見せたもの。
プレビュー (`Ctrl+Shift+V`) で開くとフェンスがそのまま図になる。

**番号は読む順**。上から下へ、最小の回路から実験回路まで難しくなる。

| ファイル | 内容 |
| --- | --- |
| [01-led.md](01-led.md) | 抵抗と LED だけの最小例 |
| [02-themes.md](02-themes.md) | 同じ回路を 5 つのテーマで描き比べる (`style:`) |
| [03-board-variants.md](03-board-variants.md) | ボードの印字を手元の実物に寄せる (`board:` のマップ形式) |
| [04-parts-list.md](04-parts-list.md) | 図の下の部品リストと、その消し方 (`parts-list:`) |
| [05-capacitors.md](05-capacitors.md) | 部品の姿を選ぶ (`capacitor/ceramic`、LED の大きさ、TO-220) |
| [06-switches.md](06-switches.md) | タクトスイッチ・半固定抵抗・スライドスイッチ |
| [07-pico.md](07-pico.md) | Raspberry Pi Pico に LED とボタンをつなぐ |
| [08-emitter-follower.md](08-emitter-follower.md) | 2SC1815 のエミッタフォロワ (電源 5V、スピーカー出力) |
| [09-am-radio.md](09-am-radio.md) | 1 石中波ラジオ (高周波増幅 + 検波、バーアンテナとポリバリコン) |
| [10-bh-ad2.md](10-bh-ad2.md) | B-H カーブ測定回路 (オペアンプ・測定器・トロイダルコア) |
| [11-sensors.md](11-sensors.md) | CdS・サーミスタの分圧、ダイオードの仲間、ガラス封止の部品 |
| [12-notes.md](12-notes.md) | 図の題と注釈 (印・枠・指し棒・字・フェンスの書き出し) |
| [13-points.md](13-points.md) | 番地に名前を付ける (`points:`)、配線をつないで書く、`l=` |

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではなく、
**書いてある文面が実際の出力と一致するか**をテストで見張っている。

## 図の付け方

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。
GitHub のようにフェンスが描画されない場所で、書き方と出力を対で読むためのもの。
プレビューではフェンス自体が図になるので、同じ図が 2 回見える。

作り直しは `npm run examples` (`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショットテストの
期待値であり、貼ってある図でもある。`.png` は README が使う
(Marketplace の詳細ページは SVG を貼れないため)。

どの図にも `title: 図NN タイトル` を付けてある。文章から「図02 を直して」と
指せるようにするためのもの。**番号は .md ごとに 01 から数え直す** — 通し番号に
すると、1 つのファイルに図を足しただけで関係のないファイルまで振り直しになる。

[docs/01-syntax.md](../docs/01-syntax.md) も同じやり方で、自分のフェンスを描いた図を
貼ってある ([docs/out/](../docs/out/)、作り直しは `npm run docs`)。
**どちらも他所の図は流用しない** — 図には題番号が焼き込まれていて、貼ると
向こうの番号を名乗るので体系が崩れる。同じ題の図が両方にあるときは、
**題が同じなら中身も同じ**であることをテストで見張っている
(`src/core/figureNumbers.test.ts`)。
