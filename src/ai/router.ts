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

export type AiRoute = "BUSINESS" | "PLAYBOOK";

function isOwnerOrAdmin(role?: string | null) {
  const r = String(role ?? "").toLowerCase();
  return r === "owner" || r === "admin";
}

export function routeReply(text: string): { route: AiRoute; intent: Intent } {
  const t = clean(text);
  if (!t) return { route: "PLAYBOOK", intent: "UNKNOWN" };

  // ✅ Force BUSINESS if it looks like calculations/finance/business metrics
  if (isBusinessLike(t)) {
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
    // businessReply already returns structured advice;
    // we keep it stable and pass only (lang,text) as your current API expects.
    return businessReply(lang, text);
  }

  const sw = swResponse(intent, ctx, text, { proDepth });
  const en = enResponse(intent, ctx, text, { proDepth });

  if (lang === "SW") return sw;
  if (lang === "EN") return en;

  return `🇹🇿 Kiswahili:\n${sw}\n\n🇬🇧 English:\n${en}`;
}