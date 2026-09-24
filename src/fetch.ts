import { Socks5ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { extractPage, type ExtractedPage } from "./extract.ts";
import { parseTarget, PolicyError, redactUrl } from "./policy.ts";
import { ensureTor, type TorEndpoint } from "./tor.ts";

export interface FetchRequest {
  url: string;
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  format?: "markdown" | "text" | "html";
}

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  status: number;
  scheme: "http" | "https";
  onion: boolean;
  contentType: string;
  bytes: number;
  truncated: boolean;
  title?: string;
  body: string;
  links?: { href: string; text: string }[];
  circuit: { socksPort: number; version: string };
  error?: string;
}

const DEFAULT_MAX_BYTES = 1_000_000;
const HOP_LIMIT = 5;

export async function fetchViaTor(request: FetchRequest, signal?: AbortSignal): Promise<FetchResult> {
  const target = parseTarget(request.url);
  const endpoint = await ensureTor(signal);
  const dispatcher = new Socks5ProxyAgent(`socks5://127.0.0.1:${endpoint.socksPort}`);
  const maxBytes = clamp(request.maxBytes ?? 200_000, 1_024, DEFAULT_MAX_BYTES);
  const timeoutMs = clamp(request.timeoutMs ?? 45_000, 1_000, 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await follow(target.url, dispatcher, request, controller.signal, 0);
    const contentType = response.headers.get("content-type") ?? "";
    const bytes = await readLimited(response, maxBytes);
    const truncated = bytes.truncated;
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes.data);
    const html = /html|xml/i.test(contentType) || /<!doctype html|<html/i.test(raw.slice(0, 400));
    let page: ExtractedPage | null = null;
    let body = raw;
    if (html && request.format !== "html") {
      page = extractPage(raw, maxBytes);
      body = page.text;
    }
    return {
      ok: response.status >= 200 && response.status < 400,
      url: redactUrl(request.url),
      finalUrl: redactUrl(response.url),
      status: response.status,
      scheme: target.scheme,
      onion: target.onion,
      contentType,
      bytes: bytes.data.byteLength,
      truncated: truncated || Boolean(page?.truncated),
      title: page?.title,
      body,
      links: page?.links,
      circuit: { socksPort: endpoint.socksPort, version: endpoint.version },
    };
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    return failed(request.url, target.scheme, target.onion, endpoint, error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function follow(
  url: URL,
  dispatcher: Dispatcher,
  request: FetchRequest,
  signal: AbortSignal,
  hops: number,
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  parseTarget(url.toString());
  const response = await undiciFetch(url, {
    method: request.method ?? "GET",
    redirect: "manual",
    headers: {
      "user-agent": "AGENTOR-Browser/0.2 (+https://www.torproject.org)",
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      ...request.headers,
    },
    dispatcher,
    signal,
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return response;
    if (hops >= HOP_LIMIT) throw new PolicyError("too many redirects");
    const next = new URL(location, url);
    return follow(next, dispatcher, request, signal, hops + 1);
  }
  return response;
}

async function readLimited(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  maxBytes: number,
): Promise<{ data: Uint8Array; truncated: boolean }> {
  if (!response.body) return { data: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    if (value.byteLength > room) {
      chunks.push(value.slice(0, room));
      total += room;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { data, truncated };
}

function failed(
  url: string,
  scheme: "http" | "https",
  onion: boolean,
  endpoint: TorEndpoint,
  error: unknown,
): FetchResult {
  return {
    ok: false,
    url: redactUrl(url),
    finalUrl: redactUrl(url),
    status: 0,
    scheme,
    onion,
    contentType: "",
    bytes: 0,
    truncated: false,
    body: "",
    circuit: { socksPort: endpoint.socksPort, version: endpoint.version },
    error: error instanceof Error ? error.message : String(error),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
