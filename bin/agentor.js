#!/usr/bin/env node
import { startServer } from "../src/server.ts";
import { fetchViaTor } from "../src/fetch.ts";
import { shutdownTor, torStatus } from "../src/tor.ts";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "daemon") {
    const port = Number(process.env.AGENTOR_PORT ?? args[0] ?? 0);
    const server = await startServer({ port });
    console.log(JSON.stringify({ listening: `http://127.0.0.1:${server.port}` }));
    process.on("SIGINT", () => {
      void shutdownTor().finally(() => process.exit(0));
    });
  } else if (command === "fetch") {
    const url = args[0];
    if (!url) throw new Error("usage: agentor fetch <http-or-https-url>");
    console.log(JSON.stringify(await fetchViaTor({ url }), null, 2));
  } else if (command === "status") {
    console.log(JSON.stringify(await torStatus(), null, 2));
  } else if (command === "stop") {
    console.log(JSON.stringify({ result: await shutdownTor() }));
  } else {
    console.log(`AGENTOR Browser

  agentor daemon [port]   loopback HTTP API in front of the Tor client
  agentor fetch <url>     GET an http or https URL through Tor
  agentor status          bootstrap and circuit status
  agentor stop            SIGNAL SHUTDOWN on the local client

Built on the official Tor Project client (tor 0.4.8.25).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
