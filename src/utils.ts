import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export const SITE_ORIGIN = "https://nostarch.com";

export function absoluteUrl(url: string, base = SITE_ORIGIN): string {
  return new URL(url, base).toString();
}

export function slugFromUrl(url: string): string {
  const parsed = new URL(absoluteUrl(url));
  const parts = parsed.pathname.split("/").filter(Boolean);
  const last = parts.at(-1) ?? "index";
  return last.replace(/\.html?$/i, "") || "index";
}

export function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function stripTags(html: string): string {
  return normalizeWhitespace(
    decodeHtml(
      html
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n")
        .replace(/<\/li\s*>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function safeJsonStringify(value: unknown): string {
  return `${JSON.stringify(value, Object.keys(value as object).sort(), 2)}\n`;
}

export function centsFromPrice(price: string | undefined): number | undefined {
  if (!price) return undefined;
  const match = price.match(/(\d+)(?:\.(\d{1,2}))?/);
  if (!match) return undefined;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  return dollars * 100 + cents;
}

export function parseMonthYear(input: string): string | undefined {
  const match = input.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (!match) return undefined;
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const month = monthNames.indexOf(match[1]!.toLowerCase()) + 1;
  return `${match[2]}-${String(month).padStart(2, "0")}-01`;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureParent(path);
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}
