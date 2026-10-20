#!/usr/bin/env bash
# Builds the GridCraft web app (MIT/Apache-2.0, https://github.com/storytold/gridcraft) with our small
# bridge addition (vendor/gridcraft-host-run.patch: lets the page read/enter cells) into public/gridcraft/.
# Needs Rust, the wasm32-unknown-unknown target and trunk (cargo install trunk --locked).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${GRIDCRAFT_SRC:-$ROOT/.gridcraft-src}"
COMMIT=68e58a2eae462ba997a8ba5a1269e03a79b61136
if [ ! -d "$SRC/.git" ]; then git clone https://github.com/storytold/gridcraft "$SRC"; fi
cd "$SRC" && git fetch -q --depth 1 origin "$COMMIT" 2>/dev/null || true
git checkout -q -f "$COMMIT" && git apply "$ROOT/vendor/gridcraft-host-run.patch"
cd apps/gridcraft-web && trunk build --release
rm -rf "$ROOT/public/gridcraft" && mkdir -p "$ROOT/public/gridcraft" && cp -R "$SRC/dist/web/." "$ROOT/public/gridcraft/"
cp "$SRC/LICENSE-MIT" "$SRC/LICENSE-APACHE" "$SRC/NOTICE" "$ROOT/public/gridcraft/" 2>/dev/null || true
echo "GridCraft built into public/gridcraft ($(du -sh "$ROOT/public/gridcraft" | cut -f1))"
