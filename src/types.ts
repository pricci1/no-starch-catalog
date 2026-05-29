export type BookLink = {
  slug: string;
  url: string;
  title: string;
};

export type BookAssetType =
  | "cover"
  | "detailed_toc_pdf"
  | "index_pdf"
  | "sample_chapter_pdf"
  | "sample_image"
  | "other";

export type BookAsset = {
  type: BookAssetType;
  title?: string;
  url: string;
  localPath?: string;
  textPath?: string;
  textHash?: string;
  byteSize?: number;
  skippedReason?: string;
  textContent?: string;
};

export type TocEntry = {
  source: "html_toc" | "detailed_toc_pdf";
  level: number;
  label?: string;
  title: string;
  pageStart?: number;
  rawText: string;
  position: number;
};

export type BookSnapshot = {
  id: string;
  url: string;
  title: string;
  subtitle?: string;
  description?: string;
  isbn13?: string;
  pageCount?: number;
  publicationDate?: string;
  priceCents?: number;
  currency?: string;
  authors: string[];
  topics: string[];
  toc: TocEntry[];
  assets: BookAsset[];
  sourceModifiedAt?: string;
  drupalNodeId?: string;
};

export type CatalogSnapshot = BookSnapshot[];
