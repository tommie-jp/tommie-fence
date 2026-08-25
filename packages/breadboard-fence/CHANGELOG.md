# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- 例を 1 つ足した。[examples/09-am-radio.md](examples/09-am-radio.md) —
  バーアンテナとポリバリコンで同調し、**検波の前に 1 石で高周波を増幅する**中波ラジオ。
  `diode` の向き・`capacitor/ceramic` の姿・ボード外の機器 4 台 (アンテナ・バリコン・
  イヤホン・電池) を上下の帯に分けて置く書き方が 1 枚に入っている。

### Changed

- `examples/08` をエミッタ接地アンプからエミッタフォロワに差し替えた
  (`08-common-emitter.md` → [08-emitter-follower.md](examples/08-emitter-follower.md))。
  同じ 1 石でも**電圧を増やす段と電流だけを増やす段**が並ぶより、
  バッファ段を見せて次の例 (ラジオの高周波増幅) へ渡すほうが読む順に合う。
- ラジオを 09 に入れたので、B-H 測定回路を
  `09-bh-ad2.md` → [10-bh-ad2.md](examples/10-bh-ad2.md) に繰り下げた
  (図の中身は変わっていない)。

- `.vsix` に入っていた examples の PNG (1.1 MB) を外した。**993 KB → 114 KB**。
  `.vscodeignore` が `examples/out/*.svg` だけを除いて PNG を書き忘れていた。
  拡張は実行時に SVG を組み立てるので読むことは無く、README の図は vsce が
  GitHub の絶対 URL に書き換えるため、詳細ページの見え方も変わらない。
- `examples/*.md` に読む順の番号を付けた (`led.md` → `01-led.md`)。
  最小の回路から実験回路へ、上から順に難しくなる。`examples/out` の
  書き出し名も追従する (図の中身は 1 バイトも変わっていない)。

## [0.2.0] - 2026-08-25

部品が一気に増えた版。既定で図の下に部品リストが出るようになったので、
**これまでの図は部品リストのぶんだけ高くなる** (`parts-list: none` で戻せる)。

### Added

- 部品の姿を `種類/姿` の 1 トークンで選べるようにした。同じ役割・同じ極性で、
  実物のかたちだけが違うものを描き分ける。`capacitor/ceramic` `capacitor/film`
  `capacitor/electrolytic` `capacitor/tantalum` / `led/3mm` `led/5mm` /
  `transistor/to92` `transistor/to220`。**姿を書かないときの絵は変わらない**。
- 極性の印を姿ごとに描き分ける。**電解の帯はマイナス側、タンタルの印はプラス側**に付く。
  取り違えると部品を壊すので、形 (缶 / 粒) からも見分けられるようにした。
- 極性つきの 2 本足は、ピン名が片側だけでもよくなった
  (`capacitor/electrolytic a5(+) a8`)。2 本足なので反対側は決まる。
- Raspberry Pi Pico シリーズ (`pico` / `pico-w` / `pico2` / `pico2-w`)。
  ピン 1 の穴だけを書くと、幅 0.7 インチのピン 2 列が上下ブロックの同じ位置の行
  (`h` と `c` など) に落ちる。**ピン名は実物のピンアウトの印字そのまま**
  (`MCU.GP15` `MCU.3V3`)。名前が重なる GND はピン番号を付けて `GND3` `GND8` … と呼ぶ。
- タクトスイッチ (`pushbutton`)。溝をまたぐ 4 本足で、**同じ側の 2 本が
  押していなくてもつながっている**ことを図とネットリストの両方に出す。
- 半固定抵抗 (`potentiometer`) とスライドスイッチ (`slide-switch`)。
  つまみの位置と倒れている向きは、図では示さない (状態で変わるものは描かない)。
- 2 本足の部品を 4 つ追加: `diode` (カソード帯) / `buzzer` / `crystal` / `inductor`。
- 1 列ヘッダ (`sipN`)。`pins:` で足に名前を付けられるので、ヘッダ 1 列の
  モジュール (OLED や測距センサ) をこれで描ける。
- 配線のピン名を書き間違えたとき、同じ書き出しのピンを候補として添える。
- 図の下の部品リスト。`parts:` に書いた部品が ID・種類・値の順に 1 行ずつ並ぶ。
  **既定で出る**ので、これまでの図は部品リストのぶんだけ高くなる。
  `parts-list: none` で消せば従来と同じ図に戻る。
- `board:` のマップ形式。レールの並び (`rails`)・行ラベルの大小 (`letters`)・
  列番号の間引き (`numbers`) を、手元のボードの印字に合わせて選べる。
  番地系は印字に依らず共通で、既定値のときの出力は従来と同一。
- 番地は大小どちらでも書けるようにした (`A5` == `a5`、`+T5` == `+t5`)。

## [0.1.0] - 2026-08-25

初版。`.vsix` は [Releases](https://github.com/tommie-jp/breadboard-fence/releases)
から入手できる。

### Added

- Markdown の ` ```breadboard ` フェンスを、VS Code のプレビューで
  ブレッドボードの実体配線図としてレンダリングする。
- 穴の縦列の導通からネットリストを導出し、図と一緒に出す。
- 部品: resistor (値をカラーコードとして描く) / capacitor (電解は極性帯つき) /
  led / transistor (TO-92) / dipN (ピン 1 の穴だけで配置) / device (ボード外の機器)。
- 配線の自動ルーティングと、`[v-20]` 形式の迂回ヒント。
- `style:` で見た目を選べる 5 つのテーマ
  (classic / dark / high-contrast / mono / presentation)。既定は presentation。
  テーマの一部だけをマップで上書きすることもできる。
- フェンス内 YAML のシンタックスハイライト (injection grammar)。
- 行番号つきのエラー表示。
- CLI `breadboard-fence render` — `.md` / `.yaml` からスタンドアロン SVG を書き出す。
- サンプル 3 つ (LED、エミッタ接地アンプ、B-H カーブ測定回路)。
