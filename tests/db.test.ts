import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { buildCatalogDb, searchCatalog } from "../src/db";
import { writeJson } from "../src/utils";

test("buildCatalogDb creates searchable book documents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nostarch-db-"));
  try {
    await writeJson(join(dir, "catalog-books.json"), [
      {
        id: "cad",
        url: "https://nostarch.com/cad",
        title: "A Beginner's Guide to 3D Modeling",
        description: "Learn CAD and parametric modeling.",
        isbn13: "9781593279264",
        authors: ["Cameron Coward"],
        topics: [],
        toc: [{ source: "html_toc", level: 1, title: "Springs", rawText: "Chapter 7: Springs and Screws", position: 1 }],
        assets: [],
      },
    ]);
    const dbPath = await buildCatalogDb({ dataDir: dir });
    const db = new Database(dbPath, { readonly: true });
    expect(db.query("select count(*) as c from books").get()).toEqual({ c: 1 });
    db.close();
    const results = searchCatalog("parametric", dbPath);
    expect(results[0]?.bookId).toBe("cad");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
