/**
 * CLI 専用の入口 (`fence-kit/cli`)。**ここから辿れるものだけが Node の API を
 * 使ってよい** — 本体の入口 (`fence-kit`) はプレビューにも webview にも束ねられる
 * ので、DOM も Node も使わない約束のまま保つ (`purity.test.ts` が見張る)。
 */
export { collectFiles, isYamlInput, readInput } from './files.ts';
export type { Input } from './files.ts';
export { reportNetlist } from './report.ts';
export type { NetLine } from './report.ts';
export { parseCliArgs } from './args.ts';
export type { ArgsResult, CliCommand, CliVerb } from './args.ts';
