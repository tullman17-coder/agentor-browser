import assert from "node:assert/strict";
import test from "node:test";
import { fetchViaTor } from "../src/fetch.ts";
import { shutdownTor } from "../src/tor.ts";

const live = process.env.AGENTOR_LIVE === "1";

test("live check.torproject.org", { skip: !live }, async () => {
  const result = await fetchViaTor({
    url: "https://check.torproject.org/api/ip",
    format: "text",
    timeoutMs: 90_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.IsTor, true);
  await shutdownTor();
});
