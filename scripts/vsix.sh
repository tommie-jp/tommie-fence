#!/usr/bin/env bash
#
# パッケージ 1 つを作業場へ写して .vsix に詰める。**Makefile から呼ばれる。**
# いつ呼ぶか (作り直しが要るかどうか) は Makefile が決める。手で呼ぶなら:
#
#   scripts/vsix.sh install circuit-fence                     作業場に依存を入れる
#   scripts/vsix.sh package circuit-fence path/to/out.vsix    .vsix を作る
#
# なぜ隔離して詰めるか: npm workspaces は依存をリポジトリ直下の node_modules へ
# 巻き上げる。すると `vsce package` はパッケージの外へ依存を探しに行き、同じ
# ファイルを 2 通りの経路で拾って「同じパスが 2 つある」と言って止まる。
# パッケージ単体を作業場へ写して単独で install すれば、単一リポジトリだった頃と
# 同じ形になり、これが起きない。詳しくは 52 の docs/03。
#
# なぜ作業場を残すか: 以前は mktemp -d で毎回作って毎回捨てていた。.build/stage に
# 残すと、2 回目からの `npm install` が 5.4 秒 → 0.6 秒になる (依存の解決が済んで
# いるため)。捨てるのは `make clean`。**残すぶん、依存の版は package.json を
# 直すまで固定される。** 入れ直したいときも `make clean`。
set -euo pipefail

cd "$(dirname "$0")/.."
root="$PWD"
build="${BUILD:-.build}"

mode="${1-}"
pkg="${2-}"
if [ -z "$mode" ] || [ -z "$pkg" ]; then
  echo "使い方: scripts/vsix.sh install|package <パッケージ> [出力先]" >&2
  exit 2
fi
if [ ! -f "packages/$pkg/package.json" ]; then
  echo "packages/$pkg がありません" >&2
  exit 2
fi

# 作業場はパッケージごとに分ける。依存 (fence-kit) の写しを隣に置くので、
# 1 つの場所を共有すると `make -j` で同時に書き合って壊れる。
stage="$root/$build/stage/$pkg"

# 依存のうち、このモノレポの中にあるもの (fence-kit など)。
# モノレポ内の依存を**辿れるだけ辿る**。畳んだ拡張は 3 つのコアに依存し、
# コアは fence-kit に依存する (52 の docs/19)。並びは依存が先 —
# 写す順にそのまま使える。
workspace_deps() {
  node -p "
    const fs = require('fs');
    const read = (name) => require('$root/packages/' + name + '/package.json');
    const seen = new Set();
    const walk = (name) => {
      const pkg = read(name);
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (!fs.existsSync('$root/packages/' + dep) || seen.has(dep)) continue;
        walk(dep);
        seen.add(dep);
      }
    };
    walk('$1');
    [...seen].join('\n')
  "
}

# パッケージを 1 つ、写す先へ丸ごと写す。
# **消えたファイルを残さない**ため、写す前に中身を捨てる。ただし node_modules と
# package-lock.json は残す — この 2 つが残っているから 2 回目の install が速い。
# dist と生成物は写さない (vsce が prepublish で作り直す)。
copy_tree() {
  local name="$1" dest="$2"
  mkdir -p "$dest"
  find "$dest" -mindepth 1 -maxdepth 1 \
    ! -name node_modules ! -name package-lock.json \
    -exec rm -rf {} +
  tar -C "packages/$name" \
    --exclude=./node_modules --exclude=./dist --exclude=./coverage \
    --exclude='./*.vsix' --exclude='./*.tgz' \
    -cf - . | tar -C "$dest" -xf -
}

deps="$(workspace_deps "$pkg")"

# 作業場を、いまのソースと同じ中身にする。
sync_stage() {
  copy_tree "$pkg" "$stage/$pkg"
  for dep in $deps; do
    copy_tree "$dep" "$stage/$dep"
  done
  # 作業場には workspaces の親が無いので `*` は npm を探しに行って失敗する。
  # 隣に置いた実体を file: で指す形に書き換える。**依存の側も書き換える** —
  # コアが fence-kit を `*` で指したままだと、そこで探しに行って落ちる。
  # **依存の一覧は環境変数で渡す。** 改行を含むので、字の中に埋めると壊れる。
  WSDEPS="$deps" node -e "
    const fs = require('fs');
    const names = (process.env.WSDEPS ?? '').split(/\s+/).filter(Boolean);
    for (const who of ['$pkg', ...names]) {
      const f = '$stage/' + who + '/package.json';
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const field of ['dependencies', 'devDependencies']) {
        for (const dep of names) {
          if (j[field]?.[dep]) j[field][dep] = 'file:../' + dep;
        }
      }
      fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
    }
  "
}

case "$mode" in
  install)
    echo "==> $pkg: 作業場に依存を入れる (単独のリポジトリと同じ形にする)"
    sync_stage
    # devDependencies も要る。vsce が prepublish で esbuild を呼ぶため。
    # パッケージが単体で install できる状態を保つのは、この段取りの前提。
    # --install-links: file: の依存を実体で置く (symlink だと vsce が辿れない)。
    (cd "$stage/$pkg" && npm install --install-links --no-audit --no-fund --silent)
    ;;

  package)
    out="${3-}"
    if [ -z "$out" ]; then
      echo "出力先を書いてください: scripts/vsix.sh package $pkg <出力先>" >&2
      exit 2
    fi
    case "$out" in /*) ;; *) out="$root/$out" ;; esac

    sync_stage

    # **npm は file: の依存を「中身が変わっただけ」では写し直さない** (実測)。
    # 版が同じなら入れ直しを飛ばすため。束ねられるのは node_modules の側なので、
    # ここで写し直さないと fence-kit の直しが .vsix に入らない。
    for dep in $deps; do
      # 入っていないのに黙って進むと、fence-kit の直しが**入っていない** .vsix が
      # 成功として出てくる。気づけないので、ここで止める。
      if [ ! -d "$stage/$pkg/node_modules/$dep" ]; then
        echo "作業場に $dep が入っていません ($stage/$pkg/node_modules/$dep)。" >&2
        echo "作業場が壊れています。make clean で捨ててからやり直してください" >&2
        exit 1
      fi
      copy_tree "$dep" "$stage/$pkg/node_modules/$dep"
    done

    # vsce は README の相対リンクを絶対 URL へ書き換える。基準の既定はリポジトリの
    # 直下なので、モノレポでは `packages/<パッケージ>` の分だけ足りず、Marketplace と
    # 拡張ページの図が 404 になる (単一リポジトリだった頃は既定で合っていた)。
    # package.json の repository.directory から基準を作って渡す。
    read -r base_content base_images <<<"$(node -p "
      const p = require('$root/packages/$pkg/package.json');
      const url = String(p.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git\$/, '');
      if (!url) throw new Error('packages/$pkg/package.json に repository.url がありません');
      const dir = p.repository?.directory ? '/' + p.repository.directory : '';
      [url + '/blob/HEAD' + dir, url + '/raw/HEAD' + dir].join(' ');
    ")"

    echo "==> $pkg: $(basename "$out") を作る (README の相対リンクの基準: $base_content)"
    # vsce package が vscode:prepublish (esbuild --production) を呼ぶ。
    (cd "$stage/$pkg" && npx vsce package \
      --baseContentUrl "$base_content" \
      --baseImagesUrl "$base_images" \
      --out "$out")
    ;;

  *)
    echo "知らない指示です: $mode (install / package が使えます)" >&2
    exit 2
    ;;
esac
