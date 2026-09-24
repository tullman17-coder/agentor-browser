# AGENTOR Browser

An agent-facing Tor browser backend. It builds the official Tor client, exposes HTTP and HTTPS scraping through that client, and registers as a native [Pi](https://pi.dev/docs/latest) package.

```
Pi agent
  └─ extensions/index.ts          tor_fetch, tor_status, tor_stop
       └─ src/fetch.ts            SOCKS5 + TLS
            └─ third_party/tor-install/bin/tor
                 built from gitlab.torproject.org/tpo/core/tor tag tor-0.4.9.13
```

Tor Browser itself is a patched Firefox application. This project is the agent equivalent: a headless client that fetches `http://` and `https://` (clearnet and `.onion`) over a circuit from the Tor Project source tree. It does not reimplement onion routing.

## Source pin

| | |
| --- | --- |
| Canonical repo | https://gitlab.torproject.org/tpo/core/tor |
| Tag | `tor-0.4.9.13` |
| Commit | `3c575400909efe6599d88e61e7daf0012655ca44` |
| GitHub | https://github.com/torproject/tor is an unofficial mirror. `main` no longer contains source. |

## Build

```bash
brew install autoconf automake libtool pkgconf libevent openssl@3
npm install
npm run build:tor
```

`scripts/build-tor.sh` runs `./autogen.sh`, configures with advisory warnings and hardening probes disabled (those probes take many minutes on current Clang), and installs into `third_party/tor-install`.

## Use from Pi

Pi discovers this directory as a package because `package.json` has a `pi` manifest and the `pi-package` keyword. From a trusted project:

```bash
pi install ./AGENTOR-BROWSER
```

Or load it once:

```bash
pi -e ./extensions/index.ts
```

Tools:

| Tool | What it does |
| --- | --- |
| `tor_fetch` | GET an `http` or `https` URL through Tor and return readable text |
| `tor_status` | Bootstrap progress of the local client |
| `tor_stop` | `SIGNAL SHUTDOWN` on the client this package started |

The skill `tor-browse` tells the model when to use them.

## Use from the command line

```bash
node bin/agentor.js daemon 8765
curl -s http://127.0.0.1:8765/v1/status
curl -s -X POST http://127.0.0.1:8765/v1/fetch \
  -H 'content-type: application/json' \
  -d '{"url":"https://check.torproject.org/api/ip"}'
node bin/agentor.js fetch https://example.com
```

The daemon binds to `127.0.0.1` only. Fetches go out through a local SOCKS5 port so DNS, including `.onion`, is resolved by Tor (`Socks5ProxyAgent`).

## Protocols

0.4.8.25 warned that the live consensus recommends `Desc=3-4`, `Microdesc=3`, and `Relay=5-6`, which that series does not implement. Authorities now reject 0.4.8.x. This package is built from 0.4.9.13, whose supported list is `Desc=1-4`, `Microdesc=1-3`, `Relay=2-6`. A bootstrap of that binary produced no missing-protocol warning.

The scraper refuses credentials embedded in URLs, loopback, link-local, and private addresses before opening a circuit. It does not forward `Cookie` or `Authorization` headers. It is a page fetcher, not a general proxy for other programs.

## Tests

```bash
npm test
```

Policy and HTML extraction run without a network. A live circuit test is skipped unless `AGENTOR_LIVE=1`.
