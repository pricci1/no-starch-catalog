import { basename, extname, join } from "node:path";
import type { BookAsset, BookSnapshot } from "./types";
import { parseBookPage, parseCatalogLinks } from "./parse";
import { ensureParent, hashText, slugFromUrl, writeJson } from "./utils";

const CATALOG_URL = "https://nostarch.com/catalog.htm";

export type ScrapeOptions = {
  dataDir?: string;
  limit?: number;
  fetchAssets?: boolean;
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "no-starch-catalog/0.1 (+https://github.com/)" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  return await response.text();
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: { "User-Agent": "no-starch-catalog/0.1 (+https://github.com/)" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
  return await response.arrayBuffer();
}

function assetFilename(asset: BookAsset): string {
  if (asset.type === "cover") return `cover${extname(new URL(asset.url).pathname) || ".jpg"}`;
  const name = basename(new URL(asset.url).pathname) || `${asset.type}.bin`;
  if (asset.type === "detailed_toc_pdf") return `detailed_toc${extname(name) || ".pdf"}`;
  if (asset.type === "index_pdf") return `index${extname(name) || ".pdf"}`;
  if (asset.type === "sample_chapter_pdf") return `sample_chapter${extname(name) || ".pdf"}`;
  return name;
}

function withLocalPaths(book: BookSnapshot, dataDir: string): BookSnapshot {
  return {
    ...book,
    assets: book.assets.map((asset) => ({
      ...asset,
      localPath: join(dataDir, "raw", "books", book.id, assetFilename(asset)),
    })),
  };
}

function stableBook(book: BookSnapshot): BookSnapshot {
  return {
    ...book,
    authors: [...book.authors],
    topics: [...book.topics].sort((a, b) => a.localeCompare(b)),
    toc: [...book.toc].sort((a, b) => a.position - b.position),
    assets: [...book.assets].sort((a, b) => `${a.type}:${a.url}`.localeCompare(`${b.type}:${b.url}`)),
  };
}

export async function scrape(options: ScrapeOptions = {}): Promise<BookSnapshot[]> {
  const dataDir = options.dataDir ?? "data";
  const catalogHtml = await fetchText(CATALOG_URL);
  const catalogPath = join(dataDir, "raw", "catalog.html");
  await ensureParent(catalogPath);
  await Bun.write(catalogPath, catalogHtml);

  const links = parseCatalogLinks(catalogHtml).slice(0, options.limit);
  const books: BookSnapshot[] = [];

  for (const [index, link] of links.entries()) {
    console.error(`[${index + 1}/${links.length}] ${link.url}`);
    try {
      const html = await fetchText(link.url);
      const slug = slugFromUrl(link.url);
      const pagePath = join(dataDir, "raw", "books", slug, "page.html");
      await ensureParent(pagePath);
      await Bun.write(pagePath, html);

      const parsed = parseBookPage(html, link.url);
      if (!parsed?.isbn13) continue;
      const book = withLocalPaths(parsed, dataDir);
      if (options.fetchAssets !== false) {
        for (const asset of book.assets) {
          if (!asset.localPath) continue;
          try {
            const bytes = await fetchBytes(asset.url);
            await ensureParent(asset.localPath);
            await Bun.write(asset.localPath, bytes);
          } catch (error) {
            console.error(`  asset skipped: ${(error as Error).message}`);
          }
        }
      }
      books.push(stableBook(book));
    } catch (error) {
      console.error(`  book skipped: ${(error as Error).message}`);
    }
  }

  books.sort((a, b) => a.id.localeCompare(b.id));
  await writeJson(join(dataDir, "catalog-books.json"), books);
  await writeJson(join(dataDir, "catalog-meta.json"), {
    sourceUrl: CATALOG_URL,
    bookCount: books.length,
    catalogHash: hashText(catalogHtml),
  });
  return books;
}
