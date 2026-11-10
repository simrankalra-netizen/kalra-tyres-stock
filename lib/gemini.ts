// Reusable Gemini service. Call it from any API route or server code:
//
//   const r = await askGemini("Summarise today's sales: ...");
//   const r = await askGeminiForJson(sentence, MyZodSchema, { system: "..." });
//   if (!r.ok) show(r.error) else use(r.value)
//
// The line below makes the build FAIL if this file is ever imported into browser code,
// so the API key can never end up in the page.
import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Result } from "./types";

// Free-tier model: stable, fast and low-cost. Change it here and every caller follows.
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

type Options = {
  system?: string; // instructions for the model
  timeoutMs?: number; // default 9 s, so callers always answer within 10 s
};

let client: GoogleGenAI | null = null;

function getClient(): Result<GoogleGenAI> {
  const apiKey = process.env.GEMINI_API_KEY; // read on the server only, from .env
  if (!apiKey || apiKey === "paste-your-key-here") {
    return { ok: false, error: "Gemini API key missing: paste it into .env (GEMINI_API_KEY=...), then restart the app." };
  }
  client ??= new GoogleGenAI({ apiKey });
  return { ok: true, value: client };
}

// Turns any failure into a plain message that's safe to show on screen (never includes the key).
function friendlyError(err: unknown): string {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return "Gemini took too long to answer. Nothing was changed. Try again.";
  }
  if (err instanceof ApiError) {
    if (err.status === 400 && /api key/i.test(err.message)) {
      return "Gemini rejected the API key. Check GEMINI_API_KEY in .env, then restart the app.";
    }
    if (err.status === 401 || err.status === 403) {
      return "Gemini rejected the API key. Check GEMINI_API_KEY in .env, then restart the app.";
    }
    if (err.status === 429) return "Free Gemini limit reached for now. Wait a minute and try again.";
    if (err.status >= 500) return "Gemini is busy right now. Try again in a moment.";
  }
  return "Couldn't reach Gemini right now. Check the internet and try again.";
}

async function generate(prompt: string, options: Options, json?: unknown): Promise<Result<string>> {
  const c = getClient();
  if (!c.ok) return c;
  try {
    const res = await c.value.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: options.system,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? 9000),
        ...(json ? { responseMimeType: "application/json", responseJsonSchema: json } : {}),
      },
    });
    const text = res.text;
    if (!text) return { ok: false, error: "Gemini gave an empty answer. Please try again." };
    return { ok: true, value: text };
  } catch (err) {
    console.error("Gemini error:", err instanceof Error ? err.message : err);
    return { ok: false, error: friendlyError(err) };
  }
}

/** Plain text answer. */
export function askGemini(prompt: string, options: Options = {}): Promise<Result<string>> {
  return generate(prompt, options);
}

/** Answer forced into a shape you define with zod, and checked before you get it. */
export async function askGeminiForJson<T extends z.ZodType>(
  prompt: string,
  schema: T,
  options: Options = {},
): Promise<Result<z.infer<T>>> {
  const text = await generate(prompt, options, z.toJSONSchema(schema));
  if (!text.ok) return text;
  try {
    const checked = schema.safeParse(JSON.parse(text.value));
    if (checked.success) return { ok: true, value: checked.data };
  } catch {
    // fall through: not valid JSON
  }
  return { ok: false, error: "Gemini's answer wasn't in the expected format. Please try again." };
}
