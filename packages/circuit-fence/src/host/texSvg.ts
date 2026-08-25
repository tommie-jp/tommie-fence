import type { RenderOutcome } from './renderQueue.ts';

/**
 * node-tikzjax (WASM の TeX) を呼ぶ実物。**ここだけが node-tikzjax を知っている**。
 *
 * 落ちた理由は例外に載ってこない (「showConsole を true にしてログを見ろ」と
 * 言われるだけ) ので、落ちたときだけログを出させて描き直す。
 * 拡張ホストは全部の拡張で 1 つのプロセスなので、うまくいっている間は
 * console に触らない (触ると他の拡張のログまで巻き込む)。
 */

type Tex2Svg = (input: string, options?: Record<string, unknown>) => Promise<string>;
type TikzModule = { readonly tex2svg: Tex2Svg; readonly preambleLines: number };

let loading: Promise<TikzModule> | null = null;

const asFunction = (value: unknown): Tex2Svg | null => (typeof value === 'function' ? (value as Tex2Svg) : null);

async function loadModule(): Promise<TikzModule> {
  const namespace = (await import('node-tikzjax')) as unknown as Record<string, unknown>;
  // CommonJS 実装なので、束ね方によって既定の書き出しが 1 段深くなる。
  const direct = asFunction(namespace['default']);
  const nested = asFunction((namespace['default'] as Record<string, unknown> | undefined)?.['default']);
  const tex2svg = direct ?? nested;
  if (tex2svg === null) throw new Error('node-tikzjax の tex2svg を読み込めませんでした');

  const getTexPreamble = namespace['getTexPreamble'] as ((options?: unknown) => string) | undefined;
  // エンジンはフェンスの前にプリアンブルを足す。TeX の行番号はそのぶんずれる。
  const preambleLines = (getTexPreamble?.({}) ?? '\n').split('\n').length - 1;

  return { tex2svg, preambleLines };
}

function moduleOf(): Promise<TikzModule> {
  // 失敗した約束を抱えたままにすると、一度の読み込み失敗でこの回の VS Code が
  // 二度と図を描けなくなる。次に呼ばれたらもう一度試す。
  loading ??= loadModule().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** 落ちた理由を集めるためだけに、console を横取りしてもう一度描く。 */
async function logOf(tex2svg: Tex2Svg, tex: string): Promise<string> {
  const captured: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]): void => {
    captured.push(args.map(String).join(' '));
  };

  try {
    await tex2svg(tex, { showConsole: true });
  } catch {
    // もう一度落ちるのが当たり前。ほしいのはログのほう。
  } finally {
    console.log = original;
  }

  return captured.join('\n');
}

export async function renderTex(tex: string): Promise<RenderOutcome> {
  const { tex2svg, preambleLines } = await moduleOf();

  try {
    return { ok: true, svg: await tex2svg(tex) };
  } catch {
    return { ok: false, kind: 'tex-log', log: await logOf(tex2svg, tex), preambleLines };
  }
}
