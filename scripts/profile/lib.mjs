// プロファイルの道具の共通部分 (52 の docs/162)。**本体には手を入れない** — 外から呼んで測るだけ。
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

export const ROOT = new URL('../../', import.meta.url);
export const OUT = new URL('.build/profile/', ROOT);

/** 結果を置く (`.build/profile/<名前>.json`。`.build/` は追跡しない)。 */
export function save(name, value) {
  mkdirSync(OUT, { recursive: true });
  const url = new URL(`${name}.json`, OUT);
  writeFileSync(url, `${JSON.stringify(value, null, 1)}\n`);
  return url.pathname;
}

export const packages = () => readdirSync(new URL('packages/', ROOT), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(new URL(`packages/${entry.name}/package.json`, ROOT)))
  .map((entry) => entry.name).sort();

export const manifest = (name) => JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, ROOT), 'utf8'));

/**
 * コマンドを 1 回走らせ、掛かった時間 (秒) と最大のメモリ (MB) を返す。`/usr/bin/time` の `%e %M` を使う
 * (子の子まで含めた最大の常駐メモリ。Node の中からは測れない)。
 */
export function timed(command, args, cwd) {
  const run = spawnSync('/usr/bin/time', ['-f', '\n__TIME__ %e %M', command, ...args], {
    cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const line = /__TIME__ ([\d.]+) (\d+)/.exec(run.stderr ?? '');
  return {
    ok: run.status === 0,
    seconds: line === null ? null : Number(line[1]),
    megabytes: line === null ? null : Math.round(Number(line[2]) / 1024),
  };
}

/** 中央値と 95 パーセンタイル (時間は 1 回の値で判断しない)。 */
export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { n: sorted.length, min: sorted[0], median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/** Markdown の表 (メモに貼る形)。 */
export function table(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

export const round = (value, digits = 2) => (value === null || value === undefined ? '—' : Number(value.toFixed(digits)).toString());
