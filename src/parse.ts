import type { BookAsset, BookLink, BookSnapshot, TocEntry } from "./types";
import { absoluteUrl, centsFromPrice, decodeHtml, normalizeWhitespace, parseMonthYear, slugFromUrl, stripTags } from "./utils";

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]!) : undefined;
}

export function metaContent(html: string, nameOrProperty: string): string | undefined {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])[^>]*>`, "i");
  const tag = html.match(regex)?.[0];
  return tag ? attr(tag, "content") : undefined;
}

export function extractLinks(html: string): Array<{ href: string; text: string; tag: string }> {
  return [...html.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi)].map((match) => {
    const tag = match[0];
    return {
      href: attr(tag, "href") ?? "",
      text: stripTags(tag),
      tag,
    };
  }).filter((link) => link.href);
}

export function parseCatalogLinks(html: string): BookLink[] {
  const seen = new Set<string>();
  const links: BookLink[] = [];
  for (const link of extractLinks(html)) {
    if (!link.href.startsWith("/") || link.href.startsWith("/catalog") || link.href.startsWith("/download") || link.href === "/") continue;
    if (!link.text || link.text.length < 3 || /mailing list|upcoming|merch/i.test(link.text)) continue;
    const url = absoluteUrl(link.href);
    const slug = slugFromUrl(url);
    if (seen.has(slug)) continue;
    seen.add(slug);
    links.push({ slug, url, title: link.text });
  }
  return links.sort((a, b) => a.slug.localeCompare(b.slug));
}

function fieldText(html: string, fieldName: string): string | undefined {
  const index = html.indexOf(`field-name-${fieldName}`);
  if (index === -1) return undefined;
  const slice = html.slice(index, index + 2000);
  const match = slice.match(/<div class="field-item(?: [^"]+)?">([\s\S]*?)<\/div>/i);
  return match ? stripTags(match[1]!) : undefined;
}

function bodyHtml(html: string): string | undefined {
  const index = html.indexOf("field-name-body");
  if (index === -1) return undefined;
  const start = html.indexOf("<div class=\"field-item", index);
  if (start === -1) return undefined;
  const end = html.indexOf("field-name-field-reviews", start);
  return html.slice(start, end === -1 ? start + 20_000 : end);
}

function parseAuthors(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .replace(/^by\s+/i, "")
    .split(/,\s+|\s+and\s+|\s*&\s*/i)
    .map((author) => author.trim())
    .filter(Boolean);
}

function parseHtmlToc(html: string): TocEntry[] {
  const heading = html.search(/Table of Contents|Table of contents/i);
  if (heading === -1) return [];
  const slice = html.slice(heading, heading + 6000);
  const beforeReviews = slice.split(/field-name-field-reviews|Reviews/i)[0] ?? slice;
  const text = stripTags(beforeReviews);
  const lines = text.split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => /^(Introduction|Chapter\s+\d+|Appendix\s+|Afterword|Epilogue|Conclusion)/i.test(line));
  return lines.map((line, index) => {
    const chapter = line.match(/^(Chapter\s+\d+|Appendix\s+[A-Z])\s*:?\s*(.*)$/i);
    return {
      source: "html_toc",
      level: 1,
      label: chapter?.[1],
      title: chapter ? (chapter[2] || chapter[1]!).trim() : line,
      rawText: line,
      position: index + 1,
    };
  });
}

function parseAssets(html: string): BookAsset[] {
  const assets: BookAsset[] = [];
  const cover = metaContent(html, "og:image:url") ?? metaContent(html, "twitter:image");
  if (cover) assets.push({ type: "cover", url: absoluteUrl(cover), title: "Cover" });
  for (const link of extractLinks(html)) {
    const href = link.href;
    const text = link.text;
    if (!/\.pdf(?:$|\?)/i.test(href) && !/download\/samples/i.test(href)) continue;
    const haystack = `${href} ${text}`.toLowerCase();
    const type = haystack.includes("index")
      ? "index_pdf"
      : haystack.includes("toc") || haystack.includes("table of contents")
        ? "detailed_toc_pdf"
        : haystack.includes("chapter") || haystack.includes("sample")
          ? "sample_chapter_pdf"
          : "other";
    assets.push({ type, title: text || undefined, url: absoluteUrl(href) });
  }
  return assets.filter((asset, index, all) => all.findIndex((other) => other.type === asset.type && other.url === asset.url) === index);
}

export function parseBookPage(html: string, url: string): BookSnapshot | undefined {
  const id = slugFromUrl(url);
  const title = metaContent(html, "og:title") ?? stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const isbn13 = metaContent(html, "product:isbn") ?? fieldText(html, "field-isbn13")?.match(/\d{13}/)?.[0];
  const body = bodyHtml(html);
  const released = fieldText(html, "released-date") ?? "";
  const pageCount = Number(released.match(/(\d+)\s*pp\./i)?.[1] ?? undefined) || undefined;
  const description = metaContent(html, "description") ?? (body ? stripTags(body).split("\n").find((line) => line.length > 80) : undefined);
  const shortlink = html.match(/<link\s+rel=["']shortlink["']\s+href=["'][^"']*\/node\/(\d+)["']/i)?.[1];
  const snapshot: BookSnapshot = {
    id,
    url: absoluteUrl(url),
    title,
    subtitle: fieldText(html, "field-subtitle"),
    description,
    isbn13,
    pageCount,
    publicationDate: parseMonthYear(released),
    priceCents: centsFromPrice(metaContent(html, "product:price:amount")),
    currency: metaContent(html, "product:price:currency") ?? undefined,
    authors: parseAuthors(fieldText(html, "field-author")),
    topics: [],
    toc: parseHtmlToc(html),
    assets: parseAssets(html),
    sourceModifiedAt: metaContent(html, "article:modified_time") ?? metaContent(html, "og:updated_time"),
    drupalNodeId: shortlink,
  };
  if (!snapshot.title || (!snapshot.isbn13 && !snapshot.pageCount && snapshot.assets.length === 0)) return undefined;
  return snapshot;
}
