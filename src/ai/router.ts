// src/ai/router.ts
import { businessReply, isBusinessLike } from "./business";
import type { DetectedLang } from "./lang";
import {
  detectIntent,
  enResponse,
  swResponse,
  type Intent,
  type PlayContext,
} from "./playbook";

function clean(s: any) {
  return String(s ?? "").trim();
}

function normalizeLooseText(s: any) {
  return clean(s)
    .toLowerCase()
    .replace(/[%]/g, " percent ")
    .replace(/[&]/g, " and ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looseTokens(s: any) {
  return normalizeLooseText(s).split(" ").map(clean).filter(Boolean);
}

function levenshteinDistance(a: string, b: string, maxLimit = 2) {
  const x = clean(a).toLowerCase();
  const y = clean(b).toLowerCase();

  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  if (Math.abs(x.length - y.length) > maxLimit) return maxLimit + 1;

  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));

  for (let i = 0; i <= x.length; i++) dp[i][0] = i;
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;

  for (let i = 1; i <= x.length; i++) {
    let rowMin = Number.MAX_SAFE_INTEGER;

    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );

      rowMin = Math.min(rowMin, dp[i][j]);
    }

    if (rowMin > maxLimit) return maxLimit + 1;
  }

  return dp[x.length][y.length];
}

function looseTokenMatch(inputToken: string, targetToken: string) {
  const a = clean(inputToken).toLowerCase();
  const b = clean(targetToken).toLowerCase();

  if (!a || !b) return false;
  if (a === b) return true;

  if (a.length >= 4 && b.length >= 4) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }

  const maxDist = Math.max(a.length, b.length) >= 7 ? 2 : 1;
  return levenshteinDistance(a, b, maxDist) <= maxDist;
}

function containsLoosePhrase(text: string, phrase: string) {
  const textNorm = normalizeLooseText(text);
  const phraseNorm = normalizeLooseText(phrase);

  if (!textNorm || !phraseNorm) return false;
  if (textNorm.includes(phraseNorm)) return true;

  const textParts = looseTokens(textNorm);
  const phraseParts = looseTokens(phraseNorm);

  if (!textParts.length || !phraseParts.length) return false;
  if (phraseParts.length > textParts.length) return false;

  for (let i = 0; i <= textParts.length - phraseParts.length; i++) {
    let ok = true;

    for (let j = 0; j < phraseParts.length; j++) {
      if (!looseTokenMatch(textParts[i + j], phraseParts[j])) {
        ok = false;
        break;
      }
    }

    if (ok) return true;
  }

  return false;
}

function hasLooseAny(text: string, phrases: string[]) {
  for (const p of phrases) {
    if (containsLoosePhrase(text, p)) return true;
  }
  return false;
}

function looksLikeBusinessSoftIntent(text: string) {
  const t = clean(text);
  if (!t) return false;

  const hasBusinessWords = hasLooseAny(t, [
    "analysis",
    "analysis ya biashara",
    "business analysis",
    "nipe analysis",
    "nipa analysis",
    "nifanyie analysis",
    "uchambuzi",
    "uchambuzi wa biashara",
    "business",
    "biashara",
    "profit",
    "faida",
    "margin",
    "markup",
    "break even",
    "breakeven",
    "roi",
    "return on investment",
    "sales",
    "mauzo",
    "revenue",
    "mapato",
    "cost",
    "gharama",
    "expense",
    "expenses",
    "stock",
    "inventory",
    "pricing",
    "bei",
    "marketing",
    "operations",
  ]);

  if (hasBusinessWords) return true;

  const hasCalcPattern =
    /(?:\d[\d,._ ]*\s*[km]?)/i.test(t) &&
    hasLooseAny(t, [
      "sales",
      "mauzo",
      "cost",
      "gharama",
      "profit",
      "faida",
      "margin",
      "markup",
      "fixed",
      "investment",
      "mtaji",
    ]);

  return hasCalcPattern;
}

export type AiRoute = "BUSINESS" | "PLAYBOOK";

function isOwnerOrAdmin(role?: string | null) {
  const r = String(role ?? "").toLowerCase();
  return r === "owner" || r === "admin";
}

export function routeReply(text: string): { route: AiRoute; intent: Intent } {
  const t = clean(text);
  if (!t) return { route: "PLAYBOOK", intent: "UNKNOWN" };

  // ✅ HARD PRIORITY 1:
  // calc / finance / metric style inputs
  if (isBusinessLike(t)) {
    return { route: "BUSINESS", intent: "GENERAL_BUSINESS" };
  }

  // ✅ HARD PRIORITY 2:
  // typo / spelling miss / loose business phrasing
  if (looksLikeBusinessSoftIntent(t)) {
    return { route: "BUSINESS", intent: "GENERAL_BUSINESS" };
  }

  const intent = detectIntent(t);

  // ✅ Some intents should still route to BUSINESS brain
  if (
    intent === "GENERAL_BUSINESS" ||
    intent === "PRICING" ||
    intent === "MARKETING" ||
    intent === "OPERATIONS" ||
    intent === "FINANCE" ||
    intent === "INVENTORY_STRATEGY"
  ) {
    return { route: "BUSINESS", intent };
  }

  // Otherwise: playbook (how-to ZETRA + feature flows)
  return { route: "PLAYBOOK", intent };
}

export function replyForRoute(args: {
  route: AiRoute;
  lang: DetectedLang;
  intent: Intent;
  ctx: PlayContext;
  text: string;
}): string {
  const { route, lang, intent, ctx, text } = args;

  // ✅ Depth hint (for playbooks): Owner/Admin gets deeper structure
  const proDepth = isOwnerOrAdmin(ctx.activeRole);

  if (route === "BUSINESS") {
    // BUSINESS brain gets priority for:
    // - exact business calculations
    // - typo/misspelled business requests
    // - loose business phrasing like "nipe analysis ya biashara"
    return businessReply(lang, text);
  }

  const sw = swResponse(intent, ctx, text, { proDepth });
  const en = enResponse(intent, ctx, text, { proDepth });

  if (lang === "SW") return sw;
  if (lang === "EN") return en;

  return `🇹🇿 Kiswahili:\n${sw}\n\n🇬🇧 English:\n${en}`;
}