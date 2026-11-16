import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ライブラリの出口 (`perfboard-fence/core`) の型定義を **1 ファイルに束ねる**。
 * 実装は esbuild が束ねる (`dist/core.mjs` / `core.cjs`) ので、ここは .d.ts 専用。
 *
 * **束ねるのは fence-kit が tgz に入らないから。** 同じモノレポのパッケージで、
 * devDependencies として esbuild に畳まれる (直下の CLAUDE.md の約束 3)。
 * ファイルごとに書き出すと `.d.ts` が `from 'fence-kit'` を指したまま配られ、
 * 使う側では解決できない。**`skipLibCheck: true` の使い手では黙って any に
 * 落ちる**ので、型が消えたことに気づけない (52 の docs/56)。
 *
 * **2 段に分ける** (52 の docs/161)。rollup-plugin-dts に `.ts` を直に読ませると、
 * 型を解く仕組みを抱えたまま束ねるので 1.2 GB 使う。先に `tsc` でファイルごとの
 * `.d.ts` を書き出し (段 1、別のプロセス)、それを束ねる (段 2) と、どちらも 250 MB 以下で済む。
 *
 * `yaml` は外に残す。あちらは dependencies なので、使う側の node_modules に必ず居る。
 */
const HEAP_MB = 512;
const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, 'src/core/index.ts');
// fence-kit の入口 (ソース)。workspaces の symlink を辿った本当の場所が返る。
const kit = fileURLToPath(import.meta.resolve('fence-kit'));
// 一時の置き場。dist は追跡しないが tgz には入るので、終わったら必ず消す。
const work = join(here, 'dist/.dts');

/** 2 つのファイルの共通の親 (tsc の rootDir。書き出した .d.ts はここからの相対で並ぶ)。 */
function commonDir(a, b) {
  const [left, right] = [dirname(a).split(sep), dirname(b).split(sep)];
  let count = 0;
  while (count < left.length && left[count] === right[count]) count += 1;
  return left.slice(0, count).join(sep) || sep;
}

const rootDir = commonDir(entry, kit);
const emitted = (source) => join(work, 'out', relative(rootDir, source)).replace(/\.ts$/, '.d.ts');

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
  // ---- 段 1: tsc でファイルごとの .d.ts を書き出す ----
  // - `paths` で fence-kit をソースへ向ける。node_modules 経由だと tsc は「外のライブラリ」と見て書き出さず、
  //   段 2 が fence-kit の .ts を直に読んで**実装のコードを .d.ts に混ぜる** (実測。circuit と scope で起きた)
  // - `--noCheck`: 型の誤りは `npm run typecheck` が見る。ここは書き出すだけ
  writeFileSync(join(work, 'tsconfig.json'), JSON.stringify({
    extends: join(here, 'tsconfig.dts.json'),
    compilerOptions: {
      noEmit: false, declaration: true, emitDeclarationOnly: true,
      rootDir, outDir: join(work, 'out'), paths: { 'fence-kit': [kit] },
    },
    include: [],
    files: [entry],
  }));
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [`--max-old-space-size=${HEAP_MB}`, tsc, '-p', work, '--noCheck'], { stdio: 'inherit' });

  // ---- 段 2: 書き出した .d.ts を 1 ファイルに束ねる ----
  // rollup は段 1 が終わってから読む (2 つの段のメモリを重ねない)。
  const { rollup } = await import('rollup');
  const { dts } = await import('rollup-plugin-dts');
  const kitTypes = emitted(kit);
  const bundle = await rollup({
    input: emitted(entry),
    external: ['yaml'],
    plugins: [
      // 書き出した .d.ts の中の `from 'fence-kit'` を、段 1 が書き出した fence-kit の .d.ts へ向ける。
      // **向け損ねると external 扱いで素通りする** (落ちない) ので、下で残っていないことを確かめる。
      { name: 'fence-kit-types', resolveId: (id) => (id === 'fence-kit' ? kitTypes : null) },
      // **tsconfig を名指しで渡す。** 渡さないと rollup-plugin-dts は moduleResolution を node10 に落とす。
      dts({ respectExternal: true, tsconfig: resolve(here, 'tsconfig.dts.json') }),
    ],
  });
  const { output } = await bundle.write({ file: join(here, 'dist/types/index.d.ts'), format: 'es' });
  await bundle.close();
  const leaked = output[0].imports.filter((name) => name !== 'yaml');
  if (leaked.length > 0) throw new Error(`束ねた .d.ts に外への import が残りました: ${leaked.join(', ')}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
