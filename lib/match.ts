// Finds exactly one item for what the AI read. Never guesses: 0 or 2+ matches is an error.
import { key, label } from "./normalize";
import type { Item, Parsed, Result } from "./types";

type Wanted = Pick<Parsed, "category" | "brand" | "model" | "size">;

function fits(item: Item, w: Wanted): boolean {
  if (w.category && item.category !== w.category) return false;
  if (w.brand && key(item.brand) !== key(w.brand)) return false;
  if (w.model && !key(item.model).includes(key(w.model))) return false;
  if (w.size && key(item.size) !== key(w.size)) return false;
  return true;
}

export function findItem(items: Item[], w: Wanted): Result<Item> {
  if (!w.size && !w.model) {
    return { ok: false, error: "Please include the size or model so I can find the exact item." };
  }
  const said = [w.brand, w.model, w.size, w.category].filter(Boolean).join(" ");
  const matches = items.filter((item) => fits(item, w));

  if (matches.length === 1) return { ok: true, value: matches[0] };

  if (matches.length > 1) {
    const list = matches.slice(0, 6).map(label).join("; ");
    return { ok: false, error: `${matches.length} items match "${said}". Please say which one: ${list}.` };
  }

  // Nothing matched: show items with the same size (or same brand) as hints.
  const close = items
    .filter((item) => (w.size ? key(item.size) === key(w.size) : w.brand ? key(item.brand) === key(w.brand) : false))
    .slice(0, 6)
    .map(label);
  return {
    ok: false,
    error: `No item in stock matches "${said}".` + (close.length ? ` Close matches: ${close.join("; ")}.` : ""),
  };
}
