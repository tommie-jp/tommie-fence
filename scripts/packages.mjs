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

// 拡張を持つもの。**`"vsix": false` は既定から外す** — 3 つを 1 つに畳んだ
// tommie-fence がこれで、配ると決めるまでは古い 3 つと同時に入ってしまう
// (52 の docs/19。作るだけなら `make tommie-fence` で作れる)。
const withContributes = packages.filter((name) => manifests.get(name).contributes)
const held = withContributes.filter((name) => manifests.get(name).vsix === false)
const extensions = withContributes.filter((name) => !held.includes(name))

// **入れ子の依存も辿る。** 畳んだ拡張は 3 つのコアに依存し、そのコアは
// fence-kit に依存する (52 の docs/19)。作業場には全部を並べて置き、
// **どれの package.json も `file:../<名前>` を指す**ように書き換える
// (`scripts/vsix.sh`)。並びは**依存が先** — 写す順にそのまま使える。
const allDeps = (name, seen = new Set()) => {
  for (const dep of workspaceDeps(name)) {
    if (seen.has(dep)) continue
    allDeps(dep, seen)
    seen.add(dep)
  }
  return [...seen]
}

const lines = [
  '# scripts/packages.mjs が作る。手で直さない。',
  `PACKAGES := ${packages.join(' ')}`,
  `EXTENSIONS := ${extensions.join(' ')}`,
  // 作れるが既定では作らないもの。規則は作るので `make <名前>` は効く。
  `HELD := ${held.join(' ')}`,
]
for (const name of [...extensions, ...held]) {
  const pkg = manifests.get(name)
  lines.push(`VSIX_${name} := ${pkg.name}-${pkg.version}.vsix`)
}
for (const name of packages) {
  lines.push(`WSDEPS_${name} := ${allDeps(name).join(' ')}`)
}
process.stdout.write(lines.join('\n') + '\n')
