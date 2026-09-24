import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ControlClient } from "../src/control.ts";

test("control client keeps mid-line GETINFO data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentor-ctl-"));
  const cookie = join(dir, "cookie");
  await writeFile(cookie, Buffer.from("abcd", "hex"));
  const server = createServer((socket) => {
    socket.on("data", (chunk) => {
      const line = chunk.toString("utf8");
      if (line.startsWith("AUTHENTICATE")) socket.write("250 OK\r\n");
      if (line.startsWith("GETINFO")) {
        socket.write(
          '250-status/bootstrap-phase=NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY="Done"\r\n250 OK\r\n',
        );
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const client = await ControlClient.connect(port, cookie);
  const reply = await client.raw("GETINFO status/bootstrap-phase");
  assert.match(reply, /PROGRESS=100/);
  assert.match(reply, /SUMMARY="Done"/);
  client.close();
  await new Promise((resolve) => server.close(resolve));
});
