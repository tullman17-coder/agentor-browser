---
name: tor-browse
description: Fetch http and https pages, including .onion, through the local Tor client built from official Tor Project source. Use when the user asks to browse, scrape, or read a page over Tor.
---

# Tor browse

Use the `tor_fetch` tool. Do not shell out to `curl` with a proxy, and do not invent a circuit.

1. Call `tor_status` if this session has not already confirmed bootstrap.
2. Call `tor_fetch` with an absolute `http://` or `https://` URL.
3. Quote the returned title, status, and only the text needed to answer.
4. Follow a link with another `tor_fetch` only when the user asked to go deeper.
5. Call `tor_stop` only when the user asks to shut the client down.

The client is Tor 0.4.9.13 from https://gitlab.torproject.org/tpo/core/tor, built by `scripts/build-tor.sh`. GitHub's torproject/tor repository is a stub mirror and is not the build source.

Refusals from the tool are final. Do not retry a blocked local, private, or credentialed URL by rewriting it.
