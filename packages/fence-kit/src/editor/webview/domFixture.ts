/**
 * `map.ts` を node で動かすための**足場**。
 *
 * `map.ts` は webview の DOM そのものを触る層で、ここだけ node のテストから
 * 見えていなかった (52 の docs/28 でカバレッジが割れていた元)。jsdom は要素と
 * 出来事は持っているが、**SVG の幾何を持っていない** (`getBBox` も
 * `getScreenCTM` も `elementsFromPoint` も無い) ので、そこを埋める。
 *
 * **座標はテストが決める。** 要素に `data-box="x,y,w,h"` を書いておくと、
 * この足場がその四角を返し、`elementsFromPoint` もその四角で当たりを取る。
 * 図の見た目ではなく**殻の段取り**を見るための道具なので、これで足りる。
 */

/** 画面と図の座標を同じにする (縮尺 1、原点も同じ)。 */
type Matrix = {
  readonly a: number; readonly b: number; readonly c: number;
  readonly d: number; readonly e: number; readonly f: number;
  readonly inverse: () => Matrix;
};

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => IDENTITY };

const boxOf = (element: Element): { x: number; y: number; width: number; height: number } => {
  const written = element.getAttribute('data-box');
  if (written === null) return { x: 0, y: 0, width: 0, height: 0 };
  const [x = 0, y = 0, width = 0, height = 0] = written.split(',').map(Number);
  return { x, y, width, height };
};

const holds = (element: Element, x: number, y: number): boolean => {
  const box = boxOf(element);
  return box.width > 0 && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
};

/** 送った知らせの控え。テストはここを見る。 */
export type Posted = { readonly kind: string } & Record<string, unknown>;

/**
 * 前に敷いた足場が付けた受け口。**次を敷く前に外す。**
 *
 * jsdom の `document` はファイルの中で 1 つきりなので、`map.ts` を読み込み直すと
 * 受け口が積み上がる。古い写しも同じ出来事を拾い、**先に DOM を書き換えてしまう**
 * ので、新しいほうが「もう変わっている」と見て何もしない (フェンスの送りで踏んだ)。
 */
let attached: { readonly on: EventTarget; readonly kind: string; readonly fn: EventListener }[] = [];

function watchListeners(): void {
  for (const one of attached) one.on.removeEventListener(one.kind, one.fn);
  attached = [];
  for (const on of [document, globalThis as unknown as EventTarget]) {
    const add = on.addEventListener.bind(on);
    on.addEventListener = (kind: string, fn: EventListenerOrEventListenerObject, options?: unknown): void => {
      attached.push({ on, kind, fn: fn as EventListener });
      add(kind, fn, options as AddEventListenerOptions);
    };
  }
}

/**
 * 足場を敷く。**`map.ts` を読み込む前に呼ぶ** — 読み込んだ瞬間に
 * `acquireVsCodeApi()` を呼び、出来事の受け口を付けるため。
 */
export function layDom(body: string): { readonly posted: Posted[] } {
  const posted: Posted[] = [];
  const world = globalThis as unknown as Record<string, unknown>;

  world['acquireVsCodeApi'] = () => ({ postMessage: (message: Posted) => { posted.push(message); } });

  // `CSS.escape` は名札を選択子に埋めるところで使う。**引用符と逆斜線だけ**
  // 逃がせば、この足場の名札 (英数字と `:`) には足りる。
  world['CSS'] = { escape: (value: string) => value.replace(/["\\]/g, '\\$&') };

  class Point {
    constructor(public x: number, public y: number) {}

    matrixTransform(matrix: Matrix): Point {
      return new Point(matrix.a * this.x + matrix.c * this.y + matrix.e, matrix.b * this.x + matrix.d * this.y + matrix.f);
    }
  }
  world['DOMPoint'] = Point;

  // jsdom の `createElementNS` は `SVGGraphicsElement` の実体を作らない。
  // `instanceof` で姿を選り分けている所があるので、SVG の要素を通す。
  world['SVGGraphicsElement'] = class {
    static [Symbol.hasInstance](value: unknown): boolean {
      return value instanceof (world['SVGElement'] as new () => unknown);
    }
  };

  const svgProto = (world['SVGElement'] as { prototype: Record<string, unknown> }).prototype;
  svgProto['getBBox'] = function getBBox(this: Element) { return boxOf(this); };
  svgProto['getScreenCTM'] = () => IDENTITY;

  const anyProto = (world['Element'] as { prototype: Record<string, unknown> }).prototype;
  anyProto['getBoundingClientRect'] = function rect(this: Element) {
    const box = boxOf(this);
    return { ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height };
  };
  // `ownerSVGElement` も jsdom には無い。図の根を返す。
  Object.defineProperty(svgProto, 'ownerSVGElement', {
    configurable: true,
    get(this: Element) { return this.closest('svg'); },
  });

  watchListeners();
  document.documentElement.innerHTML = `<head></head><body>${body}</body>`;
  document.body.className = 'cf-own-undo';

  document.elementsFromPoint = (x: number, y: number): Element[] => {
    const hit = [...document.querySelectorAll('[data-box]')].filter((one) => holds(one, x, y));
    // 深いほうが上 (`elementsFromPoint` は上から順に返す)。
    return [...hit].reverse();
  };

  return { posted };
}

/**
 * 1 フレーム進める。**塗り直しは `requestAnimationFrame` でまとめてある**
 * (52 の docs/27) ので、待たずに見ると印が付く前を見てしまう。
 */
export const nextFrame = (): Promise<void> =>
  new Promise((done) => { requestAnimationFrame(() => { setTimeout(done, 0); }); });
