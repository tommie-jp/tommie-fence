import type { Scene, SceneFence } from 'fence-kit';
import { checkScene } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { FigureResult } from './report.ts';

/** フェンス 1 つ。`line` は開き記号の行 (Markdown の 1 始まり)。 */
export type FenceInput = {
  readonly fence: SceneFence;
  readonly source: string;
  readonly line: number;
};

/** フェンスの中身から幾何を起こす関数 (3 つのフェンスの core が持つ)。 */
export type SceneMakers = Readonly<Record<SceneFence, (source: string) => readonly Scene[]>>;

const TITLE_LINE = /^title:\s*(.+?)\s*$/m;

/** 図の題 (`title:` の行)。引用符は外す。書いていなければ null。 */
export function titleOf(source: string): string | null {
  const matched = TITLE_LINE.exec(source);
  if (matched === null) return null;
  return matched[1]!.replace(/^(["'])(.*)\1$/, '$2');
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * フェンス 1 つを検査する。`sheets:` の図は枚ごとに 1 件。
 * **読めないフェンスで止まらない** — 1,600 個を一括で回すので、落ちたものは
 * `failure` に理由を残して次へ進む。
 */
export function checkFence(
  file: string,
  input: FenceInput,
  makers: SceneMakers,
  options: CheckOptions = {},
): readonly FigureResult[] {
  const title = titleOf(input.source);
  const base = { file, line: input.line, fence: input.fence, title };
  let scenes: readonly Scene[];
  try {
    scenes = makers[input.fence](input.source);
  } catch (error) {
    return [{ ...base, sheet: null, findings: [], skipped: 0, failure: reason(error) }];
  }
  return scenes.map((scene) => ({
    ...base,
    sheet: scene.sheet,
    findings: checkScene(scene, options),
    skipped: scene.skipped,
    failure: null,
  }));
}
