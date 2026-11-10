// The one place that talks to the database.
// - If DATABASE_URL is set (on Vercel), it uses Neon Postgres in the cloud.
// - If it's empty (on this computer), it uses a local Postgres stored in the .data folder.
// Both understand exactly the same SQL, so the rest of the app doesn't care which one runs.
import { neon } from "@neondatabase/serverless";

type Query = (text: string, params?: unknown[]) => Promise<any[]>;

const g = globalThis as unknown as { stockDb?: Promise<Query> };

async function connect(): Promise<Query> {
  const url = process.env.DATABASE_URL;
  let run: Query;
  if (url) {
    const sql = neon(url);
    run = (text, params = []) => sql.query(text, params) as Promise<any[]>;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    mkdirSync("./.data", { recursive: true });
    const db = new PGlite("./.data/stock");
    run = async (text, params = []) => (await db.query(text, params)).rows as any[];
  }
  await setUp(run);
  return run;
}

export async function query(text: string, params: unknown[] = []): Promise<any[]> {
  if (!g.stockDb) g.stockDb = connect();
  try {
    return await (await g.stockDb)(text, params);
  } catch (err) {
    g.stockDb = undefined; // try connecting afresh next time
    throw err;
  }
}

// Creates the tables the first time, and fills in sample stock if there's none yet.
async function setUp(run: Query) {
  await run(`CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('tyre','alloy','battery','tube')),
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    size TEXT NOT NULL,
    godown_1 INT NOT NULL DEFAULT 0 CHECK (godown_1 >= 0),
    godown_2 INT NOT NULL DEFAULT 0 CHECK (godown_2 >= 0),
    godown_3 INT NOT NULL DEFAULT 0 CHECK (godown_3 >= 0)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_id INT NOT NULL REFERENCES items(id),
    type TEXT NOT NULL CHECK (type IN ('sale','transfer')),
    quantity INT NOT NULL CHECK (quantity > 0),
    from_godown INT NOT NULL CHECK (from_godown BETWEEN 1 AND 3),
    to_godown INT CHECK (to_godown BETWEEN 1 AND 3)
  )`);
  const [{ count }] = await run(`SELECT COUNT(*)::int AS count FROM items`);
  if (count > 0) return;

  const values = SAMPLE_STOCK.map(
    (_, i) => `($${i * 7 + 1},$${i * 7 + 2},$${i * 7 + 3},$${i * 7 + 4},$${i * 7 + 5},$${i * 7 + 6},$${i * 7 + 7})`,
  ).join(",");
  await run(
    `INSERT INTO items (category, brand, model, size, godown_1, godown_2, godown_3) VALUES ${values}`,
    SAMPLE_STOCK.flat(),
  );
}

// Sample stock: [category, brand, model, size, Godown 1, Godown 2, Godown 3]
// Replace with your real stock (then delete the .data folder so it reloads).
const SAMPLE_STOCK: [string, string, string, string, number, number, number][] = [
  ["tyre", "MRF", "ZLX", "185/65 R15", 8, 6, 3],
  ["tyre", "MRF", "ZVTV", "185/65 R15", 4, 0, 5],
  ["tyre", "MRF", "ZLX", "175/65 R14", 10, 4, 2],
  ["tyre", "MRF", "Wanderer Street", "215/60 R16", 2, 3, 0],
  ["tyre", "Apollo", "Amazer 4G Life", "185/65 R15", 5, 2, 6],
  ["tyre", "Apollo", "Alnac 4G", "195/55 R16", 3, 0, 4],
  ["tyre", "CEAT", "Milaze X3", "185/65 R15", 6, 3, 1],
  ["tyre", "CEAT", "SecuraDrive", "205/55 R16", 2, 2, 2],
  ["tyre", "Bridgestone", "Ecopia EP150", "175/65 R14", 7, 1, 0],
  ["tyre", "JK Tyre", "UX Royale", "165/80 R14", 9, 5, 3],
  ["tyre", "Yokohama", "Earth-1", "195/65 R15", 1, 4, 2],
  ["alloy", "Neo Wheels", "Spider", "15 inch 4x100", 8, 0, 4],
  ["alloy", "Neo Wheels", "Thunder", "16 inch 5x114.3", 4, 4, 0],
  ["alloy", "Kosei", "K1 Racing", "14 inch 4x100", 0, 8, 4],
  ["battery", "Exide", "Mileage", "35Ah", 6, 2, 0],
  ["battery", "Exide", "Matrix", "65Ah", 3, 1, 2],
  ["battery", "Amaron", "Go", "35Ah", 5, 5, 1],
  ["battery", "Amaron", "Pro", "45Ah", 2, 0, 3],
  ["battery", "SF Sonic", "Flash Start", "55Ah", 1, 3, 0],
  ["tube", "MRF", "Car Tube", "165/80 R14", 12, 6, 10],
  ["tube", "Apollo", "Car Tube", "155/80 R13", 8, 0, 5],
  ["tube", "CEAT", "Bike Tube", "3.00-18", 20, 15, 10],
];
