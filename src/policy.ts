/**
 * Fetch policy for an agent-operated Tor client.
 * Blocks local/metadata targets before they ever reach the SOCKS proxy.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface AllowedTarget {
  url: URL;
  scheme: "http" | "https";
  onion: boolean;
}

export function parseTarget(raw: string): AllowedTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PolicyError(`not a URL: ${raw}`);
  }
  if (url.username || url.password) {
    throw new PolicyError("credentials in URLs are not allowed");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PolicyError(`only http and https are allowed, got ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new PolicyError("missing host");
  const onion = host.endsWith(".onion");
  if (!onion) assertClearnetHost(host);
  return {
    url,
    scheme: url.protocol === "https:" ? "https" : "http",
    onion,
  };
}

function assertClearnetHost(host: string): void {
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new PolicyError(`blocked host: ${host}`);
  }
  if (host.includes("%")) throw new PolicyError("zone identifiers are not allowed");

  const ipv4 = parseIPv4(host);
  if (ipv4) {
    const [a, b] = ipv4;
    const blocked =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
    if (blocked) throw new PolicyError(`blocked address: ${host}`);
    return;
  }

  if (host.includes(":")) {
    const normalized = host.toLowerCase();
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff")
    ) {
      throw new PolicyError(`blocked address: ${host}`);
    }
  }
}

function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    return Number(part);
  });
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return nums;
}

export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return raw.split("?")[0] ?? raw;
  }
}
