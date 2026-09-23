# fence-kit

[English](README.md) | [日本語](README.ja.md)

The pieces shared by the three fences — ` ```circuit `, ` ```breadboard ` and
` ```perfboard `. Inside [tommie-fence](https://github.com/tommie-jp/tommie-fence)
it is bundled from source.

**Only two entry points are shipped: the ones that run the drag-to-edit map
outside VS Code.** The same shell runs in the VS Code extension and in the
[playground](https://tommie-jp.github.io/tommie-fence/) page.

## Getting it

It is not on npm. Download `fence-kit-<version>.tgz` with its `SHA256SUMS`
from [Releases](https://github.com/tommie-jp/tommie-fence/releases).

```bash
gh release download fence-kit-v0.1.0 -R tommie-jp/tommie-fence -D vendor
(cd vendor && sha256sum -c SHA256SUMS)
npm install ./vendor/fence-kit-0.1.0.tgz
```

The cores of the fences you draw (`breadboard-fence/core` and so on) are on
Releases in the same form.

## What is inside

| Entry point | Contents |
| --- | --- |
| `fence-kit/shell` | The host side of the shell: `createSession` `panelHtml` `makeNonce` `changesForFence` `fenceToAppend` and their types. ESM, CJS and a single type file. Uses neither the DOM nor Node |
| `fence-kit/map.web.js` | The one script that runs inside the iframe (iife). It carries stand-ins for what VS Code gives a webview: the channel (`acquireVsCodeApi`) and the colour variables (`--vscode-*`) |

**Only these two work from the tgz.** `package.json` also lists `fence-kit`
itself, `fence-kit/cli` and others, but those point at the sources inside the
monorepo and the tgz does not contain them (importing them fails with
`ERR_MODULE_NOT_FOUND`).

## Usage

The shell runs inside an iframe and talks to the host page with `postMessage`.
The host does four things.

1. **Hand over the document.** Write a `DocLike` (text, line count, lines) and a
   `SessionHost` (writing back). The cursor line decides which fence the map
   holds.
2. **Write the shell page into the iframe.** `panelHtml`'s `scriptUri` points
   to the `map.web.js` the host serves.
3. **Relay messages.** What comes from the iframe goes to `session.handle`;
   what the shell posts goes to the iframe. Queue them until the iframe loads.
4. **Clean up.** Call `session.dispose()` and remove the listeners.

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
  // Put the cursor on the first body line of the fence (0-based).
  activeEditor: () => ({ document: doc, selection: { active: { line: 1, character: 0 } } }),
  openDocument: (uri) => (uri === 'memo' ? doc : null),
  applyEdits: (target, fenceLine, edits) => {
    // Check that each `change.from` is still there before applying; return false if not.
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
  scriptUri: '/vendor/map.web.js', // where you serve node_modules/fence-kit/dist/map.web.js
  view: session.view(),
  undo: 'own', // the shell keeps its own undo history
});
```

The host writes `applyChanges`. A `Change` holds a line and the text and column
before and after (`from` / `to`). Apply two changes on the same line from the
right. The playground has a working example in
[`src/map/host.ts`](../playground/src/map/host.ts) and
[`src/map/doc.ts`](../playground/src/map/doc.ts).

### Light and dark

The colours follow the device (`prefers-color-scheme`) by default. A host
without a dark mode sets `data-theme="light"` on the iframe's `<html>` to stay
light. A `srcdoc` iframe shares the host's origin, so the host can write it.

```ts
frame.addEventListener('load', () => {
  frame.contentDocument!.documentElement.dataset.theme = 'light';
});
```

## Matching versions

The types in `fence-kit/shell` (`FenceEditor` and others) are also copied into
the type definitions of the three cores' `./core`. A host matches the two
copies structurally, so **when the shell's types change, fence-kit and the three
cores are released on the same day**. Each package's CHANGELOG records the set.

| fence-kit | circuit-fence | breadboard-fence | perfboard-fence |
| --- | --- | --- | --- |
| 0.1.0 | 0.9.0 | 0.10.0 | 0.7.0 |

## License

MIT
