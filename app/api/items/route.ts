// Search. No AI.
import { query } from "@/lib/db";
import { searchItems } from "@/lib/normalize";
import type { Item } from "@/lib/types";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const items = (await query("SELECT * FROM items ORDER BY category, brand, model, size")) as Item[];
    return Response.json({ items: searchItems(items, q) });
  } catch (err) {
    console.error("DB error:", err);
    return Response.json({ error: "Can't reach the stock list. Check the internet and retry." }, { status: 503 });
  }
}
