#!/usr/bin/env bash
# Builds the static app into ./out and copies it into PocketBase's pb_public folder.
#
#   bash scripts/build-and-copy.sh                       one origin: PocketBase serves the app and the API
#   PB_URL=https://api.example.com bash scripts/build-and-copy.sh
#                                                        app on its own host, API on another (see README)
set -euo pipefail
cd "$(dirname "$0")/.."

# Empty means "talk to whatever origin served the page", which is what you want with one origin.
NEXT_PUBLIC_PB_URL="${PB_URL:-}" npx next build

rm -rf pocketbase/pb_public
cp -r out pocketbase/pb_public
if [ -n "${PB_URL:-}" ]; then
  echo "Built for a separate API at $PB_URL. Upload ./out to your static host."
else
  echo "Built. Start PocketBase with:  cd pocketbase && ./pocketbase serve --http=0.0.0.0:8090"
fi
