import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { BookSnapshot } from "./types";
import { hashText } from "./utils";

export type BuildDbOptions = {
  dataDir?: string;
  dbPath?: string;
};

function readTextIfPresent(path: string | undefined): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  return Bun.file(path).text() as unknown as string;
}

async function loadBooks(dataDir: string): Promise<BookSnapshot[]> {
  return await Bun.file(join(dataDir, "catalog-books.json")).json() as BookSnapshot[];
}

function migrate(db: Database): void {
  db.exec(`
    pragma foreign_keys = on;

    create table books (
      id text primary key,
      url text not null unique,
      title text not null,
      subtitle text,
      description text,
      isbn13 text,
      page_count integer,
      publication_date text,
      price_cents integer,
      currency text,
      source_modified_at text,
      drupal_node_id text
    );

    create table authors (
      id integer primary key,
      name text not null unique
    );

    create table book_authors (
      book_id text not null references books(id) on delete cascade,
      author_id integer not null references authors(id) on delete cascade,
      position integer not null,
      primary key (book_id, author_id)
    );

    create table book_assets (
      id integer primary key,
      book_id text not null references books(id) on delete cascade,
      asset_type text not null,
      title text,
      url text not null,
      local_path text,
      text_path text,
      text_hash text,
      unique(book_id, asset_type, url)
    );

    create table toc_entries (
      id integer primary key,
      book_id text not null references books(id) on delete cascade,
      source text not null,
      level integer not null,
      label text,
      title text not null,
      page_start integer,
      raw_text text not null,
      position integer not null
    );

    create table documents (
      id integer primary key,
      book_id text not null references books(id) on delete cascade,
      document_type text not null,
      title text,
      source_url text,
      local_path text,
      text_content text not null,
      content_hash text not null
    );

    create virtual table documents_fts using fts5(
      book_id unindexed,
      title,
      book_title,
      author_names,
      document_type unindexed,
      text_content,
      tokenize='porter unicode61'
    );
  `);
}

function insertDocument(db: Database, book: BookSnapshot, documentType: string, title: string, text: string, sourceUrl?: string, localPath?: string): void {
  const normalized = text.trim();
  if (!normalized) return;
  const result = db.query(`
    insert into documents (book_id, document_type, title, source_url, local_path, text_content, content_hash)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(book.id, documentType, title, sourceUrl ?? null, localPath ?? null, normalized, hashText(normalized));
  db.query(`
    insert into documents_fts (rowid, book_id, title, book_title, author_names, document_type, text_content)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(result.lastInsertRowid, book.id, title, book.title, book.authors.join(", "), documentType, normalized);
}

export async function buildCatalogDb(options: BuildDbOptions = {}): Promise<string> {
  const dataDir = options.dataDir ?? "data";
  const dbPath = options.dbPath ?? join(dataDir, "catalog.db");
  if (existsSync(dbPath)) unlinkSync(dbPath);
  const books = await loadBooks(dataDir);
  const db = new Database(dbPath);
  migrate(db);

  const insertBook = db.query(`
    insert into books (id, url, title, subtitle, description, isbn13, page_count, publication_date, price_cents, currency, source_modified_at, drupal_node_id)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAuthor = db.query("insert or ignore into authors (name) values (?)");
  const authorByName = db.query<{ id: number }, [string]>("select id from authors where name = ?");
  const insertBookAuthor = db.query("insert into book_authors (book_id, author_id, position) values (?, ?, ?)");
  const insertAsset = db.query(`
    insert into book_assets (book_id, asset_type, title, url, local_path, text_path, text_hash)
    values (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertToc = db.query(`
    insert into toc_entries (book_id, source, level, label, title, page_start, raw_text, position)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const book of books) {
      insertBook.run(book.id, book.url, book.title, book.subtitle ?? null, book.description ?? null, book.isbn13 ?? null, book.pageCount ?? null, book.publicationDate ?? null, book.priceCents ?? null, book.currency ?? null, book.sourceModifiedAt ?? null, book.drupalNodeId ?? null);
      book.authors.forEach((author, index) => {
        insertAuthor.run(author);
        const row = authorByName.get(author);
        if (row) insertBookAuthor.run(book.id, row.id, index + 1);
      });
      for (const asset of book.assets) {
        insertAsset.run(book.id, asset.type, asset.title ?? null, asset.url, asset.localPath ?? null, asset.textPath ?? null, asset.textHash ?? null);
      }
      for (const entry of book.toc) {
        insertToc.run(book.id, entry.source, entry.level, entry.label ?? null, entry.title, entry.pageStart ?? null, entry.rawText, entry.position);
      }
    }
  })();

  for (const book of books) {
    insertDocument(db, book, "metadata", book.title, [book.title, book.subtitle, book.description, book.authors.join(", ")].filter(Boolean).join("\n"), book.url);
    if (book.toc.length > 0) insertDocument(db, book, "toc", `${book.title} TOC`, book.toc.map((entry) => entry.rawText).join("\n"), book.url);
    for (const asset of book.assets) {
      if (!asset.textPath) continue;
      const text = await Bun.file(asset.textPath).text();
      insertDocument(db, book, asset.type.replace(/_pdf$/, ""), asset.title ?? asset.type, text, asset.url, asset.textPath);
    }
  }

  db.close();
  return dbPath;
}

export type SearchResult = {
  bookId: string;
  bookTitle: string;
  documentType: string;
  documentTitle: string;
  snippet: string;
  rank: number;
};

export function searchCatalog(query: string, dbPath = "data/catalog.db", limit = 10): SearchResult[] {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.query<SearchResult, [string, number]>(`
    select
      documents_fts.book_id as bookId,
      books.title as bookTitle,
      documents_fts.document_type as documentType,
      documents_fts.title as documentTitle,
      snippet(documents_fts, 5, '[', ']', ' … ', 20) as snippet,
      bm25(documents_fts, 2.0, 1.5, 1.5, 0.5, 1.0, 1.0) as rank
    from documents_fts
    join books on books.id = documents_fts.book_id
    where documents_fts match ?
    order by rank
    limit ?
  `).all(query, limit);
  db.close();
  return rows;
}
