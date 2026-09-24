#!/usr/bin/env bash
# Built-in deps for rein and agentor-browser. Not an optional extra.
set -euo pipefail
DEPS=(autoconf automake libtool pkgconf libevent openssl@3)
if ! command -v brew >/dev/null 2>&1; then
  echo "brew is required to install built-in deps: ${DEPS[*]}" >&2
  exit 1
fi
brew install "${DEPS[@]}"
