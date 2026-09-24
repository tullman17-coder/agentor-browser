import { connect, type Socket } from "node:net";
import { readFile } from "node:fs/promises";

export interface BootstrapStatus {
  progress: number;
  summary: string;
  ready: boolean;
}

/** Minimal Tor control-port client. Cookie auth only; no password on disk. */
export class ControlClient {
  private socket: Socket | null = null;
  private buffer = "";
  private pending: string[] = [];
  private waiters: Array<(line: string) => void> = [];

  static async connect(port: number, cookiePath: string): Promise<ControlClient> {
    const client = new ControlClient();
    await client.open(port);
    const cookie = await readFile(cookiePath);
    const reply = await client.raw(`AUTHENTICATE ${cookie.toString("hex")}`);
    if (!reply.startsWith("250")) {
      client.close();
      throw new Error(`tor control auth failed: ${reply}`);
    }
    return client;
  }

  private open(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port }, () => resolve());
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => this.onData(chunk));
      socket.on("error", reject);
      this.socket = socket;
    });
  }

  async bootstrap(timeoutMs: number, signal?: AbortSignal): Promise<BootstrapStatus> {
    const deadline = Date.now() + timeoutMs;
    let last = "starting";
    let progress = 0;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("aborted");
      const reply = await this.raw("GETINFO status/bootstrap-phase");
      const match = reply.match(/PROGRESS=(\d+).*SUMMARY="([^"]*)"/);
      progress = match ? Number(match[1]) : progress;
      last = match?.[2] ?? last;
      if (progress >= 100) return { progress: 100, summary: last, ready: true };
      await sleep(750, signal);
    }
    return { progress, summary: last, ready: false };
  }

  raw(line: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("control socket closed"));
        return;
      }
      this.waiters.push(resolve);
      this.socket.write(`${line}\r\n`);
    });
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx = this.buffer.indexOf("\r\n");
    while (idx !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      if (/^\d{3} /.test(line)) {
        const reply = [...this.pending, line].join("\n");
        this.pending = [];
        this.waiters.shift()?.(reply);
      } else {
        this.pending.push(line);
      }
      idx = this.buffer.indexOf("\r\n");
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}
