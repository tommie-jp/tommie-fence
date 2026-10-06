# 例

教科書の「見るべき値」の表と同じ数で書いた ` ```graph ` の例。プレビュー (`Ctrl+Shift+V`) で開くと
フェンスがそのまま図になる。
文法の全部は [docs/01-syntax.md](../docs/01-syntax.md)、1 画面の早見表は
[docs/02-cheatsheet.md](../docs/02-cheatsheet.md)。

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。

| ファイル | 内容 |
| --- | --- |
| [00-resonance.md](00-resonance.md) | 共振曲線 (回路 9-1) — 点列 2 本、対数の x、`mark`・`band`、実測の ○ |
| [01-bode.md](01-bode.md) | ボード線図 (Analog Discovery 5-1) — 式 2 本、dB と deg の 2 枠、`level` |
| [02-diode.md](02-diode.md) | ダイオードの I-V (電験 6-1) — 対数の縦軸、A の式を mA で読む |
| [03-reactance.md](03-reactance.md) | リアクタンス (電験 3-9) — 両対数、交わる所が f₀ |
| [04-solar.md](04-solar.md) | 太陽電池 (電験 12-1) — mA と mW の 2 枠、`peak` で最大電力点 |

00-resonance と 01-bode は `data:` で隣の CSV を重ねる。どちらの CSV も**実測ではない** —
理想の値に揺れを足して計算で作った (ファイルの頭の `#` 行にそう書いてある)。

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではない。

## 回路図

**測る回路が決まっている例 (00 共振・01 ボード線図) は、図の前に回路図を置いてある**
([circuit-fence](../../circuit-fence/) の ` ```circuit ` フェンス。部品は E24 の 10 mH・10 nF・100 Ω・1 kΩ・100 nF)。
作り直しは `npm run schematics --workspace=graph-fence`。ほかの例 (ダイオード・リアクタンス・太陽電池) は
式や実測の曲線を見せるもので、回路図は付けていない。

## 図の付け方

作り直しは `npm run examples --workspace=graph-fence`
(`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショット
テストの期待値であり、貼ってある図でもある。
どの図にも `title: 図NN タイトル` を付けてある。**番号は .md ごとに 01 から数え直す**。
