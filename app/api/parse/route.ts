// Sentence -> AI form -> plain-code checks -> preview. Changes NOTHING.
import { checkMovement, checkStock, checkWordsInSentence } from "@/lib/check";
import { query } from "@/lib/db";
import { findItem } from "@/lib/match";
import { parseSentence } from "@/lib/parse-sentence";
import { stockIn, type Item } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sentence = typeof body.sentence === "string" ? body.sentence.trim() : "";
  if (!sentence) return Response.json({ ok: false, error: "Type a sentence first." });
  if (sentence.length > 300) return Response.json({ ok: false, error: "That's too long. One sale or move per sentence." });

  // 1. AI reads the sentence.
  const parsed = await parseSentence(sentence);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error });
  const understood = parsed.value;
  const fail = (error: string) => Response.json({ ok: false, error, understood });

  // 2. Plain code checks everything, stopping at the first problem.
  const words = checkWordsInSentence(understood, sentence);
  if (!words.ok) return fail(words.error);

  const move = checkMovement({
    type: understood.is_stock_movement ? understood.type : null,
    quantity: understood.quantity,
    from: understood.from_godown,
    to: understood.to_godown,
  });
  if (!move.ok) return fail(move.error);

  let items: Item[];
  try {
    items = (await query("SELECT * FROM items")) as Item[];
  } catch (err) {
    console.error("DB error:", err);
    return fail("Can't reach the stock list. Check the internet and retry.");
  }
  const found = findItem(items, understood);
  if (!found.ok) return fail(found.error);
  const item = found.value;
  const m = move.value;

  const stock = checkStock(item, m.quantity, m.from);
  if (!stock.ok) return fail(stock.error);

  // 3. Preview of what Confirm would do.
  const fromBefore = stockIn(item, m.from);
  const toBefore = m.to ? stockIn(item, m.to) : null;
  return Response.json({
    ok: true,
    understood,
    item,
    movement: { itemId: item.id, ...m },
    change: {
      from: { godown: m.from, before: fromBefore, after: fromBefore - m.quantity },
      to: m.to ? { godown: m.to, before: toBefore, after: toBefore! + m.quantity } : null,
    },
  });
}
