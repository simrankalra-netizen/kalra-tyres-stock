import { describe, expect, it } from "vitest";
import { key, searchItems } from "@/lib/normalize";
import { checkMovement, checkStock, checkWordsInSentence } from "@/lib/check";
import { findItem } from "@/lib/match";
import type { Item, Parsed } from "@/lib/types";

let id = 0;
const item = (category: Item["category"], brand: string, model: string, size: string, g1: number, g2: number, g3: number): Item =>
  ({ id: ++id, category, brand, model, size, godown_1: g1, godown_2: g2, godown_3: g3 });

const ITEMS: Item[] = [
  item("tyre", "MRF", "ZLX", "185/65 R15", 8, 6, 3),
  item("tyre", "MRF", "ZVTV", "185/65 R15", 4, 0, 5),
  item("tyre", "MRF", "ZLX", "175/65 R14", 10, 4, 2),
  item("tyre", "CEAT", "Milaze X3", "185/65 R15", 6, 3, 1),
  item("battery", "Exide", "Mileage", "35Ah", 6, 2, 0),
  item("battery", "Amaron", "Go", "35Ah", 5, 5, 1),
];

const parsed = (p: Partial<Parsed>): Parsed => ({
  is_stock_movement: true, type: null, quantity: null, category: null, brand: null,
  model: null, size: null, from_godown: null, to_godown: null, ...p,
});

describe("Test 1: search by size", () => {
  it("treats all size spellings the same", () => {
    for (const s of ["185/65 R15", "1856515", "185 65 15", "185/65R15", "185-65-r15"]) {
      expect(key(s)).toBe("1856515");
    }
  });
  it("finds every item of a size, however it's typed", () => {
    for (const q of ["185/65 R15", "1856515"]) {
      expect(searchItems(ITEMS, q).map((i) => i.model).sort()).toEqual(["Milaze X3", "ZLX", "ZVTV"]);
    }
  });
  it("finds by brand + size words", () => {
    expect(searchItems(ITEMS, "exide 35").map((i) => i.brand)).toEqual(["Exide"]);
  });
  it("returns nothing for an empty search", () => {
    expect(searchItems(ITEMS, "  ")).toEqual([]);
  });
});

describe("Test 2: finding exactly one item", () => {
  it("matches the sale example", () => {
    const r = findItem(ITEMS, { category: null, brand: "MRF", model: "ZLX", size: "185/65 R15" });
    expect(r.ok && r.value.size).toBe("185/65 R15");
  });
  it("matches the battery example without a model", () => {
    const r = findItem(ITEMS, { category: "battery", brand: "Exide", model: null, size: "35Ah" });
    expect(r.ok && r.value.model).toBe("Mileage");
  });
  it("accepts a valid sale and transfer", () => {
    expect(checkMovement({ type: "sale", quantity: 2, from: 2, to: null }).ok).toBe(true);
    expect(checkMovement({ type: "transfer", quantity: 4, from: 1, to: 3 }).ok).toBe(true);
  });
});

describe("Test 3: errors, never guessing", () => {
  it("refuses when several items match", () => {
    const r = findItem(ITEMS, { category: null, brand: "MRF", model: null, size: "185/65 R15" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("2 items match");
  });
  it("refuses when nothing matches, and suggests close ones", () => {
    const r = findItem(ITEMS, { category: null, brand: "Apollo", model: null, size: "185/65 R15" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No item in stock matches");
  });
  it("refuses without a size or model", () => {
    expect(findItem(ITEMS, { category: null, brand: "MRF", model: null, size: null }).ok).toBe(false);
  });
  it("refuses overselling", () => {
    const r = checkStock(ITEMS[0], 7, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Godown 2 has only 6 of MRF ZLX 185/65 R15. You asked for 7.");
  });
  it("allows selling exactly what's there", () => {
    expect(checkStock(ITEMS[0], 6, 2).ok).toBe(true);
  });
  it("refuses bad movements", () => {
    expect(checkMovement({ type: null, quantity: 2, from: 2, to: null }).ok).toBe(false); // not a movement
    expect(checkMovement({ type: "sale", quantity: null, from: 2, to: null }).ok).toBe(false); // no quantity
    expect(checkMovement({ type: "sale", quantity: 0, from: 2, to: null }).ok).toBe(false); // zero
    expect(checkMovement({ type: "sale", quantity: 1.5, from: 2, to: null }).ok).toBe(false); // fraction
    expect(checkMovement({ type: "sale", quantity: 2, from: null, to: null }).ok).toBe(false); // no godown
    expect(checkMovement({ type: "sale", quantity: 2, from: 4, to: null }).ok).toBe(false); // no godown 4
    expect(checkMovement({ type: "transfer", quantity: 2, from: 1, to: null }).ok).toBe(false); // no "to"
    expect(checkMovement({ type: "transfer", quantity: 2, from: 2, to: 2 }).ok).toBe(false); // same godown
  });
  it("catches details the AI invented", () => {
    const s = "Sold 2 ZLX 185/65 R15 from Godown 2";
    expect(checkWordsInSentence(parsed({ brand: "MRF", model: "ZLX", size: "185/65 R15", quantity: 2, from_godown: 2 }), s).ok).toBe(false);
    expect(checkWordsInSentence(parsed({ model: "ZLX", size: "185/65 R15", quantity: 3, from_godown: 2 }), s).ok).toBe(false);
    expect(checkWordsInSentence(parsed({ model: "ZLX", size: "185/65 R15", quantity: 2, from_godown: 2 }), s).ok).toBe(true);
  });
  it("accepts sizes the AI tidied up", () => {
    const s = "sold 2 mrf zlx 1856515 from g2";
    expect(checkWordsInSentence(parsed({ brand: "MRF", model: "ZLX", size: "185/65 R15", quantity: 2, from_godown: 2 }), s).ok).toBe(true);
  });
});
