import assert from "node:assert/strict";
import test from "node:test";
import { extractPage } from "../src/extract.ts";
import { parseTarget, PolicyError } from "../src/policy.ts";

test("accepts clearnet http and https", () => {
  assert.equal(parseTarget("https://example.com/a").scheme, "https");
  assert.equal(parseTarget("http://example.com").onion, false);
});

test("accepts onion hosts", () => {
  const target = parseTarget("http://expyuzz4wqqyqjk.onion/index.html");
  assert.equal(target.onion, true);
  assert.equal(target.scheme, "http");
});

test("rejects non-http schemes and credentials", () => {
  assert.throws(() => parseTarget("file:///etc/passwd"), PolicyError);
  assert.throws(() => parseTarget("ftp://example.com"), PolicyError);
  assert.throws(() => parseTarget("https://user:pass@example.com"), PolicyError);
});

test("rejects local and private targets", () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://10.1.2.3/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "https://metadata.google.internal/",
  ]) {
    assert.throws(() => parseTarget(url), PolicyError, url);
  }
});

test("extracts title and readable text", () => {
  const page = extractPage(
    "<html><head><title>Hello &amp; Co</title><style>p{color:red}</style></head><body><h1>Hi</h1><p>Body</p><a href='/next'>Next</a><script>alert(1)</script></body></html>",
    5000,
  );
  assert.equal(page.title, "Hello & Co");
  assert.match(page.text, /Hi/);
  assert.match(page.text, /Body/);
  assert.equal(page.links[0]?.href, "/next");
  assert.doesNotMatch(page.text, /alert/);
});
