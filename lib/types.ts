export type Category = "tyre" | "alloy" | "battery" | "tube";
export type Godown = 1 | 2 | 3;

export type Item = {
  id: number;
  category: Category;
  brand: string;
  model: string;
  size: string;
  godown_1: number;
  godown_2: number;
  godown_3: number;
};

// What the AI read from the sentence. null = "not stated".
export type Parsed = {
  is_stock_movement: boolean;
  type: "sale" | "transfer" | null;
  quantity: number | null;
  category: Category | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  from_godown: number | null; // plain code checks it's 1, 2 or 3
  to_godown: number | null;
};

// A movement ready to be confirmed.
export type Movement = {
  itemId: number;
  type: "sale" | "transfer";
  quantity: number;
  from: Godown;
  to: Godown | null;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function stockIn(item: Item, g: Godown): number {
  return g === 1 ? item.godown_1 : g === 2 ? item.godown_2 : item.godown_3;
}
