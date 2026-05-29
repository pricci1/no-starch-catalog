import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BookSnapshot, TocEntry } from "./types";
import { ensureParent, hashText, normalizeWhitespace, writeJson } from "./utils";

export function parseDetailedTocText(text: string): TocEntry[] {
  const lines = normalizeWhitespace(text).split("\n");
  const entries: TocEntry[] = [];
  for (const line of lines) {
    const cleaned = normalizeWhitespace(line.replace(/\.{2,}\s*\d+\s*$/, ""));
    const match = cleaned.match(/^(Introduction|Chapter\s+\d+|Appendix\s+[A-Z]|Afterword|Conclusion)\s*:?\s*(.*)$/i);
    if (!match) continue;
    const label = /^(Chapter|Appendix)/i.test(match[1]!) ? match[1] : undefined;
    entries.push({
      source: "detailed_toc_pdf",
      level: 1,
      label,
      title: match[2] ? match[2].trim() : match[1]!,
      rawText: cleaned,
      position: entries.length + 1,
    });
  }
  return entries;
}

async function runPdftotext(inputPath: string, outputPath: string): Promise<void> {
  await ensureParent(outputPath);
  const proc = Bun.spawn(["pdftotext", "-layout", inputPath, outputPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (exitCode !== 0) throw new Error(`pdftotext failed for ${inputPath}: ${stderr.trim()}`);
}

export async function extractPdfs(dataDir = "data"): Promise<BookSnapshot[]> {
  const catalogPath = join(dataDir, "catalog-books.json");
  const books = await Bun.file(catalogPath).json() as BookSnapshot[];

  for (const book of books) {
    const detailedTocEntries: TocEntry[] = [];
    for (const asset of book.assets) {
      if (!asset.localPath || !asset.localPath.toLowerCase().endsWith(".pdf") || !existsSync(asset.localPath)) continue;
      const textPath = join(dataDir, "extracted", "books", book.id, `${asset.type.replace(/_pdf$/, "")}.txt`);
      try {
        await runPdftotext(asset.localPath, textPath);
        const text = await Bun.file(textPath).text();
        asset.textPath = textPath;
        asset.textHash = hashText(text);
        if (asset.type === "detailed_toc_pdf") detailedTocEntries.push(...parseDetailedTocText(text));
      } catch (error) {
        console.error(`extract skipped: ${(error as Error).message}`);
      }
    }
    if (detailedTocEntries.length > 0) {
      const existingRaw = new Set(book.toc.map((entry) => `${entry.source}:${entry.rawText}`));
      for (const entry of detailedTocEntries) {
        const key = `${entry.source}:${entry.rawText}`;
        if (!existingRaw.has(key)) book.toc.push(entry);
      }
      book.toc.sort((a, b) => a.source.localeCompare(b.source) || a.position - b.position);
    }
  }

  await writeJson(catalogPath, books);
  return books;
}
