#!/usr/bin/env bash
# Build the official Tor 0.4.9.13 client into third_party/tor-install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/third_party/tor-0.4.9.13"
PREFIX="$ROOT/third_party/tor-install"

if [[ ! -f "$SRC/configure.ac" ]]; then
  "$ROOT/scripts/vendor-tor.sh"
fi

export PATH="/opt/homebrew/opt/libtool/libexec/gnubin:/opt/homebrew/bin:$PATH"

LIBEVENT_DIR="${LIBEVENT_DIR:-/opt/homebrew/opt/libevent}"
OPENSSL_DIR="${OPENSSL_DIR:-/opt/homebrew/opt/openssl@3}"
if [[ ! -d "$LIBEVENT_DIR" ]]; then
  LIBEVENT_DIR="$(pkg-config --variable=prefix libevent 2>/dev/null || true)"
fi
if [[ ! -d "$OPENSSL_DIR" ]]; then
  OPENSSL_DIR="$(pkg-config --variable=prefix openssl 2>/dev/null || true)"
fi

cd "$SRC"
if [[ ! -x ./configure ]]; then
  ./autogen.sh
fi

./configure \
  --prefix="$PREFIX" \
  --disable-asciidoc \
  --disable-unittests \
  --disable-systemd \
  --disable-lzma \
  --disable-zstd \
  --disable-gcc-warnings-advisory \
  --disable-gcc-hardening \
  ${LIBEVENT_DIR:+--with-libevent-dir="$LIBEVENT_DIR"} \
  ${OPENSSL_DIR:+--with-openssl-dir="$OPENSSL_DIR"}

make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
make install
"$PREFIX/bin/tor" --version
