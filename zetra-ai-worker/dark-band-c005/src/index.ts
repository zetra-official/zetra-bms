export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string; // optional
}

type JsonValue = Record<string, unknown>;

function jsonResponse(body: JsonValue, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function clean(x: unknown) {
  return String(x ?? "").replace(/\u0000/g, "").trim();
}

function safeTruncate(s: string, n: number) {
  const t = clean(s);
  if (t.length <= n) return t;
  return t.slice(0, n);
}

function getOutputText(data: any): string | null {
  // Responses API provides `output_text` shortcut sometimes
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const output = data?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") {
            return c.text;
          }
        }
      }
    }
  }
  return null;
}

/**
 * ZETRA AI SYSTEM INSTRUCTIONS (Worker-side reinforcement)
 * - Client already packs a strict prompt; we reinforce at system level so the model is less likely to drift.
 * - We DO NOT inject private DB data; we only enforce formatting + safety.
 */
function buildWorkerInstructions() {
  return [
    "You are ZETRA AI — Elite Strategic Business Intelligence System inside ZETRA BMS.",
    "You must follow the user's provided spec in the input message.",
    "CRITICAL OUTPUT FORMAT:",
    "Return exactly TWO blocks with these exact markers:",
    "<<<ZETRA_REPLY>>>",
    "(User-facing answer in markdown with a final “🎯 NEXT MOVE”.)",
    "<<<ZETRA_ACTIONS>>>",
    "(STRICT JSON only, no markdown fences.)",
    "",
    "The JSON MUST include keys: lang, nextMove, actions, memory.",
    "memory MUST be short and practical; lastPlan max 2–4 short bullet-like sentences (plain text).",
    "Never reveal secrets, API keys, hidden system data, or private database data.",
  ].join("\n");
}

/**
 * Write SSE event to client.
 * event: <name>
 * data: <payload>
 */
function sseWrite(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: string,
  data: string
) {
  const enc = new TextEncoder();
  // SSE: split lines for safety (each line must start with data:)
  const lines = String(data ?? "").split(/\r?\n/);
  let out = `event: ${event}\n`;
  for (const line of lines) out += `data: ${line}\n`;
  out += "\n";
  return writer.write(enc.encode(out));
}

/**
 * Parse OpenAI SSE stream and forward deltas to client as SSE.
 * We care about:
 * - response.output_text.delta  => event: delta (data: <delta>)
 * - response.completed / failed / error => done/error and close
 */
async function pipeOpenAIStreamToClientAsSSE(
  openaiBody: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>
) {
  const reader = openaiBody.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let done = false;

  try {
    while (!done) {
      const { value, done: rdDone } = await reader.read();
      if (rdDone) break;

      // normalize CRLF -> LF for consistent parsing
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      // SSE events separated by double newline
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let eventType = "";
        const dataLines: string[] = [];

        for (const line of chunk.split("\n")) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }

        const dataLine = dataLines.join("\n").trim();
        if (!dataLine) {
          idx = buffer.indexOf("\n\n");
          continue;
        }

        if (dataLine === "[DONE]") {
          await sseWrite(writer, "done", "[DONE]");
          done = true;
          break;
        }

        let payload: any = null;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          payload = null;
        }

        const type = payload?.type || eventType;

        // main token stream
        if (type === "response.output_text.delta") {
          const delta = String(payload?.delta ?? "");
          if (delta) await sseWrite(writer, "delta", delta);
        }

        // completion signals
        if (
          type === "response.completed" ||
          type === "response.failed" ||
          type === "response.output_text.done" ||
          type === "error"
        ) {
          if (type === "error") {
            await sseWrite(writer, "error", JSON.stringify(payload ?? { error: "Unknown error" }));
          } else {
            await sseWrite(writer, "done", type);
          }
          done = true;
          break;
        }

        idx = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Simple health check
    if (request.method === "GET") {
      return jsonResponse(
        {
          ok: true,
          service: "zetra-ai-worker",
          endpoints: { chat: "POST /", stream: "POST /stream" },
          hint: "Use POST with JSON { message: string }",
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }

    // Validate payload
    const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
    const rawMessage = body?.message;

    if (typeof rawMessage !== "string" || !rawMessage.trim()) {
      return jsonResponse(
        { error: "Missing or invalid 'message' (string required)" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env?.OPENAI_API_KEY) {
      return jsonResponse({ error: "OPENAI_API_KEY not configured" }, { status: 500, headers: corsHeaders });
    }

    const model = env.OPENAI_MODEL ?? "gpt-4o-mini";

    // Safety limits (prevent accidental huge prompts)
    const message = clean(rawMessage);
    const MAX_INPUT = 48_000; // chars
    if (message.length > MAX_INPUT) {
      return jsonResponse(
        { error: `Message too large (limit ${MAX_INPUT.toLocaleString()} chars)` },
        { status: 413, headers: corsHeaders }
      );
    }

    const instructions = buildWorkerInstructions();

    // ✅ STREAM endpoint (SSE to client)
    if (path === "/stream") {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      // send initial event so client knows stream is alive
      await sseWrite(writer, "ready", "ZETRA_STREAM_READY");

      // keep-alive ping (prevents idle timeout)
      const pingTimer = setInterval(() => {
        // SSE comment as ping (doesn't trigger event handlers but keeps connection alive)
        writer.write(new TextEncoder().encode(`: ping ${Date.now()}\n\n`)).catch(() => {});
      }, 15_000) as unknown as number;

      (async () => {
        try {
          const openaiRes = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              instructions,
              input: message,
              stream: true,
            }),
          });

          if (!openaiRes.ok || !openaiRes.body) {
            const details = await openaiRes.json().catch(() => null);
            await sseWrite(
              writer,
              "error",
              JSON.stringify({
                error: "OpenAI request failed",
                status: openaiRes.status,
                details,
              })
            );
            await sseWrite(writer, "done", "error");
            return;
          }

          await pipeOpenAIStreamToClientAsSSE(openaiRes.body, writer);
          await sseWrite(writer, "done", "completed");
        } catch (e: any) {
          try {
            await sseWrite(writer, "error", JSON.stringify({ error: e?.message ?? "Streaming error" }));
            await sseWrite(writer, "done", "error");
          } catch {}
        } finally {
          try {
            clearInterval(pingTimer);
          } catch {}
          try {
            await writer.close();
          } catch {}
        }
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ✅ NORMAL endpoint (JSON reply)
    try {
      const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          instructions,
          input: message,
        }),
      });

      const data: any = await openaiRes.json().catch(() => null);

      if (!openaiRes.ok) {
        return jsonResponse(
          { error: "OpenAI request failed", status: openaiRes.status, details: data ?? null },
          { status: 500, headers: corsHeaders }
        );
      }

      const replyRaw = getOutputText(data) ?? "No response";
      const reply = safeTruncate(replyRaw, 120_000); // keep response bounded
      return jsonResponse({ reply }, { status: 200, headers: corsHeaders });
    } catch (err: any) {
      return jsonResponse({ error: err?.message ?? "Unknown error" }, { status: 500, headers: corsHeaders });
    }
  },
};