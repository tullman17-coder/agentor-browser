import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Package root, whether this file is loaded from src/ or a copied layout. */
export function packageRoot(): string {
  const candidates = [resolve(here, ".."), resolve(here, "../..")];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return resolve(here, "..");
}

export function torBinary(): string {
  if (process.env.AGENTOR_TOR_BIN && existsSync(process.env.AGENTOR_TOR_BIN)) {
    return process.env.AGENTOR_TOR_BIN;
  }
  const built = join(packageRoot(), "third_party/tor-install/bin/tor");
  if (existsSync(built)) return built;
  return "tor";
}

export function runtimeDir(): string {
  return process.env.AGENTOR_RUNTIME_DIR
    ? resolve(process.env.AGENTOR_RUNTIME_DIR)
    : join(packageRoot(), "runtime");
}
