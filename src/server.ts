import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fetchViaTor } from "./fetch.ts";
import { PolicyError } from "./policy.ts";
import { shutdownTor, torStatus } from "./tor.ts";

export interface ListenOptions {
  host?: string;
  port?: number;
}

/** Loopback JSON API used by the Pi extension and other local agents. */
export function startServer(options: ListenOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.AGENTOR_PORT ?? 0);
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const bound = address && typeof address !== "string" ? address.port : port;
      resolve({
        port: bound,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, service: "agentor-browser" });
    }
    if (req.method === "GET" && url.pathname === "/v1/status") {
      return send(res, 200, await torStatus());
    }
    if (req.method === "POST" && url.pathname === "/v1/session") {
      const { ensureTor } = await import("./tor.ts");
      return send(res, 200, await ensureTor());
    }
    if (req.method === "DELETE" && url.pathname === "/v1/session") {
      return send(res, 200, { result: await shutdownTor() });
    }
    if (req.method === "POST" && url.pathname === "/v1/fetch") {
      const body = await readJson(req);
      const result = await fetchViaTor({
        url: String(body.url ?? ""),
        method: body.method === "HEAD" ? "HEAD" : "GET",
        maxBytes: numberOrUndefined(body.maxBytes),
        timeoutMs: numberOrUndefined(body.timeoutMs),
        format: body.format === "html" || body.format === "text" ? body.format : "markdown",
        headers: isRecord(body.headers) ? stringRecord(body.headers) : undefined,
      });
      return send(res, result.ok || result.status > 0 ? 200 : 502, result);
    }
    send(res, 404, { error: "not found" });
  } catch (error) {
    const status = error instanceof PolicyError ? 400 : 500;
    send(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 64_000) throw new PolicyError("request body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!isRecord(parsed)) throw new PolicyError("JSON object required");
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && !/^(cookie|authorization)$/i.test(key)) out[key] = item;
  }
  return out;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
