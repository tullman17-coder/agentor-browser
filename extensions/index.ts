/**
 * Native Pi package extension.
 * https://pi.dev/docs/latest/packages
 * https://pi.dev/docs/latest/extensions
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchViaTor, type FetchResult } from "../src/fetch.ts";
import { shutdownTor, torStatus } from "../src/tor.ts";

const MAX_MODEL_CHARS = 12_000;

function textResult(text: string, details: Record<string, unknown>) {
  const clipped = text.length > MAX_MODEL_CHARS;
  const body = clipped
    ? `${text.slice(0, MAX_MODEL_CHARS)}\n\n[truncated for context; ${text.length} chars total]`
    : text;
  return {
    content: [{ type: "text" as const, text: body }],
    details: { ...details, clipped },
  };
}

const fetchTool = defineTool({
  name: "tor_fetch",
  label: "Tor fetch",
  description:
    "Fetch an http:// or https:// page through the local Tor client built from Tor Project source. Works for clearnet and .onion. Returns readable text, not a browser screenshot. Does not accept local, link-local, or private addresses.",
  promptSnippet: "Fetch http/https, including .onion, through the local Tor client",
  promptGuidelines: [
    "Use tor_fetch for pages that must egress through Tor, including .onion URLs.",
    "Prefer tor_status before the first fetch if bootstrap may still be in progress.",
    "Do not send cookies, Authorization headers, or credentials through tor_fetch.",
  ],
  executionMode: "parallel",
  parameters: Type.Object({
    url: Type.String({ description: "Absolute http or https URL, including .onion" }),
    maxBytes: Type.Optional(Type.Number({ description: "Maximum response bytes, 1024-1000000" })),
    format: Type.Optional(
      Type.Union([Type.Literal("markdown"), Type.Literal("html"), Type.Literal("text")], {
        description: "markdown (default) extracts readable text; html returns the raw body",
      }),
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const result = await fetchViaTor(
      {
        url: params.url,
        maxBytes: params.maxBytes,
        format: params.format ?? "markdown",
      },
      signal,
    );
    return textResult(renderFetch(result), { url: result.finalUrl, status: result.status, ok: result.ok });
  },
});

const statusTool = defineTool({
  name: "tor_status",
  label: "Tor status",
  description: "Report whether the local official Tor client is running and how far bootstrap has progressed.",
  promptSnippet: "Check the local Tor client bootstrap status",
  executionMode: "sequential",
  parameters: Type.Object({}),
  async execute() {
    const status = await torStatus();
    return textResult(JSON.stringify(status, null, 2), { running: status.running });
  },
});

const stopTool = defineTool({
  name: "tor_stop",
  label: "Stop Tor",
  description: "Shut down the local Tor client started by this package. Does not touch any other Tor process.",
  promptSnippet: "Stop the AGENTOR Tor client",
  executionMode: "sequential",
  parameters: Type.Object({}),
  async execute() {
    const result = await shutdownTor();
    return textResult(result, { result });
  },
});

export default function agentorBrowser(pi: ExtensionAPI) {
  pi.registerTool(fetchTool);
  pi.registerTool(statusTool);
  pi.registerTool(stopTool);

  pi.registerCommand("tor-status", {
    description: "Show AGENTOR Tor client status",
    handler: async (_args, ctx) => {
      const status = await torStatus();
      ctx.ui.notify(status.running ? `Tor ${status.bootstrap?.progress ?? "?"}%` : "Tor is not running", "info");
    },
  });
}

function renderFetch(result: FetchResult): string {
  if (result.error && result.status === 0) {
    return `Tor fetch failed for ${result.url}: ${result.error}`;
  }
  const header = [
    `${result.status} ${result.finalUrl}`,
    `scheme=${result.scheme} onion=${result.onion} bytes=${result.bytes} truncated=${result.truncated}`,
    `tor=${result.circuit.version}`,
    result.title ? `title=${result.title}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const links = result.links?.length
    ? `\n\nLinks:\n${result.links.map((link) => `- ${link.text || link.href} -> ${link.href}`).join("\n")}`
    : "";
  return `${header}\n\n${result.body}${links}`;
}

export const tools = [fetchTool, statusTool, stopTool];
