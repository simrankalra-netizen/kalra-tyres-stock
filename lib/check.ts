// Plain-code rules. Nothing here uses AI.
import { inSentence, label } from "./normalize";
import { stockIn, type Godown, type Item, type Movement, type Parsed, type Result } from "./types";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, pair: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  first: 1, second: 2, third: 3,
};

// Every number written in the sentence, as digits ("G2", "4") or words ("two").
function numbersIn(sentence: string): Set<number> {
  const found = new Set<number>();
  for (const m of sentence.match(/\d+/g) ?? []) found.add(Number(m));
  for (const w of sentence.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (w in NUMBER_WORDS) found.add(NUMBER_WORDS[w]);
  }
  return found;
}

// Guard against the AI inventing details: everything it filled in must be in the sentence.
export function checkWordsInSentence(p: Parsed, sentence: string): Result<null> {
  const invented: string[] = [];
  for (const [name, value] of [["brand", p.brand], ["model", p.model], ["size", p.size]] as const) {
    if (value && !inSentence(sentence, value)) invented.push(`${name} "${value}"`);
  }
  const nums = numbersIn(sentence);
  if (p.quantity !== null && !nums.has(p.quantity)) invented.push(`quantity ${p.quantity}`);
  if (p.from_godown !== null && !nums.has(p.from_godown)) invented.push(`from Godown ${p.from_godown}`);
  if (p.to_godown !== null && !nums.has(p.to_godown)) invented.push(`to Godown ${p.to_godown}`);
  if (invented.length > 0) {
    return { ok: false, error: `The AI read ${invented.join(", ")}, but that isn't in your sentence. Please retype it more clearly.` };
  }
  return { ok: true, value: null };
}

function asGodown(n: unknown): Godown | null {
  return n === 1 || n === 2 || n === 3 ? n : null;
}

// Does the movement make sense? Used for the preview AND again on Confirm.
export function checkMovement(input: {
  type: unknown; quantity: unknown; from: unknown; to: unknown;
}): Result<Omit<Movement, "itemId">> {
  const { type, quantity } = input;
  if (type !== "sale" && type !== "transfer") {
    return { ok: false, error: "I couldn't find a sale or move in that. Example: Sold 2 MRF ZLX 185/65 R15 from Godown 2" };
  }
  if (quantity === null || quantity === undefined) {
    return { ok: false, error: "How many? Add the quantity, e.g. \"Sold 2 …\"." };
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "The quantity must be a whole number, 1 or more." };
  }
  if (input.from === null || input.from === undefined) {
    return { ok: false, error: "Which godown did it come from? Add e.g. \"from Godown 2\"." };
  }
  const from = asGodown(input.from);
  if (!from) return { ok: false, error: "Godown must be 1, 2 or 3." };

  if (type === "sale") {
    if (input.to !== null && input.to !== undefined) {
      return { ok: false, error: "A sale takes stock out of one godown only. Did you mean \"Moved … to Godown X\"?" };
    }
    return { ok: true, value: { type, quantity, from, to: null } };
  }
  if (input.to === null || input.to === undefined) {
    return { ok: false, error: "Which godown did it go to? Add e.g. \"to Godown 3\"." };
  }
  const to = asGodown(input.to);
  if (!to) return { ok: false, error: "Godown must be 1, 2 or 3." };
  if (to === from) return { ok: false, error: `From and to are the same godown (Godown ${from}).` };
  return { ok: true, value: { type, quantity, from, to } };
}

export function checkStock(item: Item, quantity: number, from: Godown): Result<null> {
  const have = stockIn(item, from);
  if (have < quantity) {
    return { ok: false, error: `Godown ${from} has only ${have} of ${label(item)}. You asked for ${quantity}.` };
  }
  return { ok: true, value: null };
}
