import { existsSync, unlinkSync } from "node:fs";

export type BuildHistoryOptions = {
  inputPath?: string;
  dbPath?: string;
};

export async function buildHistoryDb(options: BuildHistoryOptions = {}): Promise<string> {
  const inputPath = options.inputPath ?? "data/catalog-books.json";
  const dbPath = options.dbPath ?? "data/history.db";
  if (!existsSync(inputPath)) throw new Error(`Missing ${inputPath}; run scrape first.`);
  if (existsSync(dbPath)) unlinkSync(dbPath);
  const proc = Bun.spawn([
    "uvx",
    "git-history",
    "file",
    dbPath,
    inputPath,
    "--namespace",
    "book",
    "--id",
    "id",
  ], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`git-history failed with exit code ${exitCode}`);
  return dbPath;
}
