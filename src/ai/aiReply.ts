// src/ai/aiReply.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type AiMode = "AUTO" | "SW" | "EN";
export type AiRole = "user" | "assistant";

export type AiHistoryMsg = {
  role: AiRole;
  text: string;
};

export type AiReplyRequest = {
  text: string;
  mode?: AiMode;
  history?: AiHistoryMsg[];
  context?: Record<string, unknown>;
};

export type AiReplyResponse =
  | { ok: true; text: string }
  | { ok?: false; error?: string; hint?: string; status?: number; body?: string };

/**
 * ✅ Canonical ZETRA AI call (NO fetch(url)).
 * Uses Supabase Edge Function invoke which auto-attaches:
 * - apikey
 * - Authorization Bearer (if user is logged in)
 */
export async function aiReply(
  supabase: SupabaseClient,
  req: AiReplyRequest
): Promise<{ text: string }> {
  const text = String(req.text ?? "").trim();
  if (!text) throw new Error("AI: text is required");

  const { data, error } = await supabase.functions.invoke<AiReplyResponse>(
    "ai_reply_v1",
    {
      body: {
        text,
        mode: req.mode ?? "AUTO",
        history: Array.isArray(req.history) ? req.history : [],
        context: req.context ?? {},
      },
    }
  );

  // Network / function-level error (includes non-2xx)
  if (error) {
    // error.message usually includes "Edge Function returned a non-2xx status code"
    throw new Error(`AI invoke failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("AI: empty response from function");
  }

  if ((data as any).ok === true && typeof (data as any).text === "string") {
    return { text: (data as any).text };
  }

  // When function returns structured error
  const errMsg =
    (data as any).error ??
    (data as any).message ??
    "AI: unknown error from function";

  const hint = (data as any).hint ? ` | hint: ${(data as any).hint}` : "";
  const status = (data as any).status ? ` | status: ${(data as any).status}` : "";
  throw new Error(`${errMsg}${status}${hint}`);
}