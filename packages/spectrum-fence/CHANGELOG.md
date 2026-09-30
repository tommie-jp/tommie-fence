# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Fixed

- **`style:` の `on` / `off` に `constructor` などの継承された名前が通っていた** — 語を普通のオブジェクトで引いていたので、`stamp: constructor` が真として読まれ刻印が出た。自分の持つ語だけ受け、それ以外は従来どおり「on か off で書きます」と断る

## [0.3.0] - 2026-09-30

### Fixed

- **`ad2` `ad3` の範囲を 30 MHz に直した** (仮の 25 / 50 MHz を、Digilent の仕様の BNC アダプター使用時の
  −3 dB 帯域 30 MHz+ に)。BNC 無しの 2×15 ヘッダーは AD3 で −3 dB 9 MHz (−0.5 dB 2.9 MHz) なので、
  ヘッダーで測る図は `sweep:` を狭く書く (docs/01-syntax.md に記載)。AD3 は 14 bit・125 MS/s・±25 V・1 MΩ ‖ 24 pF
- **`tinysa-ultra` の範囲を 6 GHz (ULTRA モード) に直した** (5.3 GHz から)。通常モードは 100 kHz〜800 MHz、
  直線性は 5.3 GHz まで ±2 dB・6 GHz まで ±5 dB、入力の絶対最大は +6 dBm (推奨 +0 dBm 以下) とドキュメントに明記

### Added

- **`hold:` — MAX HOLD (掃引を重ねて点ごとの最大を残す)**。掃引ごとの信号を並べれば、点ごとの最大を
  保持したトレースとして描く (1 本目の色の線と薄い塗り)。1 行が 1 回の掃引 (`[波, 波]` なら和)、
  波の周波数を **`from..to`** (`sine 74MHz..102MHz -54.4dBm`、刻みは `/2MHz`) と書けば、その波を動かした
  掃引の全部を積む (刻みを書かなければ掃引の点ごと)。今の掃引 `signal:` も保持に入り、2 本目の色で重なる。
  掃引型も FFT 型 (WaveForms の Maximum。刻みを書く) も同じ書き方
- **マーカーは保持したトレースを読む** (見出しは「読み値 — MAX HOLD (計算)」、凡例と状態の行にも
  `MAX HOLD`)。`data:` とは一緒に書けず、言って `hold:` を外す。範囲の誤り・FFT 型で刻み無し・
  RBW より粗い刻み・掃引が多すぎて打ち切った、も日本語で言う。上限は行 64・掃引 1000 (FFT 型 32)
- docs に MAX HOLD の節と図 (VC1 を回したときの発振 74〜102 MHz、nRF24 の 4 チャンネル)、早見表に `hold:`

## [0.2.0] - 2026-09-29

### Changed

- **理想を破線にするのは `data:` と重ねるときだけ**。理想だけの画面は実線 (破線の切れ目で細い山が
  途切れて見えた)

## [0.1.0] - 2026-09-29

### Added

- **7 つ目のフェンス ` ```spectrum `** — スペクトラムの画面。空でも 10 × 10 目盛の格子を描き、
  読めなかった行は図の下の帯と Problems に出す。**`device:` は必須** (`ad2` / `ad3` /
  `tinysa` / `tinysa-ultra` / `generic`。計算の道が変わるので既定を作らない)。
- CLI `spectrum-fence check|render|version` (vna・scope と同じ作法)。
- **2 つの計算の道** — FFT 型 (`ad2` `ad3`) は波を標本化 (fs = 掃引の終わり × 2.56。
  Nyquist より上の線は落とす) → 窓 (`rect` / `hann` / `flattop`) → FFT で dBV、掃引型
  (`tinysa` `tinysa-ultra` `generic`) は線スペクトルを RBW の山でなぞり、フロア
  (DANL + 10 log10(RBW ÷ 基準) + ATT − LNA) を足して dBm。同じ波が 2 つの道で同じ dBm になる。
- `signal:` は scope と同じ波の綴り (1 行か並び、16 本まで)。操作 (`| rc`) は断る。
- `sweep:` / `center:` + `span:`、`points:` (機種の選択肢に丸める)、`samples:` `window:`、
  `rbw:` (メニューの値。無ければ auto)、`atten:` `lna:`、`ref:` `scale:` `unit:` `floor:`。
  **片方の型にしか無いキーはもう片方で断る** (「ad2 では rbw: は書けません (…)」)。
- `markers:` (周波数か `peak`、4 つまで) と読み値の帯 (`1  100.000 MHz  −7.90 dBm`)。
  `check` が同じ字を出す。
- 例 5 本 (本の 11-4・11-2・11-3・11-5、AD の 4-2・4-3) とわざと壊した例 1 本。
- **測ったスペクトルを重ねる** (`data: 11-12-fm.csv`) — 2 列 (周波数・レベル) の CSV / TXT を
  `.md` の隣から読み、同じ色の実線で重ねる。マーカーは実測の点を読む (見出しが「実測」)。
  tinySA の SAVE TRACES (見出し無し、Hz と dBm。`unit:` で上書き) と WaveForms の Spectrum の
  Export (`#` の頭書き、`Frequency (Hz),Trace 1 (dBV)`) の形を読む。見出しの無い「MHz の CSV」は
  桁で見分けて言う。列が 2 つでない・周波数が戻る・小数点のコンマは断る。読むのは CLI と
  VS Code の拡張 (デスクトップ) だけ。web と playground は「この宿主では読めません」と言う。
- 例 `05-antenna.md` (本の 11-12)。CSV は `scripts/fakeData.mjs` が計算で書く (実測ではない)。
- **文法リファレンス** (`docs/01-syntax.md`、図 6 枚) と **早見表** (`docs/02-cheatsheet.md`。
  AI が毎回読む 1 画面)。早見表に載せた名前と例は `cheatsheet.test.ts` が実装と突き合わせる。
- **山と REF の隔たりをお知らせで言う** — 一番高い山 (`data:` があれば実測、無ければ理想) が
  REF (格子の上端) より 3 目盛以上下なら「一番高い山 (−52.10 dBm、10.000 MHz) は REF (−20 dBm)
  より 3.2 目盛下です (ref: -40dBm なら上端から 1.2 目盛)」、REF より上なら「… は REF (−10 dBm)
  より上で切れています (ref: 0dBm なら入ります)」。勧める `ref:` は山を 10 dB (`scale:` が
  それより細かければその幅) の刻みに切り上げた値で、目盛は `scale:` で数える。`ref:` を
  書いていない (機種の既定) ときも言う。信号の無い (フロアだけの) 画面では言わない。
  終了コードは変えない。

### Security

- 言うことに載せる行の中身で、双方向の分離の制御文字 (U+2066〜2069) も · に置き換える。
  これまでは埋め込み・上書き (U+202A〜202E) だけで、分離の字で行の見え方の並びを偽れた
  (graph-fence のセキュリティの見直しで見つかった)。
