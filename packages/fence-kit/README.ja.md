# fence-kit

[English](README.md) | [日本語](README.ja.md)

` ```circuit ` / ` ```breadboard ` / ` ```perfboard ` の 3 つのフェンスが共有する
部品。[tommie-fence](https://github.com/tommie-jp/tommie-fence) の中では
ソースのまま束ねられる。

**外へ配るのは、図を掴んで動かすエディタ (マップ) を VS Code の外で動かす
ための出口 2 つだけ。** 同じ殻が VS Code の拡張と
[playground](https://tommie-jp.github.io/tommie-fence/) の頁で動いている。

## 入手

npm には出していない。
[Releases](https://github.com/tommie-jp/tommie-fence/releases) から
`fence-kit-<版>.tgz` を `SHA256SUMS` つきで落とす。

```bash
gh release download fence-kit-v0.1.0 -R tommie-jp/tommie-fence -D vendor
(cd vendor && sha256sum -c SHA256SUMS)
npm install ./vendor/fence-kit-0.1.0.tgz
```

描くフェンスのコア (`breadboard-fence/core` など) も同じ形で Releases にある。

## 中身

| 出口 | 中身 |
| --- | --- |
| `fence-kit/shell` | 殻の宿主側。`createSession` `panelHtml` `makeNonce` `changesForFence` `fenceToAppend` と型。ESM・CJS・型定義 1 ファイル。DOM も Node も使わない |
| `fence-kit/map.web.js` | iframe の中で動く 1 本 (iife)。VS Code が webview に与える送り口 (`acquireVsCodeApi`) と色の変数 (`--vscode-*`) の肩代わり込み |

**tgz から読めるのはこの 2 つだけ。** `package.json` には `fence-kit` そのものや
`fence-kit/cli` の入口も載っているが、どれもモノレポの中でソースを指すもので、
tgz には中身が入っていない (読むと `ERR_MODULE_NOT_FOUND` になる)。

## 使い方

殻は iframe の中で動き、宿主の頁と `postMessage` で話す。宿主がすることは 4 つ。

1. **文書を渡す。** `DocLike` (全文・行数・行) と `SessionHost` (書き戻し) を書く。
   カーソルの行が「いま掴むフェンス」を決める。
2. **殻の頁を iframe に書く。** `panelHtml` の `scriptUri` は、宿主が配る
   `map.web.js` を指す。
3. **知らせを取り次ぐ。** iframe から来たものを `session.handle` へ、
   殻が送るものを iframe へ。iframe が読み終わるまでは溜めておく。
4. **片付ける。** `session.dispose()` と聞き耳を外す。

```ts
import { changesForFence, createSession, makeNonce, panelHtml } from 'fence-kit/shell';
import type { DocLike, Incoming, Outgoing } from 'fence-kit/shell';
import { createBreadboardEditor } from 'breadboard-fence/core';

let text = '```breadboard\nboard: half\nparts:\n  R1: resistor a5 a10\n```\n';
const lines = (): string[] => text.split('\n');
const doc: DocLike = {
  uri: { toString: () => 'memo' },
  getText: () => text,
  get lineCount() { return lines().length; },
  lineAt: (line) => ({ text: lines()[line] ?? '' }),
};

const frame = document.querySelector<HTMLIFrameElement>('#map')!;
let ready = false;
const waiting: Outgoing[] = [];
const post = (message: Outgoing): void => {
  if (ready) frame.contentWindow?.postMessage(message, '*');
  else waiting.push(message);
};

const session = createSession<DocLike>({
  post,
  // フェンスの本文の 1 行目 (0 始まり) にカーソルを置く。
  activeEditor: () => ({ document: doc, selection: { active: { line: 1, character: 0 } } }),
  openDocument: (uri) => (uri === 'memo' ? doc : null),
  applyEdits: (target, fenceLine, edits) => {
    // 当てる前に `change.from` がそこにあるか照合し、合わなければ false を返す。
    const next = applyChanges(lines(), changesForFence(target, fenceLine, edits));
    if (next === null) return Promise.resolve(false);
    text = next.join('\n');
    return Promise.resolve(true);
  },
  replaceBody: (_target, fenceLine, count, body) => {
    const all = lines();
    text = [...all.slice(0, fenceLine), ...body, ...all.slice(fenceLine + count)].join('\n');
    return Promise.resolve(true);
  },
  highlight: () => {},
}, [createBreadboardEditor()], { pinned: doc });

frame.addEventListener('load', () => {
  ready = true;
  for (const message of waiting.splice(0)) frame.contentWindow?.postMessage(message, '*');
});
window.addEventListener('message', (event: MessageEvent<Incoming>) => {
  if (event.source === frame.contentWindow) void session.handle(event.data);
});
frame.srcdoc = panelHtml({
  cspSource: "'self'",
  nonce: makeNonce(),
  scriptUri: '/vendor/map.web.js', // node_modules/fence-kit/dist/map.web.js を配った先
  view: session.view(),
  undo: 'own', // 戻す・やり直すは殻が自前の履歴で持つ
});
```

`applyChanges` は宿主が書く。`Change` は行と、書き換える前後の字と桁
(`from` / `to`) を持つ。同じ行に 2 か所あるときは右から当てる。
動く実例は playground の
[`src/map/host.ts`](../playground/src/map/host.ts) と
[`src/map/doc.ts`](../playground/src/map/doc.ts)。

### 明暗

色は既定で端末の明暗 (`prefers-color-scheme`) に従う。ダークモードを持たない
宿主は、iframe の `<html>` に `data-theme="light"` を立てると明るいままになる。
`srcdoc` の iframe は宿主と同じ出所なので、宿主の側から書ける。

```ts
frame.addEventListener('load', () => {
  frame.contentDocument!.documentElement.dataset.theme = 'light';
});
```

## 版の組み合わせ

`fence-kit/shell` の型 (`FenceEditor` など) は、3 つのコアの `./core` の型定義にも
写されている。宿主はこの 2 つを構造で突き合わせるので、**殻の型が変わるときは
fence-kit と 3 つのコアを同じ日に切る**。組み合わせは各パッケージの CHANGELOG に
書く。

| fence-kit | circuit-fence | breadboard-fence | perfboard-fence |
| --- | --- | --- | --- |
| 0.1.0 | 0.9.0 | 0.10.0 | 0.7.0 |

## ライセンス

MIT
