import { expect, test } from "bun:test";
import { parseBookPage, parseCatalogLinks } from "../src/parse";

test("parseCatalogLinks extracts stable internal product links", () => {
  const links = parseCatalogLinks(`
    <a href="/catalog/security">Security</a>
    <a href="/cad">A Beginner&#039;s Guide to 3D Modeling</a>
    <a href="/cad">A Beginner&#039;s Guide to 3D Modeling</a>
    <a href="/download/samples/x.pdf">PDF</a>
  `);
  expect(links).toEqual([
    { slug: "cad", url: "https://nostarch.com/cad", title: "A Beginner's Guide to 3D Modeling" },
  ]);
});

test("parseBookPage extracts book metadata, toc, and assets", () => {
  const book = parseBookPage(`
    <meta property="og:title" content="A Beginner&#039;s Guide to 3D Modeling" />
    <meta name="description" content="Intro to CAD." />
    <meta property="product:price:amount" content="19.95" />
    <meta property="product:price:currency" content="USD" />
    <meta property="product:isbn" content="9781593279264" />
    <meta property="article:modified_time" content="2026-02-09T10:34:47-08:00" />
    <meta property="og:image:url" content="https://nostarch.com/cover.jpg" />
    <link rel="shortlink" href="https://nostarch.com/node/485" />
    <div class="field field-name-field-subtitle"><div class="field-items"><div class="field-item even">A Guide to Autodesk Fusion 360</div></div></div>
    <div class="field field-name-field-author"><div class="field-items"><div class="field-item even">by Cameron Coward and Ada Lovelace</div></div></div>
    <div class="field field-name-released-date"><div class="field-items"><div class="field-item even">June 2019, 152 pp.</div></div></div>
    <h2>Table of Contents</h2>
    <p>Introduction<br />Chapter 1: A Brief History of CAD<br />Chapter 2: Parameters</p>
    <p><a href="/download/samples/Beginner3DModeling_Sample_ToC.pdf">View the detailed Table of Contents</a></p>
    <p><a href="/download/samples/Beginner3DModeling_Sample_Index.pdf">View the Index</a></p>
  `, "https://nostarch.com/cad");

  expect(book?.id).toBe("cad");
  expect(book?.title).toBe("A Beginner's Guide to 3D Modeling");
  expect(book?.authors).toEqual(["Cameron Coward", "Ada Lovelace"]);
  expect(book?.pageCount).toBe(152);
  expect(book?.publicationDate).toBe("2019-06-01");
  expect(book?.priceCents).toBe(1995);
  expect(book?.toc.map((entry) => entry.rawText)).toEqual([
    "Introduction",
    "Chapter 1: A Brief History of CAD",
    "Chapter 2: Parameters",
  ]);
  expect(book?.assets.map((asset) => asset.type)).toContain("detailed_toc_pdf");
  expect(book?.assets.map((asset) => asset.type)).toContain("index_pdf");
});
