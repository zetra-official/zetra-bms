// src/ai/lang.ts
export type DetectedLang = "SW" | "EN" | "MIX";

function clean(s: any) {
  return String(s ?? "").trim();
}

function hasAny(textUpper: string, listUpper: string[]) {
  for (const w of listUpper) {
    if (textUpper.includes(w)) return true;
  }
  return false;
}

export function detectLanguage(text: string): DetectedLang {
  const s = clean(text);
  if (!s) return "EN";

  const U = s.toUpperCase();

  // very lightweight Swahili signals
  const SW = [
    "NAOMBA",
    "NISAIDIE",
    "NIFANYEJE",
    "NITAKUJE",
    "JE",
    "KWA NINI",
    "TUNAWEZA",
    "TUNAANZA",
    "HATUA",
    "KISWAHILI",
    "KWA SASA",
    "KWA HII",
    "KWA HAPO",
    "MAUZO",
    "BIDHAA",
    "DUKA",
    "STOO",
    "NIONGOZE",
    "NIELEKEZE",
    "TAFADHALI",
    "HAPO",
    "HIVI",
    "KWAO",
  ].map((x) => x.toUpperCase());

  const EN = [
    "HOW",
    "WHAT",
    "WHY",
    "WHERE",
    "SETUP",
    "CREATE",
    "OPEN",
    "ADD",
    "REMOVE",
    "ERROR",
    "FIX",
    "PLEASE",
    "LANGUAGE",
    "ENGLISH",
    "SWAHILI",
    "GUIDE",
    "HELP",
    "ACCOUNT",
    "STORE",
    "PRODUCT",
    "SALES",
    "RECEIPT",
  ].map((x) => x.toUpperCase());

  const swHit = hasAny(U, SW);
  const enHit = hasAny(U, EN);

  // also: if user uses many swahili-only characters/structure, treat as sw
  const swPattern =
    /\b(na|kwa|je|hapo|hivi|sasa|tafadhali|nisaidie|naomba|ninataka|tunaweza|kuhusu|kwa nini)\b/i.test(
      s
    );

  const enPattern = /\b(how|what|why|where|please|setup|create|fix|error)\b/i.test(s);

  const swScore = (swHit ? 1 : 0) + (swPattern ? 1 : 0);
  const enScore = (enHit ? 1 : 0) + (enPattern ? 1 : 0);

  if (swScore > 0 && enScore > 0) return "MIX";
  if (swScore > 0) return "SW";
  return "EN";
}

export type AiMode = "AUTO" | "SW" | "EN";

export function resolveMode(userMode: AiMode, text: string): DetectedLang {
  if (userMode === "SW") return "SW";
  if (userMode === "EN") return "EN";
  return detectLanguage(text);
}