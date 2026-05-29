# no-starch-catalog

A Bun-powered git scraper for the [No Starch Press catalog](https://nostarch.com/catalog.htm). It snapshots book pages and linked PDFs, extracts PDF text, builds a SQLite search database, and can build a `git-history` database for analyzing how the catalog changes over time.

## Install

```bash
bun install
```

PDF extraction uses `pdftotext` from Poppler:

```bash
# Fedora
sudo dnf install poppler-utils

# Debian/Ubuntu
sudo apt-get install poppler-utils
```

The history database command uses Python's `git-history` via `uvx`, so install `uv` if you want that step locally.

## Run the scraper

```bash
bun run scrape
bun run extract-pdfs
bun run build-db
```

For a quick test scrape:

```bash
bun run index.ts scrape --limit 5 --no-assets
bun run build-db
```

To test a single known book page, including its linked assets:

```bash
bun run index.ts scrape --url https://nostarch.com/cad
bun run extract-pdfs
bun run build-db
```

This creates:

- `data/raw/catalog.html`
- `data/raw/books/<slug>/page.html`
- `data/raw/books/<slug>/*.pdf` and cover images, when available
- `data/extracted/books/<slug>/*.txt`
- `data/catalog-books.json`, a deterministic JSON list suitable for git scraping
- `data/catalog.db`, the current searchable SQLite catalog, rebuilt locally and ignored if it exceeds the repository file-size budget

Downloaded assets larger than 50MB are skipped and recorded in `catalog-books.json` with a `skippedReason`, rather than being committed.

## Search

```bash
bun run search "kernel modules"
```

Search uses SQLite FTS5 over book metadata, HTML TOCs, detailed TOCs, indexes, and sample chapters when those PDFs were available and extracted.

## Build the git-history database

```bash
bun run history-db
```

This runs:

```bash
uvx git-history file data/history.db data/catalog-books.json --namespace book --id id
```

`data/history.db` can answer questions like which books changed price, which books gained new sample PDFs, or when a book first appeared in the catalog.

## Datasette Lite

If you publish `data/catalog.db` with CORS-enabled static hosting, open it in Datasette Lite:

```text
https://lite.datasette.io/?url=https://OWNER.github.io/REPO/data/catalog.db
```

The scheduled GitHub Actions workflow scrapes weekly, extracts PDFs, builds both SQLite databases, and commits changed `data/` artifacts back to the repository.
