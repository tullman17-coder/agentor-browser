# Upstream source

AGENTOR Browser is built on the official Tor client, not a reimplementation of the Tor protocol.

| Component | Source | Pin |
| --- | --- | --- |
| Tor | https://gitlab.torproject.org/tpo/core/tor | `tor-0.4.9.13` (`3c575400909efe6599d88e61e7daf0012655ca44`) |

The GitHub project at https://github.com/torproject/tor is an unofficial mirror. Its `main` branch no longer contains source and redirects to the GitLab repository above. This tree vendors the GitLab tag so the client can be configured and compiled locally.

Tor is distributed under the 3-clause BSD license. See `third_party/tor-0.4.9.13/LICENSE` after `./scripts/vendor-tor.sh`. Do not modify vendored Tor except through an explicit patch recorded in `third_party/patches/`.
