import { expect, test } from "bun:test";
import { parseDetailedTocText } from "../src/extract";

test("parseDetailedTocText finds chapter-like entries", () => {
  const entries = parseDetailedTocText(`
    Contents
    Introduction ........................................ 1
    Chapter 1: Getting Started ......................... 9
      Installing the tools ............................ 10
    Chapter 2 Advanced Topics .......................... 25
    Appendix A: Resources .............................. 99
  `);

  expect(entries.map((entry) => entry.rawText)).toEqual([
    "Introduction",
    "Chapter 1: Getting Started",
    "Chapter 2 Advanced Topics",
    "Appendix A: Resources",
  ]);
});
