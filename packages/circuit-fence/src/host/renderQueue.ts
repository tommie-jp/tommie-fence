import { fenceError } from '../core/errors.ts';
import { texErrors } from '../core/tex/texLog.ts';
import type { FenceError } from '../core/index.ts';

/**
 * TeX を SVG にする人。node-tikzjax を呼ぶ実物と、テストの偽物を差し替えられる
 * ように、ここでは形だけ決める (Phase 3 で子プロセス版に差し替える口でもある)。
 */
export type TexRenderer = (tex: string) => Promise<RenderOutcome>;

export type RenderOutcome =
  | { readonly ok: true; readonly svg: string }
  | {
      /** TeX が動いて落ちた。ログから行番号を引き戻せる。 */
      readonly ok: false;
      readonly kind: 'tex-log';
      readonly log: string;
      /** エンジンがフェンスの前に置くプリアンブルの行数。TeX の行番号のずれ。 */
      readonly preambleLines: number;
    }
  | {
      /** そもそも TeX を動かせなかった (web 版など)。落ちた行は無い。 */
      readonly ok: false;
      readonly kind: 'message';
      readonly message: string;
    };

/** 描けた図か、描こうとして分かった理由。どちらもキャッシュに載せる。 */
export type CacheEntry = { readonly svg: string } | { readonly errors: readonly FenceError[] };

export type RenderQueue = {
  /** 描けているか見る。markdown-it から**同期で**呼ぶのでここは待たない。 */
  readonly lookup: (hash: string) => CacheEntry | undefined;
  /** まだ描いていなければ描く順番に積む。 */
  readonly enqueue: (hash: string, tex: string, lineMap: ReadonlyMap<number, number>) => void;
};

export type QueueOptions = {
  readonly render: TexRenderer;
  /** 1 枚描き終わるたびに呼ぶ。プレビューに描き直させるための合図。 */
  readonly onDrawn: () => void;
  /** 覚えておく図の枚数。 */
  readonly limit?: number;
};

const DEFAULT_LIMIT = 100;

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 図を 1 枚ずつ描いて覚えておく。
 *
 * **必ず 1 枚ずつ**描く。node-tikzjax は書き換え可能なグローバルを持つ
 * シングルトンなので、同時に 2 枚描くと互いの状態を壊す。
 * 打ち切り (タイムアウト) は置かない。待つのをやめても WASM 側は動き続けるため、
 * 次の 1 枚と混ざって同じ事故になる。止められるようにするには
 * 別プロセスに追い出す必要があり、それは Phase 3。
 */
export function createRenderQueue(options: QueueOptions): RenderQueue {
  const { render, onDrawn, limit = DEFAULT_LIMIT } = options;
  const cache = new Map<string, CacheEntry>();
  const pending = new Set<string>();
  let chain: Promise<void> = Promise.resolve();

  const remember = (hash: string, entry: CacheEntry): void => {
    cache.set(hash, entry);
    // 見ていない期間が最も長いものから落とす (Map は入れた順に並ぶ)。
    while (cache.size > limit) {
      const oldest = cache.keys().next();
      if (oldest.done === true) break;
      cache.delete(oldest.value);
    }
  };

  const lookup = (hash: string): CacheEntry | undefined => {
    const entry = cache.get(hash);
    // 引いたものは新しい側へ移して、使われている図から落とさないようにする。
    if (entry !== undefined) {
      cache.delete(hash);
      cache.set(hash, entry);
    }
    return entry;
  };

  const entryFor = (outcome: RenderOutcome, lineMap: ReadonlyMap<number, number>): CacheEntry => {
    if (outcome.ok) return { svg: outcome.svg };
    return outcome.kind === 'tex-log'
      ? { errors: withFallback(texErrors(outcome.log, lineMap, outcome.preambleLines)) }
      : { errors: [fenceError(outcome.message, null)] };
  };

  const draw = async (hash: string, tex: string, lineMap: ReadonlyMap<number, number>): Promise<void> => {
    try {
      remember(hash, entryFor(await render(tex), lineMap));
    } catch (error) {
      // 描けなかったことも覚える。覚えないと毎回のプレビューで描き直しにいく。
      remember(hash, { errors: [fenceError(`図を描けませんでした: ${reason(error)}`, null)] });
    } finally {
      pending.delete(hash);
      // 図が出ないままでも、理由を出すために描き直させる。
      try {
        onDrawn();
      } catch {
        // 知らせられなくても次の 1 枚は描く。
      }
    }
  };

  const enqueue = (hash: string, tex: string, lineMap: ReadonlyMap<number, number>): void => {
    if (cache.has(hash) || pending.has(hash)) return;
    pending.add(hash);
    // 1 枚の失敗で列ごと止めない。ここで受けておかないと、以降の
    // chain.then() が二度と走らず、全部のフェンスが「描いています」で固まる。
    chain = chain.then(() => draw(hash, tex, lineMap)).catch(() => {
      pending.delete(hash);
    });
  };

  return { lookup, enqueue };
}

/** ログから理由を 1 つも拾えなかったときに、黙って空の帯を出さないための保険。 */
const withFallback = (errors: readonly FenceError[]): readonly FenceError[] =>
  errors.length > 0 ? errors : [fenceError('図を描けませんでしたが、理由を読み取れませんでした', null)];
