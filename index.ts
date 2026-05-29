import { scrape } from "./src/scrape";
import { extractPdfs } from "./src/extract";
import { buildCatalogDb, searchCatalog } from "./src/db";
import { buildHistoryDb } from "./src/history";

function usage(): never {
  console.error(`Usage:
  bun run index.ts scrape [--limit N] [--url URL] [--no-assets]
  bun run index.ts extract-pdfs
  bun run index.ts build-db
  bun run index.ts history-db
  bun run index.ts search QUERY
`);
  process.exit(1);
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readOptions(name: string): string[] {
  return process.argv.flatMap((value, index) => value === name && process.argv[index + 1] ? [process.argv[index + 1]!] : []);
}

const command = process.argv[2];

if (command === "scrape") {
  const limit = readOption("--limit");
  await scrape({
    limit: limit ? Number(limit) : undefined,
    fetchAssets: !process.argv.includes("--no-assets"),
    urls: readOptions("--url"),
  });
} else if (command === "extract-pdfs") {
  await extractPdfs();
} else if (command === "build-db") {
  const dbPath = await buildCatalogDb();
  console.log(dbPath);
} else if (command === "history-db") {
  const dbPath = await buildHistoryDb();
  console.log(dbPath);
} else if (command === "search") {
  const query = process.argv.slice(3).join(" ");
  if (!query) usage();
  for (const result of searchCatalog(query)) {
    console.log(`${result.bookTitle} (${result.documentType})`);
    console.log(`  ${result.snippet}`);
  }
} else {
  usage();
}
