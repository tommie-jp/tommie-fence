// 束の大きさと内訳を出す (52 の docs/162 の段 2)。esbuild の metafile を読む。**何も書き出さない** (write: false)。
//
//   node scripts/profile/bundle.mjs            拡張 (デスクトップ・web・マップ) と、3 つのフェンスの core
//   node scripts/profile/bundle.mjs --top=30   内訳の行数
//
// 内訳は「束に入ったバイト数」を、パッケージ・ディレクトリの単位にまとめた物。
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { ROOT, round, save, table } from './lib.mjs';

const top = Number(process.argv.find((arg) => arg.startsWith('--top='))?.slice(6) ?? 15);
const pkg = (name) => fileURLToPath(new URL(`packages/${name}/`, ROOT));

const TARGETS = [
  { name: '拡張 (デスクトップ)', cwd: pkg('tommie-fence'), entry: 'src/extension.ts', format: 'cjs', platform: 'node', external: ['vscode', 'node-tikzjax'] },
  { name: '拡張 (web)', cwd: pkg('tommie-fence'), entry: 'src/extension.web.ts', format: 'cjs', platform: 'browser', external: ['vscode'] },
  { name: 'マップ (webview)', cwd: pkg('tommie-fence'), entry: '../fence-kit/src/editor/webview/map.ts', format: 'iife', platform: 'browser', external: [] },
  ...['breadboard-fence', 'perfboard-fence', 'circuit-fence', 'copper-fence', 'vna-fence', 'scope-fence', 'spectrum-fence', 'graph-fence', 'logic-fence'].map((name) => (
    { name: `${name}/core`, cwd: pkg(name), entry: 'src/core/index.ts', format: 'esm', platform: 'neutral', external: ['yaml'] })),
];

/** 入力のパスを、内訳の単位 (パッケージの中のディレクトリ) にまとめる。 */
function groupOf(path) {
  const modules = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path);
  if (modules !== null) return `node_modules/${modules[1]}`;
  const own = /(?:^|\/)packages\/([^/]+)\/(.*)$/.exec(path) ?? /^\.\.\/([^/]+)\/(.*)$/.exec(path);
  if (own !== null) {
    const parts = own[2].split('/');
    return `${own[1]}/${parts.slice(0, Math.min(parts.length - 1, 3)).join('/')}`;
  }
  return path.split('/').slice(0, 3).join('/');
}

const results = [];
for (const target of TARGETS) {
  const result = await build({
    absWorkingDir: target.cwd, entryPoints: [target.entry], bundle: true, write: false, metafile: true, minify: true,
    format: target.format, platform: target.platform, target: 'es2022', external: target.external, logLevel: 'silent', outfile: 'out.js',
  });
  const [output] = Object.values(result.metafile.outputs);
  const bytes = result.outputFiles[0].contents;
  const groups = new Map();
  const files = [];
  for (const [path, input] of Object.entries(output.inputs)) {
    const absolute = path.startsWith('..') || !path.startsWith('packages') ? `packages/${target.cwd.split('/packages/')[1]}${path}` : path;
    const key = groupOf(absolute.replace(/[^/]+\/\.\.\//g, ''));
    groups.set(key, (groups.get(key) ?? 0) + input.bytesInOutput);
    files.push([path, input.bytesInOutput]);
  }
  results.push({
    name: target.name, bytes: bytes.length, gzip: gzipSync(bytes).length,
    groups: [...groups].sort((a, b) => b[1] - a[1]), files: files.sort((a, b) => b[1] - a[1]).slice(0, 40),
  });
}

const kb = (bytes) => round(bytes / 1024, 0);
console.log(table(['束', '大きさ (KB、minify)', 'gzip (KB)'], results.map((one) => [one.name, kb(one.bytes), kb(one.gzip)])));
for (const one of results.filter((result) => ['拡張 (デスクトップ)', 'breadboard-fence/core', 'circuit-fence/core'].includes(result.name))) {
  console.log(`\n### ${one.name} の内訳 (上位 ${top})\n`);
  console.log(table(['どこ', 'KB', '割合'], one.groups.slice(0, top).map(([key, bytes]) => [key, kb(bytes), `${round((bytes / one.bytes) * 100, 1)} %`])));
  console.log(`\n大きいファイル: ${one.files.slice(0, 8).map(([path, bytes]) => `${path.split('/').slice(-2).join('/')} ${kb(bytes)} KB`).join('、')}`);
}
console.error(`→ ${save('bundle', { when: new Date().toISOString(), results })}`);
