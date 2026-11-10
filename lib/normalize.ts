import type { Item } from "./types";

// "185/65 R15" -> "18565r15": lowercase, keep only letters and digits.
export function plain(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Like plain(), but also drops the R / ZR between tyre numbers,
// so "185/65 R15", "185 65 15" and "1856515" all become "1856515".
export function key(s: string): string {
  return plain(s).replace(/(\d)z?r(\d)/g, "$1$2");
}

function contains(haystack: string, needle: string): boolean {
  return (
    (key(needle) !== "" && key(haystack).includes(key(needle))) ||
    (plain(needle) !== "" && plain(haystack).includes(plain(needle)))
  );
}

export function label(item: Item): string {
  return `${item.brand} ${item.model} ${item.size}`;
}

// Search: the whole query matches the size, or every word appears somewhere in the item.
export function searchItems(items: Item[], q: string): Item[] {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return items.filter((item) => {
    const all = `${item.category} ${item.brand} ${item.model} ${item.size}`;
    return contains(item.size, q) || words.every((w) => contains(all, w));
  });
}

export function inSentence(sentence: string, word: string): boolean {
  return contains(sentence, word);
}
