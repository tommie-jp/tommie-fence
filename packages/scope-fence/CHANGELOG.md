# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

## [0.3.0] - 2026-09-28

### Added

- **操作 4 つ** (段 3b) — `hp τ` (1 次の高域 = CR の微分回路。`x − rc(x)` と同じ更新で、同じ τ の `rc` と
  足すと入力に戻る)、`integrate τ` (`(1/τ)∫x dt`、台形。結果も V。助走の最後の 1 周期の平均を 0 にして
  積分の定数を決める — ±1 V・1 kHz の方形波に `integrate 1ms` で Vpp 0.5 V の三角波)、`delay t`
  (0 以上、点の間は直線で補う。1 kHz に `delay 250us` で −90°)、`invert` (×−1)。助走は hp が rc と同じ、
  integrate は 1 周期、delay はずらす分
- **注釈 `notes:`** — vna と同じ 4 種 (`mark` `text` `band` `source`)、番地は **時刻 電圧**
  (`- text 1ms 1.26V: 1 τ で 63 %`)。電圧は ch1 の V/div と基準で置き、`- text ch2 …` と書けばその ch で。
  時刻も電圧も単位が要る (素の数は時刻の `0` だけ)。字は見えない字を落として 60 字、注釈は 50 個まで。
  画面の外・描いていない ch の注釈は言う。`view: xy` では断る
- 例 `07-notes.md` (電験 5-1 の 1 τ に注釈、微分・積分・delay・invert)

### Changed

- `notes:` を「まだ書けません」と断るのをやめた
- お知らせ「τ が長くて定常まで回らない」「τ が点の間隔より短い」に hp (と delay) を含めた

### Fixed

- Measurements の **phase** — 周期が基準 (一番上の ch) と 2 % 以上違う線は `—` にした。
  2f で振れる瞬時電力 (`math: ch1 * ch2`) に意味の無い角度が出ていた (04-power の MATH)

## [0.2.0] - 2026-09-28

### Added

- **式** (段 3a) — ch の行を `=` で始めると式 (`ch2: = 2V * step(t) * (1 - exp(-t/1ms))`)。
  数は単位つき (`1V` `1ms` `1kHz`)、`t` `pi` `ch1`〜`ch4` (前の ch だけ)、`+ - * / ^` と括弧、
  `sin cos exp abs sqrt min max clip step`。**単位 (V と s) を数えて断る** — 周波数を素の数で書いた
  `sin(2*pi*1000*t)` や、結果が V でない ch の式。知らない関数・名前は一覧つきで断る。
  200 字・入れ子 16 段まで。再帰下降で読み、`eval` は使わない。計算できない点は 0 で描いてお知らせ
- **Math** — `math: ch1 * ch2 / 10`、並びなら `{expr, unit, range, position}`。5 本目の線 (色・`M` の印・
  状態の行)。Measurements とカーソルの表に `MATH` の行。**単位は書き手が `unit:` で言う** (`V` 既定・
  `W`・無次元の `1`) — 式の単位と合わなければお知らせ。振れの小ささとはみ出しのお知らせも Math の単位で言う
- **XY** — `view: xy` と `xy: ch1 math` (既定は横 ch1・縦 ch2、補ったら言う)。8 × 8 の格子、軸ごとに
  Auto の 1-2-5 か ch の `range:`。読み値は各軸の Vpp・Vmax・Vmin。標本化は周波数の揃う最短の時間。
  `time:` `trigger:` `cursors:` `measure:` `data:` は XY では断る
- **`peak τ`** — ピークホールド (`y = max(x, y·e^(−dt/τ))`)。整流の後ろに置けばコンデンサ入力の平滑
  (5 V の全波整流・100 µF・1.5 kΩ で Vdc 3.69 V・リップル 222 mVpp — 数値解と合う)。`rc` と同じ助走
- 例 `04-power.md` (交流の電力と Math)、`05-xy.md` (リサージュ)、`06-diode.md` (ダイオードの式を XY で)、
  `03-rectifier.md` にコンデンサ入力の平滑

### Changed

- `math:` と `view: xy` と `ch の行の =` を「まだ書けません」と断るのをやめた (`notes:` はまだ断る)

## [0.1.1] - 2026-09-28

### Changed

- **字を標準の大きさ (12 px) に上げた** — 題・凡例・目盛の印・状態の行・カーソル・読み値の帯の
  すべて。これまでの 8.5 px (題は 15 px) は図を等倍で貼ると本文より小さく読みにくかった。
  題は 18 px。帯と余白の高さは字の大きさから割り出す。

### Security

- 言うことに載せる行の中身で、双方向の分離の制御文字 (U+2066〜2069) も · に置き換える。
  これまでは埋め込み・上書き (U+202A〜202E) だけで、分離の字で行の見え方の並びを偽れた
  (graph-fence のセキュリティの見直しで見つかった)。

## [0.1.0] - 2026-09-28

### Added

- **6 つ目のフェンス ` ```scope `** — オシロスコープの画面 (時間波形)。
  空でも 10 × 8 目盛の格子を描き、読めなかった行は図の下の帯と Problems に出す。
- CLI `scope-fence check|render|version` (vna と同じ作法)。`check` は読み値
  (Measurements とカーソル) を字で出す — 本文の「見るべき値」の表と数で突き合わせる。
- **波と操作** — `ch1: square 100Hz 1V offset 1V`、`ch2: ch1 | rc 1ms | clip -0.7V 0.7V`。
  波は sine / square / triangle / sawtooth / pulse / dc (振幅は peak。`2Vpp` `0.707Vrms` も)、
  操作は rc / clip / offset / gain / abs。参照できるのは自分より前の ch だけ。
  理想は画面を 8192 点で標本化し、助走 (10 τ + 1 周期) から回した定常を破線で描く。
- **トリガ** (`trigger: ch1 rising 1V`) — 横切りを探して t = 0 を画面の中央に置く。
- **Auto の目盛** — V/div は Vpp が 6 目盛に入る 1-2-5、time/div は一番遅い波の 2 周期。
  `ch1: {wave: …, range: 500mV/div, position: -2div}` で手で決められる。
- **カーソルと Measurements** (`cursors: [0, 1ms]`、`measure: [vpp, freq, phase]`) を
  図の下の帯に表で出す。vpp / vmax / vmin / avg / rms / freq / period / duty / phase / rise。
- **単位の無い数は断る** (`sine 1000 1` → 「周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます」。周波数は `1kHz` でも `1k` でもよい)。
  `time:` と `trigger:` を書かなかったときは何で描いたかをお知らせで言う。
- 例 5 本 (電験 5-1 の RC の充電、3-4 の位相、回路 1-9 のクリッパとクランパ、整流、波 6 種)。
- **測った波を重ねる** (`data: 5-1-rc.csv`) — WaveForms の Scope の Export (CSV / TXT) を
  `.md` の隣から読み、同じ色の実線で重ねる。読み値は測った値になる (見出しが「実測」)。
  `#` の頭書きは読み捨て、`Channel N (V)` / `C1 (V)` / `CH1 (mV)`、`,` / タブ / `;`、
  `Time (ms)` を読む。時刻の逆行・間隔の揃わない記録・ロケールの小数点のコンマは断る。
  読むのは CLI (`.md` の隣) と VS Code の拡張 (文書の隣) だけ。web と playground は
  「この宿主では読めません」と言って理想だけを描く。
- **文法リファレンス** (`docs/01-syntax.md`、図 6 枚) と **早見表** (`docs/02-cheatsheet.md`。
  AI が毎回読む 1 画面)。早見表に載せた名前と例は `cheatsheet.test.ts` が実装と突き合わせる。
- **読みにくい尺度をお知らせで言う** (手で書いた `range:` `position:` だけ。Auto では言わない)。
  振れが 2 目盛未満なら「CH2 の振れは 1.2 目盛です (range: 200mV/div と position: -12.5div
  なら 6.1 目盛で中央に来ます)」、画面の上か下からはみ出すなら「CH1 は画面の上に 1.0 目盛
  はみ出しています (position: -2.5div なら入ります)」と、直す値まで言う。判定は読み値と
  同じ列 (実測があれば実測) の、画面の中の点で見る。同じ尺度で重ねて比べる ch (同じ
  `range:` と `position:` で、振れが 2 目盛以上の相手がいる) の小ささは言わない
  (入力と平滑後を重ねて小さいことを見せる図)。
- **基準の高さが 0.25 目盛未満しか違わない ch は、▶ と番号の組を横に並べる** (`2▶1▶`)。
  番号を 1 つの ▶ の左に詰めると `12▶` と 1 つの番号に読めた。3 組以上並ぶときは左の余白を広げる。
