import TurndownService from "turndown";

export interface ExtractedPage {
  title: string;
  text: string;
  links: { href: string; text: string }[];
  truncated: boolean;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndown.remove(["script", "style", "noscript", "iframe"]);

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HREF = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

export function extractPage(html: string, maxChars: number): ExtractedPage {
  const title = decode(TITLE.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const links = collectLinks(html).slice(0, 40);
  let text = "";
  try {
    text = turndown.turndown(html);
  } catch {
    text = html.replace(/<[^>]+>/g, " ");
  }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  const truncated = text.length > maxChars;
  if (truncated) text = text.slice(0, maxChars);
  return { title, text, links, truncated };
}

function collectLinks(html: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(HREF)) {
    const href = decode(match[1] ?? "").trim();
    const text = decode((match[2] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ href, text: text.slice(0, 160) });
  }
  return links;
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}
