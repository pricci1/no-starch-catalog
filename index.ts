import { scrape } from "./src/scrape";

function usage(): never {
  console.error(`Usage:
  bun run index.ts scrape [--limit N] [--no-assets]
  bun run index.ts build-db
  bun run index.ts search QUERY
`);
  process.exit(1);
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const command = process.argv[2];

if (command === "scrape") {
  const limit = readOption("--limit");
  await scrape({
    limit: limit ? Number(limit) : undefined,
    fetchAssets: !process.argv.includes("--no-assets"),
  });
} else if (command === "build-db" || command === "search") {
  console.error(`${command} is not implemented yet.`);
  process.exit(2);
} else {
  usage();
}
