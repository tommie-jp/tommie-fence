/**
 * 落としたものの控え (service worker)。**電波が無くても開ける**ようにするための
 * もので、無くても頁は今までどおり動く (52 の docs/35)。
 *
 * **先読みはしない。** 束ねた塊の名前は中身のハッシュ (`chunk-4MVEINWC.js`) で
 * 組み立てのたびに変わるので、先読みの一覧を作ると組み立てと二重管理になる。
 * 一度通った道を控えるだけで、2 回目から offline で開ける。
 *
 * **頁そのものは網が先。** 控えを先に返すと、新しく上げたものが出てこない
 * (playground は直すたびに上がる)。網が駄目なときだけ控えから返す。
 *
 * 版は組み立てが差し込む。**版が変わったら古い控えは捨てる。**
 */

const VERSION = '__BUILD__';
const CACHE = `tommie-fence-${VERSION}`;

self.addEventListener('install', () => {
  // 待たずに入れ替わる (次に開いたときには新しいほうが動いている)。
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('tommie-fence-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

/** 控えに入れる。**入らなくても構わない** (容量の上限に当たることがある)。 */
async function keep(request, response) {
  if (!response.ok) return;
  try {
    const box = await caches.open(CACHE);
    await box.put(request, response.clone());
  } catch {
    // 控えられないだけで、返すものは既にある。
  }
}

/** 網が先 (頁そのもの)。駄目なら控え。 */
async function netFirst(request) {
  try {
    const fresh = await fetch(request);
    await keep(request, fresh);
    return fresh;
  } catch (whyNot) {
    const kept = await caches.match(request);
    if (kept !== undefined) return kept;
    throw whyNot;
  }
}

/** 控えが先 (束ねた塊・資材)。**裏で取り直す**ので、次に開くときは新しい。 */
async function keptFirst(request) {
  const kept = await caches.match(request);
  const coming = fetch(request).then(async (fresh) => {
    await keep(request, fresh);
    return fresh;
  });
  if (kept !== undefined) {
    // 取り直しの失敗は握り潰す (控えを返しているので困らない)。
    coming.catch(() => {});
    return kept;
  }
  return coming;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // 自分の出所のものだけ。外のものは素通し。
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(request.mode === 'navigate' ? netFirst(request) : keptFirst(request));
});
