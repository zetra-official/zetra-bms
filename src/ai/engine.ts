// src/ai/engine.ts
import { supabase } from "@/src/supabaseClient";

export type AiMode = "AUTO" | "SW" | "EN";

export type ChatHistoryItem = {
  role: "user" | "assistant";
  text: string;
};

export type GenerateReplyArgs = {
  text: string;
  mode: AiMode;
  context?: Record<string, any>;
  history?: ChatHistoryItem[];
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function safeJsonParse(s: any): any | null {
  try {
    if (typeof s !== "string") return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getStatus(err: any): number | undefined {
  // Supabase FunctionsHttpError usually stores status here:
  const ctxStatus = err?.context?.status;
  if (typeof ctxStatus === "number") return ctxStatus;

  // Some versions might expose status directly (rare)
  const direct = err?.status;
  if (typeof direct === "number") return direct;

  return undefined;
}

function getErrorBody(err: any): any {
  const body = err?.context?.body;

  // body can be object, string, or undefined
  if (!body) return null;
  if (typeof body === "object") return body;

  const parsed = safeJsonParse(body);
  return parsed ?? body;
}

function pickBestMessage(err: any): string {
  // 1) direct message
  const direct =
    err?.message ||
    err?.error_description ||
    err?.error ||
    (typeof err === "string" ? err : "");

  // 2) message from body (Supabase function returned json)
  const body = getErrorBody(err);
  const fromBody =
    (body && typeof body === "object" && (body.message || body.error || body.msg)) ||
    (typeof body === "string" ? body : "");

  const msg = clean(fromBody) || clean(direct);
  return msg || "Edge Function returned a non-2xx status code";
}

function buildHint(status?: number) {
  if (status === 401) {
    return (
      "Tip (401):\n" +
      "• User hajalogin, au token haijapita.\n" +
      "• Pia hakikisha kwenye Supabase Edge Function: 'Verify JWT with legacy secret' = OFF (recommended).\n" +
      "• Kisha test tena ukiwa ume-login ndani ya app."
    );
  }
  if (status === 403) {
    return (
      "Tip (403):\n" +
      "• Access imekataliwa. Mara nyingi JWT/role/policy ndani ya function.\n" +
      "• Angalia function logs (Supabase → Edge Functions → Logs)."
    );
  }
  if (status === 429) {
    return (
      "Tip (429):\n" +
      "• Rate limit / quota upande wa OpenAI.\n" +
      "• Jaribu tena baada ya muda au punguza request size."
    );
  }
  if (status === 500) {
    return (
      "Tip (500):\n" +
      "• Kawaida ni OPENAI_API_KEY haipo kwenye Supabase function secrets, au model/endpoint ndani ya function imekosewa.\n" +
      "• Fungua Supabase → Edge Functions → ai_reply_v1 → Logs uone error halisi."
    );
  }
  return "";
}

/**
 * Calls Supabase Edge Function: ai_reply_v1
 * - Requires user to be logged in (supabase-js attaches Authorization token automatically)
 * - Edge function should have "Verify JWT with legacy secret" = OFF (recommended)
 */
export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const text = clean(args.text);
  const mode = args.mode ?? "AUTO";

  if (!text) return "Tafadhali andika swali.";

  const body = {
    text,
    mode,
    history: Array.isArray(args.history) ? args.history : [],
    context: args.context ?? {},
  };

  const { data, error } = await supabase.functions.invoke("ai_reply_v1", { body });

  if (error) {
    const status = getStatus(error);
    const msg = pickBestMessage(error);
    const hint = buildHint(status);

    // show status + best message + hint (if any)
    const header = status ? `Error ${status}` : "Error";
    throw new Error(`${header}: ${msg}${hint ? `\n\n${hint}` : ""}`);
  }

  if (!data) throw new Error("No response from AI function.");

  // Support multiple response shapes:
  // A) { reply: "..." }
  // B) { text: "..." }
  // C) { message: "..." }
  // D) { ok: true, reply: "..." }
  // E) { ok: false, error: "...", hint?: "...", status?: number }
  if ("ok" in data && (data as any).ok === false) {
    const errMsg = clean((data as any).error) || "AI error";
    const hint = clean((data as any).hint);
    const st = typeof (data as any).status === "number" ? (data as any).status : undefined;
    throw new Error(`${errMsg}${st ? ` (OpenAI ${st})` : ""}${hint ? `\n${hint}` : ""}`);
  }

  const reply =
    clean((data as any).reply) ||
    clean((data as any).text) ||
    clean((data as any).message) ||
    "";

  if (!reply) throw new Error(`Unexpected AI response: ${JSON.stringify(data)}`);

  return reply;
}