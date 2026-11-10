// The ONLY place the stock app uses AI. It turns a sentence into a fixed form.
// It never sees the stock and never changes anything.
import "server-only";
import { z } from "zod";
import { askGeminiForJson } from "./gemini";
import type { Parsed, Result } from "./types";

const Form = z.object({
  is_stock_movement: z.boolean().describe("true only if the sentence records a sale or a move between godowns"),
  type: z.enum(["sale", "transfer"]).nullable(),
  quantity: z.number().int().nullable().describe("number of pieces; null if not stated"),
  category: z.enum(["tyre", "alloy", "battery", "tube"]).nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable().describe("model name only, without brand or size"),
  size: z.string().nullable().describe("tyre/tube size like 185/65 R15, alloy size, or battery capacity like 35Ah"),
  from_godown: z.number().int().nullable(),
  to_godown: z.number().int().nullable(),
});

const INSTRUCTIONS = `You read one sentence typed at the counter of Kalra Tyres, a tyre shop in India.
The shop has 3 godowns (Godown 1, 2 and 3) and sells tyres, alloys, batteries and tubes.
Fill in the form from the sentence only.

- type: "sale" if stock went out to a customer (sold, gone, given, bika). "transfer" if stock moved from one godown to another. If it is neither, set is_stock_movement to false and type to null.
- Copy brand, model and size as they are written in the sentence. Never add, correct or guess a brand, model, size, quantity or godown that is not in the sentence. If something is not stated, use null.
- category: only if a word in the sentence makes it clear (e.g. "battery", "Ah", "tube", "alloy", "tyre"); otherwise null.
- from_godown / to_godown: the number 1, 2 or 3 ("G2", "godown two", "second godown" all mean 2). For a sale, to_godown is null.
- quantity: whole number of pieces ("a" or "one" = 1, "pair" = 2).`;

export function parseSentence(sentence: string): Promise<Result<Parsed>> {
  return askGeminiForJson(sentence, Form, { system: INSTRUCTIONS });
}
