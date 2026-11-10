// GET = activity list. POST = Confirm: re-check, then change stock + log it in one safe step.
import { checkMovement } from "@/lib/check";
import { query } from "@/lib/db";
import { stockIn, type Item } from "@/lib/types";

const DB_DOWN = "Can't reach the stock list. Nothing was changed. Check the internet and retry.";

export async function GET() {
  try {
    const rows = await query(
      `SELECT m.id, m.created_at, m.type, m.quantity, m.from_godown, m.to_godown,
              i.category, i.brand, i.model, i.size
       FROM movements m JOIN items i ON i.id = m.item_id
       ORDER BY m.created_at DESC, m.id DESC LIMIT 50`,
    );
    return Response.json({ movements: rows });
  } catch (err) {
    console.error("DB error:", err);
    return Response.json({ error: DB_DOWN }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const itemId = body.itemId;
  if (!Number.isInteger(itemId)) return Response.json({ ok: false, error: "No item chosen." });

  // Check the rules again: never trust the screen.
  const move = checkMovement({ type: body.type, quantity: body.quantity, from: body.from, to: body.to });
  if (!move.ok) return Response.json({ ok: false, error: move.error });
  const m = move.value;

  // m.from / m.to are checked to be exactly 1, 2 or 3, so they're safe to put in the column name.
  const fromCol = `godown_${m.from}`;
  const set = m.to
    ? `${fromCol} = ${fromCol} - $2, godown_${m.to} = godown_${m.to} + $2`
    : `${fromCol} = ${fromCol} - $2`;

  try {
    // One step: only subtracts if there's still enough stock, and logs the movement at the same time.
    const saved = await query(
      `WITH changed AS (
         UPDATE items SET ${set} WHERE id = $1 AND ${fromCol} >= $2::int RETURNING id
       )
       INSERT INTO movements (item_id, type, quantity, from_godown, to_godown)
       SELECT id, $3::text, $2::int, $4::int, $5::int FROM changed
       RETURNING id`,
      [itemId, m.quantity, m.type, m.from, m.to],
    );
    if (saved.length === 1) return Response.json({ ok: true });

    // Nothing saved: explain why.
    const [item] = (await query("SELECT * FROM items WHERE id = $1", [itemId])) as Item[];
    if (!item) return Response.json({ ok: false, error: "That item no longer exists. Nothing was changed." });
    return Response.json({
      ok: false,
      error: `Stock changed since the preview: Godown ${m.from} now has ${stockIn(item, m.from)}. Nothing was changed.`,
    });
  } catch (err) {
    console.error("DB error:", err);
    return Response.json({ ok: false, error: DB_DOWN }, { status: 503 });
  }
}
