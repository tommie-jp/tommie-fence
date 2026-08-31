# Breadboard Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```breadboard ` フェンスに YAML で配線を書くと、VS Code のプレビューに
ブレッドボードの実体配線図がレンダリングされる拡張機能。

````markdown
```breadboard
board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
  - c13 -- -t13 black
```
````

![LED と抵抗の配線図](examples/out/01-led.png)

図と同時に、**穴の導通からネットリストを導出**する。描いた図が意図した回路に
なっているかを機械的に突き合わせられる。

```text
+t : R1.1
N1 : R1.2, D1.A
-t : D1.K
```

## なぜあるか

回路図 (schematic) をテキストで描く手段は枯れている (CircuiTikZ、Schemdraw)。
一方で**ブレッドボードの実体配線図をテキストから描く手段は空白地帯**だった
(Mermaid / PlantUML / Kroki いずれも非対応)。実験の手順メモに「どの穴に挿すか」を
そのまま書き残せると、後から再現できる。

文法は LLM に書かせても崩れないことを狙って、
**絶対座標を書かせない・接続は名前ベース・配置は穴番地**の 3 点を守っている。

## 使い方

必要なのは **VS Code 1.75 以上**だけ。Marketplace には出していないので、
[Releases](https://github.com/tommie-jp/breadboard-fence/releases) から
`.vsix` を落として入れる (自分で作ることもできる → [開発](#開発))。

`.vsix` の中身は素の JavaScript で、プラットフォーム別のバイナリを含まない
(実行時の依存は YAML パーサだけ)。**同じファイルがどの環境でも使える**ので、
Releases の asset も 1 つしかない。違うのは「どこに入れるか」だけ。

| 環境 | 拡張が動く場所 | インストール |
| --- | --- | --- |
| Windows | Windows 側 | PowerShell で `code --install-extension (Get-Item breadboard-fence-*.vsix).FullName` |
| WSL2 | **WSL 側** (`~/.vscode-server/extensions`) | WSL のシェルで `code --install-extension breadboard-fence-*.vsix` |
| Linux / macOS | そのマシン | `code --install-extension breadboard-fence-*.vsix` |
| Remote-SSH / Dev Container / Codespaces | **接続先** | 接続先のシェルで上と同じコマンド |
| VSCodium / Cursor | そのマシン | `code` の代わりに `codium` / `cursor` を使う |

落としたファイルが壊れていないかは、同じ Release の `SHA256SUMS` で確かめられる。

```bash
sha256sum -c SHA256SUMS
```

ブラウザ版 (vscode.dev / github.dev) でも動くようにビルドしてあるが、**web の
拡張ホストは `.vsix` の手動インストールを受け付けない**。Marketplace に出すまでは、
展開した拡張を HTTPS で配信して `Developer: Install Extension from Location...`
に URL を渡すサイドロードだけが手段になる。

入れたら Markdown を開いて Markdown プレビュー
(`Ctrl+Shift+V` / macOS は `Cmd+Shift+V`) を出す。

`code` が PATH に無いときは、拡張ビュー (`Ctrl+Shift+X`) の右上の `...` →
「VSIX からのインストール」でも同じことができる
(macOS ならコマンドパレットの `Shell Command: Install 'code' command in PATH` で
`code` を通せる)。

### 更新するとき

**ソースを直しただけでは、入っている拡張は変わらない。** `.vsix` を作り直して
入れ直すまで、プレビューは前のビルドのまま動く。

```bash
./doBuild.sh                             # 検査 → .vsix を作る → 入れ直す
```

手でやるなら次の 2 つ。

```bash
npm run package
code --install-extension breadboard-fence-0.3.0.vsix --force
```

- バージョン番号を上げずに入れ直すときは `--force` が要る。
- 入れ直したら**ウィンドウを再読み込みする** (コマンドパレットの
  `Developer: Reload Window`)。プレビューを開き直すだけでは古いままのことがある。
- 拡張が古いと、後から入った文法が「知らないキーです」というエラーで出る。
  文法を足したつもりが図に反映されないときは、まずここを疑う。

### Windows で気をつけること

- Node.js は `winget install OpenJS.NodeJS.LTS` で入る。
- PowerShell と cmd はワイルドカードを展開せず `breadboard-fence-*.vsix` を
  そのまま渡してしまう。上の表のように `Get-Item` で実体のパスにするか、
  ファイル名を直接書く。

### WSL2 で気をつけること

- この拡張は**ワークスペース側 (WSL) で動く**。Windows 側に入れただけでは
  WSL のウィンドウでフェンスが図にならない。拡張ビューに
  「WSL: &lt;ディストリ&gt; にインストール」のボタンが出たら押す。
- リポジトリは Linux 側 (`~/breadboard-fence` など) に置く。`/mnt/c/...` の下は
  ファイルアクセスが遅く、`npm install` とテストが目に見えて重くなる。
- **Windows と WSL で `node_modules` を共有しない**。esbuild と sharp は
  プラットフォーム別のバイナリを入れるので、片方で `npm install` したものは
  もう片方で動かない。混ざったら `rm -rf node_modules && npm install` でやり直す。

### CLI

GitHub に貼れるスタンドアロン SVG を書き出せる。事前に `npm run build`
(または `npm run package`) が要る。コマンドは PowerShell でも同じ。

```bash
node dist/cli.cjs render examples --out examples/out   # 図を書き出す
node dist/cli.cjs check examples                       # 書かずに検証だけ
```

`check` は何も書かず、ネットリストと読めなかったところだけを出す
(読めない行が 1 つでもあれば終了コードは 1)。図を貼る前の下読みと CI 向けで、
LLM に書かせて直させるループでは書き出しの分だけ回転が速い。

引数はファイルでもディレクトリでもよく、展開は CLI 側でやる
(ワイルドカードを展開しないシェルでもそのまま動く)。`--out` を省くと入力と同じ
場所に書く。`npm run examples` は PNG も書き出すが、こちらは sharp
(プラットフォーム別のバイナリ) が要るので開発環境でだけ使う。

## 文法

[docs/01-syntax.md](docs/01-syntax.md) に全文法と図、
[docs/02-cheatsheet.md](docs/02-cheatsheet.md) に 1 画面の早見表がある。要点だけ:

| 要素 | 書き方 | 例 |
| --- | --- | --- |
| ボード | `board: mini` (17 列) / `half` (30 列) / `full` (63 列)。電源レールの有無・並び、行ラベルの大小、列番号の間引きはマップで選べる | `board: half` |
| 穴番地 | 行 `a`〜`e` / `f`〜`j` + 列番号 | `a5`, `j30` |
| レール番地 | `+`/`-` + `t`/`b` + 列番号 | `+t5`, `-b20` |
| 2 端子部品 | `ID: 種類 穴 穴 値` | `R1: resistor a5 a10 10k` |
| 極性 | 穴にピン名を付ける | `D1: led b12(A) b13(K) red` |
| 3 端子部品 | 足の数だけ穴を書く | `Q1: transistor h9(B) h10(C) h11(E) 2SC1815` |
| DIP | ピン 1 の穴だけ書けば残りは自動 | `U1: dip8 @ e5 NJM4556A` |
| ボード外の機器 | マップ形式で `type: device` | 下のサンプル参照 |
| 配線 | `- 端点 -- 端点 [-- 端点 …] [色]` | `- a10 -- b12 -- b20 red` |
| 足と同じ穴への配線 | 部品のほうが同じ列の空いた行へ寄って描かれる (導通は同じ) | `- j20 -- -b20 black` |
| 迂回ヒント | 角括弧で道順を指定 (20 = 穴 1 つ) | `- j20 -- -b20 black [v-20]` |
| 部品リスト | 図の下に自動で出る。消すときだけ書く | `parts-list: none` |
| 押しボタン | 溝をまたいで 4 本足。ピン 1a の穴を書く | `SW1: button @ e5` |
| マイコンボード | ピン 1 の穴を書く。ピン名は実物の印字 | `MCU: pico2 @ h5` |
| 種類の略記 | よく書く種類は短い綴りでも書ける | `R1: r a5 a10 10k` |
| 題 | 図の左上に 1 行 | `title: 図01 LED を点ける` |
| 注釈 | 図の上に印と字を重ねる | `- circle R1` |
| 点の名前 | `points:` で番地に名前を付ける | `vin: a5` |

部品は 2 本足が resistor / capacitor / led / diode / buzzer / crystal / inductor /
photoresistor / thermistor / thermistor-ntc / thermistor-ptc / varistor /
zener / schottky / photodiode / varicap / diac / reed / fuse / lamp、
3 本足が transistor / potentiometer / slide-switch / thyristor / triac、
まとまった足を持つものが button (タクトスイッチ) / dipN / sipN、
マイコンボードが pico / pico-w / pico2 / pico2-w、
ボード外の機器が device。
名前は回路図フェンス
([circuit-fence](https://github.com/tommie-jp/circuit-fence)) と揃えてあるので、
同じノートで両方を書くときに覚え直さなくてよい。

抵抗の値はカラーコードとして描かれ、コンデンサに `(+)` `(-)` を付けると
電解コンデンサとして帯が付く。**極性・向きのある 2 端子は、書かなければ
先に書いた穴が + 側 (アノード)。**

## サンプル

**番号は読む順**。上から下へ、最小の回路から実験回路まで難しくなる。
目次と図の付け方は [examples/README.md](examples/README.md)。

| ファイル | 内容 |
| --- | --- |
| [01-led.md](examples/01-led.md) | 抵抗と LED だけの最小例 |
| [02-themes.md](examples/02-themes.md) | 同じ回路を 5 つのテーマで描き比べる (`style:`) |
| [03-board-variants.md](examples/03-board-variants.md) | ボードの印字を手元の実物に寄せる (`board:` のマップ形式) |
| [04-parts-list.md](examples/04-parts-list.md) | 図の下の部品リストと、その消し方 (`parts-list:`) |
| [05-capacitors.md](examples/05-capacitors.md) | 部品の姿を選ぶ (`capacitor/ceramic`、LED の大きさ、TO-220) |
| [06-switches.md](examples/06-switches.md) | タクトスイッチ・半固定抵抗・スライドスイッチ |
| [07-pico.md](examples/07-pico.md) | Raspberry Pi Pico に LED とボタンをつなぐ |
| [08-emitter-follower.md](examples/08-emitter-follower.md) | 2SC1815 のエミッタフォロワ (電源 5V、スピーカー出力) |
| [09-am-radio.md](examples/09-am-radio.md) | 1 石中波ラジオ (高周波増幅 + 検波、バーアンテナとポリバリコン) |
| [10-bh-ad2.md](examples/10-bh-ad2.md) | B-H カーブ測定回路 (オペアンプ・測定器・トロイダルコア) |
| [11-sensors.md](examples/11-sensors.md) | CdS・サーミスタの分圧、ダイオードの仲間、ガラス封止の部品 |
| [12-notes.md](examples/12-notes.md) | 図の題と注釈 (印・枠・指し棒・字・フェンスの書き出し) |
| [13-points.md](examples/13-points.md) | 番地に名前を付ける (`points:`)、配線をつないで書く、`l=` |

![1 石中波ラジオの配線図](examples/out/09-am-radio.png)

## 仕組み

描画コアは **DOM にも Node の API にも依存しない同期の純関数**
`renderBreadboard(source) => { svg, netlist, errors, notices, errorHtml }` で、
外部リソースを参照しない完結した SVG 文字列を返す。VS Code のプレビュー・CLI・
別アプリのサーバー側描画のどこから呼んでも同じ絵になる。

**読めなかったところは SVG に書き込まない。** 図の SVG は図だけなので、
GitHub や別のノートに貼っても報告が付いてこない。言うことは `errorHtml`
(プレビュー用の HTML) と `errors` / `notices` (生のデータ) に入る。
図が 1 枚も組めなかったときは `svg` が空文字列になる。

| ディレクトリ | 中身 |
| --- | --- |
| `src/core/` | 描画コア (parser / model / placement / router / render) |
| `src/extension/` | VS Code 拡張 (markdown-it の fence ルールを差し替えるだけ) |
| `src/cli/` | SVG 書き出しコマンド |
| `syntaxes/` | フェンス内 YAML のシンタックスハイライト (injection grammar) |

実行時の依存は YAML パーサ 1 つだけ。バンドルは拡張・CLI ともに約 180 KB
(圧縮した `.vsix` は 133 KB)。

## 開発

Node.js 20 以上が要る (拡張を使うだけなら要らない)。

```bash
npm install
npm test          # ユニットテスト
npm run check     # 型チェック + テスト
npm run examples  # examples/*.md → examples/out/*.svg (+ PNG)
npm run docs      # docs/01-syntax.md → docs/out/*.svg
npm run package   # breadboard-fence-x.y.z.vsix を作る
./doBuild.sh      # 上 3 つをまとめて、VS Code に入れ直すところまで
```

VS Code で F5 を押すと拡張機能をデバッグ実行し、`examples/` を開いた
ウィンドウが立ち上がる。

図の描画を変えると `examples/out` のスナップショットテストが落ちる。
`npm run examples` と `npm run docs` で作り直し、git diff で図の変化を
確認してからコミットする。

**この README は日本語が正、英語が追随。** 先に [README.ja.md](README.ja.md) を
直してから [README.md](README.md) を合わせる。節の構成は 2 本で同じに保つ。

### リリース

`package.json` の version と [CHANGELOG.md](CHANGELOG.md) を更新してから、
一致するタグを push する。`.github/workflows/release.yml` が検査 → `.vsix` の作成 →
Release の作成までをやる。リリースノートは CHANGELOG の該当バージョンの節から取る。

```bash
npm version 0.2.0 --no-git-tag-version   # package.json / package-lock.json
$EDITOR CHANGELOG.md                     # ## [0.2.0] の節を書く
npm run check
git commit -am "chore: v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin main v0.2.0
```

## ライセンス

[MIT](LICENSE)
