import { existsSync, unlinkSync } from "node:fs";

export type BuildHistoryOptions = {
  inputPath?: string;
  dbPath?: string;
  branch?: string;
};

async function currentBranch(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  if (exitCode !== 0) return "main";
  const branch = stdout.trim();
  return branch && branch !== "HEAD" ? branch : "main";
}

export async function buildHistoryDb(options: BuildHistoryOptions = {}): Promise<string> {
  const inputPath = options.inputPath ?? "data/catalog-books.json";
  const dbPath = options.dbPath ?? "data/history.db";
  const branch = options.branch ?? await currentBranch();
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
    "--branch",
    branch,
  ], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`git-history failed with exit code ${exitCode}`);
  return dbPath;
}
