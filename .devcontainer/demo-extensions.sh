#!/usr/bin/env bash
#
# デモ用の Codespace に拡張を入れる。
#
#   .devcontainer/demo-extensions.sh fetch     Releases から .vsix を落とす
#   .devcontainer/demo-extensions.sh install   入っていないものを VS Code に入れる
#
# **公開済みの版だけを見せる。** ソースからは組まない — デモで見せるのは
# リリースした版で、main の途中ではない。npm install も要らないぶん起動が速い。
#
# 落とし先はパッケージ名だけの固定名 (`circuit-fence.vsix`)。版が上がっても
# devcontainer.json を直さずに済む。
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="${FENCE_REPO:-tommie-jp/tommie-fence}"
PACKAGES=(circuit-fence breadboard-fence perfboard-fence)
VSIX_DIR=".devcontainer/vsix"
API="https://api.github.com/repos/${REPO}/releases?per_page=100"

# 公開リポジトリなので認証は要らない。ただし無認証は 1 時間 60 回で頭打ちに
# なるので、Codespaces が渡してくる token があれば使う (5,000 回に上がる)。
curl_api() {
  local auth=()
  [ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  curl -fsSL "${auth[@]}" -H 'Accept: application/vnd.github+json' "$1"
}

# パッケージごとに、いちばん新しいタグと .vsix の URL を選ぶ。
# タグは `<パッケージ>-v<版>` (リポジトリ直下の CLAUDE.md の約束 4)。
# 版の比較は数として行う — 文字列順だと v0.10.0 が v0.9.0 より古いことになる。
pick_releases() {
  node -e '
    const wanted = process.argv.slice(1);
    let releases = [];
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      releases = JSON.parse(raw);
      for (const pkg of wanted) {
        const prefix = `${pkg}-v`;
        const mine = releases
          .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(prefix))
          .map((r) => ({
            tag: r.tag_name,
            parts: r.tag_name.slice(prefix.length).split(".").map(Number),
            asset: (r.assets ?? []).find((a) => a.name.endsWith(".vsix")),
            sums: (r.assets ?? []).find((a) => a.name === "SHA256SUMS"),
          }))
          .filter((r) => r.asset && r.parts.every(Number.isFinite))
          .sort((a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]);
        if (mine.length === 0) {
          console.error(`${pkg}: リリースが見つかりません`);
          process.exitCode = 1;
          continue;
        }
        const [newest] = mine;
        process.stdout.write([
          pkg, newest.tag, newest.asset.name,
          newest.asset.browser_download_url, newest.sums?.browser_download_url ?? "-",
        ].join("\t") + "\n");
      }
    });
  ' "$@"
}

fetch() {
  mkdir -p "$VSIX_DIR"
  local releases work
  releases="$(curl_api "$API" | pick_releases "${PACKAGES[@]}")"

  # 落とす途中のものは作業場に置く。**元の名前のまま**受けて確かめる
  # (SHA256SUMS が元の名前で書かれているため)。確かめてから固定名へ移す。
  work="$(mktemp -d)"
  # 単引用符にすると、抜けるときには関数の外に居て `work` が読めない
  # (`local` はその関数の中だけ)。**仕掛けるときに展開する。**
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" EXIT

  local pkg tag name url sums stamp
  while IFS=$'\t' read -r pkg tag name url sums; do
    stamp="$VSIX_DIR/$pkg.tag"
    if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$tag" ] && [ -f "$VSIX_DIR/$pkg.vsix" ]; then
      echo "==> $pkg $tag は取得済み"
      continue
    fi

    echo "==> $pkg $tag を落とす"
    curl -fsSL -o "$work/$name" "$url"
    if [ "$sums" != "-" ]; then
      curl -fsSL -o "$work/SHA256SUMS" "$sums"
      (cd "$work" && sha256sum -c SHA256SUMS)
    else
      echo "    SHA256SUMS が無いので中身を確かめずに使います" >&2
    fi

    mv "$work/$name" "$VSIX_DIR/$pkg.vsix"
    echo "$tag" > "$stamp"
    rm -f "$work/SHA256SUMS"
  done <<< "$releases"
}

# 使える VS Code の CLI を探して `CODE` に置き、入っている拡張を `INSTALLED` に読む。
#
# **動くかどうかは呼んでみないと分からない。** devcontainers の image には
# `code` という名前の橋渡しが置いてあり、VS Code が繋がっていなければ
# 「入っていません」と言って 127 を返す (繋がっていれば本物へ渡す)。
# `command -v code` では見分けられないので、`--list-extensions` を試して決める。
CODE=""
INSTALLED=""
probe_code() {
  local candidate
  for candidate in \
    "$(command -v code || true)" \
    "$HOME"/.vscode-server/bin/*/bin/remote-cli/code \
    "$HOME"/.vscode-remote/bin/*/bin/remote-cli/code \
    /vscode/vscode-server/bin/*/bin/remote-cli/code; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    if INSTALLED="$("$candidate" --list-extensions 2>/dev/null)"; then
      CODE="$candidate"
      return 0
    fi
  done
  return 1
}

# devcontainer.json の `extensions` に .vsix のパスを書いてあるので、ふつうは
# ここへ来る前に入っている。**入っていなかったときの保険**として、
# 足りないものだけを入れる。
#
# **ここで失敗しても止めない。** postAttachCommand が 0 以外を返すと
# VS Code は残りの手順を飛ばしてエラーを出すが、こちらは保険なので、
# 入れられない事情 (CLI が居ない・入れ直しに失敗した) は文面で伝えて先へ進む。
install() {
  if ! probe_code; then
    echo "==> VS Code の CLI が見つかりません。拡張が入っていなければ、拡張ビュー" >&2
    echo "    (Ctrl+Shift+X) の ... →「VSIX からのインストール」で" >&2
    echo "    $VSIX_DIR/*.vsix を入れてください" >&2
    return 0
  fi

  local pkg
  for pkg in "${PACKAGES[@]}"; do
    if printf '%s\n' "$INSTALLED" | grep -qix "tommie.$pkg"; then continue; fi
    if [ ! -f "$VSIX_DIR/$pkg.vsix" ]; then
      echo "==> $VSIX_DIR/$pkg.vsix が無いので入れられません" >&2
      echo "    .devcontainer/demo-extensions.sh fetch を先に走らせてください" >&2
      continue
    fi
    echo "==> $pkg を入れます (devcontainer.json の指定では入らなかった)"
    if ! "$CODE" --install-extension "$VSIX_DIR/$pkg.vsix" --force; then
      echo "==> $pkg を入れられませんでした。拡張ビューから手で入れてください" >&2
    fi
  done
}

case "${1:-}" in
  fetch) fetch ;;
  install) install ;;
  *) echo "使い方: $0 fetch | install" >&2; exit 2 ;;
esac
