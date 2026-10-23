// Server-only module: import it from route handlers, never from client components.
// One place for the model provider, so switching vendors or models touches only this file.
// Keys stay server-side: never prefix them with NEXT_PUBLIC_.

const DEFAULT_MODEL = "gpt-5.4-mini";

// Best-effort per-user limiter. Per server instance only — enough for a private app,
// replace with a shared store (e.g. a Supabase table) before any public release.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function allowRequest(userId: string, perMinute = 6): boolean {
  const now = Date.now();
  if (attempts.size > 2000) for (const [id, e] of attempts) if (e.resetAt <= now) attempts.delete(id);
  const prev = attempts.get(userId);
  if (!prev || prev.resetAt <= now) { attempts.set(userId, { count: 1, resetAt: now + 60_000 }); return true; }
  if (prev.count >= perMinute) return false;
  prev.count += 1;
  return true;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type StructuredResult =
  | { ok: true; json: unknown }
  | { ok: false; reason: "quota" | "truncated" | "refused" | "failed" };

export async function generateStructured(opts: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: object;
  maxOutputTokens: number;
  timeoutMs?: number;
}): Promise<StructuredResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false,
        max_output_tokens: opts.maxOutputTokens,
        instructions: opts.instructions,
        input: opts.input,
        text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      cache: "no-store",
    });
    // Upstream error bodies are not forwarded: they can contain account details.
    if (!res.ok) return { ok: false, reason: res.status === 429 ? "quota" : "failed" };
    const body = (await res.json()) as {
      status?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    if (body.status === "incomplete") return { ok: false, reason: "truncated" };
    const parts = (body.output ?? []).flatMap(o => o.content ?? []);
    if (parts.some(p => p.type === "refusal")) return { ok: false, reason: "refused" };
    const text = parts.filter(p => p.type === "output_text").map(p => p.text ?? "").join("");
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
