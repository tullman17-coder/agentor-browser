import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { join } from "node:path";
import { ControlClient, type BootstrapStatus } from "./control.ts";
import { packageRoot, runtimeDir, torBinary } from "./paths.ts";

export interface TorEndpoint {
  socksPort: number;
  controlPort: number;
  dataDir: string;
  pid: number;
  version: string;
}

export async function ensureTor(signal?: AbortSignal): Promise<TorEndpoint> {
  const dir = runtimeDir();
  await mkdir(dir, { recursive: true });
  const existing = await readRunning(dir);
  if (existing) return existing;

  const socksPort = await freePort();
  const controlPort = await freePort();
  const dataDir = join(dir, "tor-data");
  const cookiePath = join(dir, "control_auth_cookie");
  const logPath = join(dir, "tor.log");
  const torrcPath = join(dir, "torrc");
  await mkdir(dataDir, { recursive: true });

  const template = await readFile(join(packageRoot(), "config/torrc.template"), "utf8");
  const torrc = template
    .replaceAll("{{SOCKS_PORT}}", String(socksPort))
    .replaceAll("{{CONTROL_PORT}}", String(controlPort))
    .replaceAll("{{COOKIE_PATH}}", cookiePath)
    .replaceAll("{{DATA_DIR}}", dataDir)
    .replaceAll("{{LOG_PATH}}", logPath)
    .replaceAll("{{EXTRA}}", process.env.AGENTOR_TORRC_EXTRA ?? "");
  await writeFile(torrcPath, torrc, { mode: 0o600 });

  const bin = torBinary();
  const child = spawn(bin, ["-f", torrcPath], {
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
  });
  if (!child.pid) throw new Error(`failed to spawn ${bin}`);
  const stderr: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr.push(chunk.toString("utf8"));
    if (stderr.length > 40) stderr.shift();
  });

  const endpoint: TorEndpoint = {
    socksPort,
    controlPort,
    dataDir,
    pid: child.pid,
    version: await readVersion(bin),
  };
  await writeFile(join(dir, "endpoint.json"), JSON.stringify(endpoint), { mode: 0o600 });
  child.unref();
  child.on("exit", () => {
    rm(join(dir, "endpoint.json"), { force: true }).catch(() => undefined);
  });

  try {
    const control = await waitForControl(controlPort, cookiePath, signal);
    try {
      const status = await control.bootstrap(
        Number(process.env.AGENTOR_BOOTSTRAP_MS ?? 120_000),
        signal,
      );
      if (!status.ready) throw new Error(`tor did not bootstrap: ${status.summary}`);
    } finally {
      control.close();
    }
  } catch (error) {
    child.kill("SIGTERM");
    const detail = stderr.join("").trim();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(detail ? `${message}\n${detail}` : message);
  }
  return endpoint;
}

export async function torStatus(): Promise<{
  running: boolean;
  endpoint?: TorEndpoint;
  bootstrap?: BootstrapStatus;
}> {
  const dir = runtimeDir();
  const endpoint = await readRunning(dir);
  if (!endpoint) return { running: false };
  try {
    const control = await ControlClient.connect(endpoint.controlPort, join(dir, "control_auth_cookie"));
    try {
      const reply = await control.raw("GETINFO status/bootstrap-phase");
      const match = reply.match(/PROGRESS=(\d+).*SUMMARY="([^"]*)"/);
      return {
        running: true,
        endpoint,
        bootstrap: {
          progress: match ? Number(match[1]) : 0,
          summary: match?.[2] ?? reply,
          ready: /PROGRESS=100/.test(reply),
        },
      };
    } finally {
      control.close();
    }
  } catch {
    return { running: true, endpoint };
  }
}

export async function shutdownTor(): Promise<string> {
  const dir = runtimeDir();
  const endpoint = await readEndpoint(dir);
  if (!endpoint) return "not running";
  try {
    const control = await ControlClient.connect(endpoint.controlPort, join(dir, "control_auth_cookie"));
    try {
      return await control.raw("SIGNAL SHUTDOWN");
    } finally {
      control.close();
    }
  } catch {
    try {
      process.kill(endpoint.pid, "SIGTERM");
      return "sent SIGTERM";
    } catch {
      return "already stopped";
    }
  }
}

async function readRunning(dir: string): Promise<TorEndpoint | null> {
  const endpoint = await readEndpoint(dir);
  if (!endpoint) return null;
  try {
    process.kill(endpoint.pid, 0);
    await probe(endpoint.socksPort);
    return endpoint;
  } catch {
    return null;
  }
}

async function readEndpoint(dir: string): Promise<TorEndpoint | null> {
  try {
    const raw = await readFile(join(dir, "endpoint.json"), "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as TorEndpoint;
  } catch {
    return null;
  }
}

async function waitForControl(
  port: number,
  cookiePath: string,
  signal?: AbortSignal,
): Promise<ControlClient> {
  const deadline = Date.now() + 20_000;
  let last = "control port not ready";
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      return await ControlClient.connect(port, cookiePath);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(last);
}

function probe(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve();
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      reject(new Error("socks probe timed out"));
    });
    socket.on("error", reject);
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function readVersion(bin: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], (error, stdout) => {
      resolve(error ? "unknown" : (stdout.split("\n")[0] ?? "unknown"));
    });
  });
}
