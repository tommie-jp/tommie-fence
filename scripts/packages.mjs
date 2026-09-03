#!/usr/bin/env node
//
// packages/*/package.json を読んで、Makefile が読める形の変数にして書き出す。
//
//   node scripts/packages.mjs > .build/packages.mk
//
// なぜ Make から直に読まないか: Make には JSON を読む手立てが無い。かといって
// パッケージ名や版を Makefile に手で並べると、`doVersion.sh` で版を上げた日に
// 黙って古い名前の .vsix を探しに行く。**出所は package.json 1 つに保つ。**
//
// 書き出すもの:
//   PACKAGES    — packages/ の下の全部 (fence-kit を含む)
//   EXTENSIONS  — 拡張を持つものだけ。contributes があるものがそれ
//   VSIX_<名前> — そのパッケージが吐く .vsix のファイル名
//   WSDEPS_<名前> — 依存のうち、このモノレポの中にあるもの
import { readdirSync, existsSync, readFileSync } from 'node:fs'

const read = (name) =>
  JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'))

const packages = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`packages/${entry.name}/package.json`))
  .map((entry) => entry.name)
  .sort()

const manifests = new Map(packages.map((name) => [name, read(name)]))

// 依存のうち、packages/ の下に実体があるもの (fence-kit など)。
const workspaceDeps = (name) => {
  const pkg = manifests.get(name)
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((dep) => manifests.has(dep))
    .sort()
}

const extensions = packages.filter((name) => manifests.get(name).contributes)

// 入れ子の依存までは面倒を見ない。増えたらここで気づけるように止める
// (作業場へ写す順番を考える必要がある)。
//
// **見るのは拡張だけ。** 写して単独で install するのは .vsix にするものだけで、
// それ以外 (playground) は束ねて終わりなので、写す順番の問題が起きない。
// 全パッケージを見ると、3 つのコアに依存する playground でここが鳴る。
for (const name of extensions) {
  for (const dep of workspaceDeps(name)) {
    const nested = workspaceDeps(dep)
    if (nested.length > 0) {
      throw new Error(
        `${dep} がモノレポ内の依存を持っている (${nested.join(' ')})。写す順番を考える必要がある`,
      )
    }
  }
}

const lines = [
  '# scripts/packages.mjs が作る。手で直さない。',
  `PACKAGES := ${packages.join(' ')}`,
  `EXTENSIONS := ${extensions.join(' ')}`,
]
for (const name of extensions) {
  const pkg = manifests.get(name)
  lines.push(`VSIX_${name} := ${pkg.name}-${pkg.version}.vsix`)
}
for (const name of packages) {
  lines.push(`WSDEPS_${name} := ${workspaceDeps(name).join(' ')}`)
}
process.stdout.write(lines.join('\n') + '\n')
