export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string; // optional (chat/vision)
  OPENAI_IMAGE_MODEL?: string; // optional (images)
  OPENAI_TRANSCRIBE_MODEL?: string; // optional (speech-to-text)
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

/** Extract text from Responses API payload */
function getOutputText(data: any): string | null {
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

/** Extract first URL from Images API response */
function getImageUrlFromImagesApi(data: any): string | null {
  const url = data?.data?.[0]?.url;
  if (typeof url === "string" && url.trim()) return url.trim();

  // If API returns base64 instead (b64_json), convert to data URL
  const b64 = data?.data?.[0]?.b64_json;
  if (typeof b64 === "string" && b64.trim()) {
    return `data:image/png;base64,${b64.trim()}`;
  }

  return null;
}

/**
 * ZETRA AI SYSTEM INSTRUCTIONS (Worker-side reinforcement)
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
 */
function sseWrite(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: string,
  data: string
) {
  const enc = new TextEncoder();
  const lines = String(data ?? "").split(/\r?\n/);
  let out = `event: ${event}\n`;
  for (const line of lines) out += `data: ${line}\n`;
  out += "\n";
  return writer.write(enc.encode(out));
}

/**
 * Parse OpenAI SSE stream and forward deltas to client as SSE.
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

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

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

        if (type === "response.output_text.delta") {
          const delta = String(payload?.delta ?? "");
          if (delta) await sseWrite(writer, "delta", delta);
        }

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

    // Health check
    if (request.method === "GET") {
      return jsonResponse(
        {
          ok: true,
          service: "zetra-ai-worker",
          endpoints: {
            chat: "POST /",
            stream: "POST /stream",
            image: "POST /image",
            vision: "POST /vision",
            transcribe: "POST /transcribe",
          },
          hint: "Use POST with JSON payloads (or multipart for /transcribe)",
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }

    if (!env?.OPENAI_API_KEY) {
      return jsonResponse(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    // ✅ /transcribe (multipart/form-data) -> OpenAI Audio Transcriptions
    if (path === "/transcribe") {
      try {
        const formIn = await request.formData();
        const file = formIn.get("file");

        if (!(file instanceof File)) {
          return jsonResponse(
            { error: "Missing 'file' in multipart form-data" },
            { status: 400, headers: corsHeaders }
          );
        }

        const model = clean(env.OPENAI_TRANSCRIBE_MODEL) || "gpt-4o-mini-transcribe";

        const formOut = new FormData();
        formOut.append("file", file, file.name || "voice.m4a");
        formOut.append("model", model);
        // json is best for client parsing
        formOut.append("response_format", "json");

        const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: formOut,
        });

        const data: any = await openaiRes.json().catch(() => null);

        if (!openaiRes.ok) {
          return jsonResponse(
            { error: "OpenAI transcription failed", status: openaiRes.status, details: data ?? null },
            { status: 500, headers: corsHeaders }
          );
        }

        const text = clean(data?.text);
        if (!text) {
          return jsonResponse(
            { error: "No text returned from transcription", details: data ?? null },
            { status: 500, headers: corsHeaders }
          );
        }

        return jsonResponse({ text }, { status: 200, headers: corsHeaders });
      } catch (e: any) {
        return jsonResponse(
          { error: clean(e?.message) || "Transcribe error" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // ✅ /image (OpenAI Images API)
    if (path === "/image") {
      const body = (await request.json().catch(() => null)) as
        | { prompt?: unknown; size?: unknown; n?: unknown }
        | null;

      const prompt = body?.prompt;
      if (typeof prompt !== "string" || !prompt.trim()) {
        return jsonResponse(
          { error: "Missing or invalid 'prompt' (string required)" },
          { status: 400, headers: corsHeaders }
        );
      }

      const size =
        typeof body?.size === "string" && body.size.trim() ? body.size.trim() : "1024x1024";
      const n = typeof body?.n === "number" && body.n > 0 ? Math.min(body.n, 4) : 1;

      const imageModel = env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

      try {
        const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: imageModel,
            prompt: clean(prompt),
            size,
            n,
          }),
        });

        const data: any = await openaiRes.json().catch(() => null);

        if (!openaiRes.ok) {
          return jsonResponse(
            { error: "OpenAI image generation failed", status: openaiRes.status, details: data ?? null },
            { status: 500, headers: corsHeaders }
          );
        }

        const urlOut = getImageUrlFromImagesApi(data);
        if (!urlOut) {
          return jsonResponse(
            { error: "No image URL returned", details: data ?? null },
            { status: 500, headers: corsHeaders }
          );
        }

        return jsonResponse({ url: urlOut }, { status: 200, headers: corsHeaders });
      } catch (e: any) {
        return jsonResponse(
          { error: clean(e?.message) || "Image error" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // ✅ /vision (JSON: { message, images: [dataUrl...] })
    if (path === "/vision") {
      try {
        const body = (await request.json().catch(() => null)) as
          | { message?: unknown; images?: unknown; meta?: unknown }
          | null;

        const message = clean(body?.message);
        const imagesRaw = body?.images;

        if (!message) {
          return jsonResponse(
            { error: "Missing or invalid 'message' (string required)" },
            { status: 400, headers: corsHeaders }
          );
        }

        const images = Array.isArray(imagesRaw)
          ? imagesRaw.map((x) => clean(x)).filter(Boolean)
          : [];

        if (images.length === 0) {
          return jsonResponse(
            { error: "Missing 'images' (array of data URLs required)" },
            { status: 400, headers: corsHeaders }
          );
        }

        const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
        const instructions = buildWorkerInstructions();

        // Responses API vision input: input_text + input_image
        const content: any[] = [{ type: "input_text", text: message }];
        for (const img of images.slice(0, 4)) {
          content.push({ type: "input_image", image_url: img });
        }

        const openaiRes = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            instructions,
            input: [{ role: "user", content }],
          }),
        });

        const data: any = await openaiRes.json().catch(() => null);

        if (!openaiRes.ok) {
          return jsonResponse(
            { error: "OpenAI vision request failed", status: openaiRes.status, details: data ?? null },
            { status: 500, headers: corsHeaders }
          );
        }

        const replyRaw = getOutputText(data) ?? "No response";
        const reply = safeTruncate(replyRaw, 120_000);
        return jsonResponse({ reply, meta: null }, { status: 200, headers: corsHeaders });
      } catch (e: any) {
        return jsonResponse(
          { error: clean(e?.message) || "Vision error" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Validate payload for chat/stream
    const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
    const rawMessage = body?.message;

    if (typeof rawMessage !== "string" || !rawMessage.trim()) {
      return jsonResponse(
        { error: "Missing or invalid 'message' (string required)" },
        { status: 400, headers: corsHeaders }
      );
    }

    const model = env.OPENAI_MODEL ?? "gpt-4o-mini";

    const msg = clean(rawMessage);
    const MAX_INPUT = 48_000;
    if (msg.length > MAX_INPUT) {
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

      await sseWrite(writer, "ready", "ZETRA_STREAM_READY");

      const pingTimer = setInterval(() => {
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
              input: msg,
              stream: true,
            }),
          });

          if (!openaiRes.ok || !openaiRes.body) {
            const details: any = await openaiRes.json().catch(() => null);
            await sseWrite(
              writer,
              "error",
              JSON.stringify({ error: "OpenAI request failed", status: openaiRes.status, details })
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
          input: msg,
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
      const reply = safeTruncate(replyRaw, 120_000);
      return jsonResponse({ reply }, { status: 200, headers: corsHeaders });
    } catch (err: any) {
      return jsonResponse(
        { error: err?.message ?? "Unknown error" },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};