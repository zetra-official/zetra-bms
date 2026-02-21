// src/env.ts
// Single source of truth for ENV (katiba)
// NOTE: Do NOT hardcode secrets/keys here. Use .env / EAS Secrets.

function req(name: string): string {
  const v = String((process.env as any)?.[name] ?? "").trim();
  if (!v) {
    throw new Error(`❌ Missing env var: ${name}`);
  }
  return v;
}

export const SUPABASE_URL = req("EXPO_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = req("EXPO_PUBLIC_SUPABASE_ANON_KEY");

// AI Worker base url (Cloudflare Worker), mfano: https://zetra-ai-worker_xxx.workers.dev
export const AI_WORKER_URL = req("EXPO_PUBLIC_AI_WORKER_URL");

// Extra safety checks (production hardening)
if (!SUPABASE_URL.startsWith("https://")) {
  throw new Error("❌ EXPO_PUBLIC_SUPABASE_URL must start with https://");
}
if (!SUPABASE_URL.includes(".supabase.co")) {
  // bado inaweza kuwa custom domain, lakini hii inasaidia kugundua typo mapema
  console.warn("⚠️ SUPABASE_URL does not look like a standard *.supabase.co URL. Double-check if this is intended.");
}
if (
  !(
    SUPABASE_ANON_KEY.startsWith("sb_publishable_") ||
    SUPABASE_ANON_KEY.startsWith("eyJ") // legacy anon JWT format
  )
) {
  console.warn("⚠️ SUPABASE_ANON_KEY format is unexpected. Ensure you copied the Publishable/anon key (NOT secret).");
}