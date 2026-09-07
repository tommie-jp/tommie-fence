#!/usr/bin/env bash
#
# playground を手元のブラウザで動かす。
#
# なぜ要るか: dist を file:// で開いても動かない。app.js (ES モジュール) も
# examples.json も TeX の資材も**同じ出所 (origin)** を要るので、直に開くと
# CORS と fetch で断られ、例の一覧が空になり circuit の図が出ない。
# 組み立てとサーバ起動が 1 セットなので、その 1 セットをここに置く。
#
#   ./doPlayground.sh                 組み立ててから 8765 番で出す (既定)
#   ./doPlayground.sh --port 9000     番号を変える
#   ./doPlayground.sh --no-build      組み立てずに、今の dist をそのまま出す
#   ./doPlayground.sh --stop          出しているサーバを止める
#   ./doPlayground.sh -h              この説明を出す
#
# 止めるのは Ctrl+C か、別の端末から ./doPlayground.sh --stop。
# **組み直したらブラウザを強制リロードする** (チャンク名が中身のハッシュなので、
# 古い app.js を持っていると消えた名前を取りに行って 404 になる)。
set -euo pipefail

cd "$(dirname "$0")"
self="$(basename "$0")"

port=8765
do_build=1
do_stop=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      port="${2-}"
      [ -n "$port" ] || { echo "--port には番号が要ります" >&2; exit 2; }
      shift
      ;;
    --port=*) port="${1#--port=}" ;;
    --no-build) do_build=0 ;;
    --stop) do_stop=1 ;;
    -h|--help) sed -n '3,18p' "$self" | sed 's/^#\( \|$\)//'; exit 0 ;;
    *) echo "知らない引数です: $1 (--port / --no-build / --stop が使えます)" >&2; exit 2 ;;
  esac
  shift
done

case "$port" in
  ''|*[!0-9]*) echo "番号が数ではありません: $port" >&2; exit 2 ;;
esac

# 出しっぱなしのサーバを畳む。**番号で見分ける** — 別の番号で出している
# playground は残す (2 つ並べて見比べることがある)。
stop_server() {
  pkill -f "http.server $port --bind 127.0.0.1" 2>/dev/null || true
}

if [ "$do_stop" -eq 1 ]; then
  stop_server
  echo "$port 番のサーバを止めました"
  exit 0
fi

dist="packages/playground/dist"

if [ "$do_build" -eq 1 ]; then
  npm run build --workspace=playground
fi

if [ ! -f "$dist/index.html" ]; then
  echo "$dist/index.html がありません (--no-build を外して組み立ててください)" >&2
  exit 1
fi

# 前に出したものが残っていると「番号が使われています」で落ちるので、先に畳む。
stop_server

echo "http://127.0.0.1:$port/ を開いてください (止めるのは Ctrl+C)"
exec python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dist"
