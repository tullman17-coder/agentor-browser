#!/usr/bin/env bash
# Clone the official Tor client. GitHub's torproject/tor mirror no longer
# hosts source; the canonical tree is GitLab.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/third_party/tor-0.4.9.13"
TAG="tor-0.4.9.13"
REMOTE="https://gitlab.torproject.org/tpo/core/tor.git"
EXPECTED="3c575400909efe6599d88e61e7daf0012655ca44"

if [[ -d "$DEST/.git" ]]; then
  echo "already vendored: $DEST"
  git -C "$DEST" rev-parse HEAD
  exit 0
fi

mkdir -p "$ROOT/third_party"
git clone --depth 1 --branch "$TAG" "$REMOTE" "$DEST"
ACTUAL="$(git -C "$DEST" rev-parse HEAD)"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "refusing unexpected commit: $ACTUAL (wanted $EXPECTED)" >&2
  exit 1
fi
echo "vendored $TAG $ACTUAL"
