// src/ai/business.ts
// Zero-cost business advisor: calculators + structured guidance (no external APIs)
// INTEL-CORE-2: Insight Layer (always-on for PRO AI)

import type { DetectedLang } from "./lang";

function clean(s: any) {
  return String(s ?? "").trim();
}

function U(s: any) {
  return clean(s).toUpperCase();
}

function hasAny(textUpper: string, keys: string[]) {
  for (const k of keys) {
    if (textUpper.includes(k)) return true;
  }
  return false;
}

function parseNumberToken(token: string): number | null {
  // supports: 800000, 800,000, 800 000, 800k, 2.4m
  const t = clean(token).toLowerCase();
  if (!t) return null;

  let mul = 1;
  if (t.endsWith("k")) mul = 1_000;
  if (t.endsWith("m")) mul = 1_000_000;

  const raw = t.replace(/[km]$/i, "");
  const normalized = raw.replace(/[, _]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;

  return n * mul;
}

function extractNamedNumber(text: string, names: string[]): number | null {
  // Matches patterns like:
  // "sales 800000", "sales: 800000", "sales=800000", "sales Tsh 800000"
  const s = clean(text);

  for (const name of names) {
    const re = new RegExp(
      String.raw`(?:^|\s)${name}\s*(?:[:=]?\s*)?(?:tzs|tsh|usd|eur)?\s*([-+]?\d[\d, _]*(?:\.\d+)?\s*[km]?)`,
      "i"
    );
    const m = s.match(re);
    if (m?.[1]) {
      const n = parseNumberToken(m[1]);
      if (n !== null) return n;
    }
  }

  return null;
}

function extractNumericTokens(text: string): number[] {
  // collect first 2–6 numeric tokens
  const tokens = clean(text).match(/[-+]?\d[\d, _]*(?:\.\d+)?\s*[km]?/gi) ?? [];
  const out: number[] = [];
  for (const t of tokens) {
    const n = parseNumberToken(t);
    if (n === null) continue;
    out.push(n);
    if (out.length >= 6) break;
  }
  return out;
}

function fmtMoney(n: number) {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtPctFromRatio(r: number) {
  if (!Number.isFinite(r)) return "0%";
  return `${(r * 100).toFixed(1)}%`;
}

function fmtPctFromPercent(p: number) {
  if (!Number.isFinite(p)) return "0%";
  return `${p.toFixed(1)}%`;
}

function langMixed(sw: string, en: string) {
  return `🇹🇿 Kiswahili:\n${sw}\n\n🇬🇧 English:\n${en}`;
}

/**
 * ✅ BUSINESS-LIKE detector (FIX)
 * - Must return true for: "800000 cost 520000" (even without "sales")
 * - Must return true for ROI, margin, markup, breakeven patterns
 * - Safe: does NOT hijack normal app-usage questions
 */
export function isBusinessLike(text: string): boolean {
  const t = clean(text);
  if (!t) return false;

  const T = U(t);

  const hasBizWords = hasAny(T, [
    // generic business
    "BUSINESS",
    "BIASHARA",
    "MKAKATI",
    "STRATEGY",
    "MARKETING",
    "PRICE",
    "BEI",
    "STOCK",
    "MAUZO",
    "SALES",
    "REVENUE",
    "MAPATO",
    // profit/loss
    "PROFIT",
    "FAIDA",
    "HASARA",
    "LOSS",
    "GAIN",
    // calculations
    "MARGIN",
    "MARKUP",
    "BREAKEVEN",
    "BREAK EVEN",
    "ROI",
    "RETURN ON INVESTMENT",
    "UREJESHO",
    "MTAJI",
    "UWEKEZAJI",
    // cost words
    "COST",
    "COGS",
    "GHARAMA",
    "BUYING",
    "PURCHASE",
  ]);

  // ✅ Numeric pattern detection
  const nums = extractNumericTokens(t);
  const hasAtLeast2Nums = nums.length >= 2;

  // ✅ Keyword hint: cost/gharama/cogs present
  const hasCostWord = hasAny(T, ["COST", "COGS", "GHARAMA", "BUYING", "PURCHASE"]);

  // ✅ If it has cost word + 2 numbers => business calc even without "sales"
  if (hasCostWord && hasAtLeast2Nums) return true;

  // If it explicitly has business words + at least 1 number => likely business calc
  if (hasBizWords && nums.length >= 1) return true;

  // If it has the classic pair: sales + cost
  const hasSalesWord = hasAny(T, ["SALES", "MAUZO", "REVENUE", "MAPATO"]);
  if (hasSalesWord && hasCostWord) return true;

  return false;
}

export type BizCalcIntent =
  | "ROI"
  | "PROFIT_LOSS"
  | "MARGIN"
  | "MARKUP"
  | "BREAKEVEN"
  | "GENERAL"
  | "NONE";

/**
 * ✅ Detect what calculation user is trying to do.
 * Priority order avoids wrong matches.
 */
function detectCalcIntent(text: string): BizCalcIntent {
  const T = U(text);
  if (!T) return "NONE";

  const nums = extractNumericTokens(text);

  const hasInvestment = hasAny(T, [
    "INVESTMENT",
    "CAPITAL",
    "MTAJI",
    "UWEKEZAJI",
    "STARTUP CAPITAL",
    "INITIAL CAPITAL",
  ]);

  const hasSales = hasAny(T, ["SALES", "REVENUE", "MAUZO", "MAPATO", "TURNOVER"]);
  const hasCost = hasAny(T, ["COST", "COGS", "GHARAMA", "BUYING", "PURCHASE", "STOCK COST"]);
  const hasProfitWord = hasAny(T, ["PROFIT", "FAIDA", "GAIN"]);
  const hasLossWord = hasAny(T, ["LOSS", "HASARA"]);

  const hasMargin = hasAny(T, ["MARGIN", "GROSS MARGIN", "NET MARGIN", "ASILIMIA YA FAIDA", "FAIDA KWA ASILIMIA"]);
  const hasMarkup = hasAny(T, ["MARKUP", "ONGEZA BEI", "PRICE FROM COST", "SELLING PRICE"]);
  const hasBreakeven = hasAny(T, ["BREAK EVEN", "BREAKEVEN", "POINT YA BREAK", "KUFIKIA HASARA SIFURI", "FIXED COST"]);

  // ✅ ROI FIRST
  if ((hasInvestment && hasProfitWord) || hasAny(T, ["ROI", "RETURN ON INVESTMENT", "UREJESHO"])) return "ROI";

  // ✅ BREAKEVEN
  if (hasBreakeven) return "BREAKEVEN";

  // ✅ MARKUP
  if (hasMarkup) return "MARKUP";

  // ✅ MARGIN
  if (hasMargin) return "MARGIN";

  // ✅ PROFIT/LOSS (fix: cost + 2 numbers qualifies even if no "sales")
  if ((hasSales && hasCost) || (hasCost && nums.length >= 2) || hasProfitWord || hasLossWord) return "PROFIT_LOSS";

  // General business advice
  if (hasAny(T, ["BUSINESS", "BIASHARA", "MKAKATI", "STRATEGY", "MARKETING", "WAZO"])) return "GENERAL";

  return "NONE";
}

function computeProfitLoss(text: string) {
  const sales = extractNamedNumber(text, ["sales", "revenue", "mauzo", "mapato"]);
  const cost = extractNamedNumber(text, ["cost", "cogs", "gharama", "buying", "purchase"]);
  const other = extractNamedNumber(text, ["other", "expenses", "expense", "overhead", "gharama nyingine"]);

  // fallback: first two numbers => assume sales, cost
  const nums = extractNumericTokens(text);
  const S = sales ?? (nums.length >= 1 ? nums[0] : null);
  const C = cost ?? (nums.length >= 2 ? nums[1] : null);
  const O = other ?? 0;

  if (S === null || C === null) return null;

  const profit = S - C - O;
  const margin = S !== 0 ? profit / S : 0;

  return { sales: S, cost: C, other: O, profit, margin };
}

function computeMargin(text: string) {
  const sales = extractNamedNumber(text, ["sales", "revenue", "mauzo", "mapato"]);
  const cost = extractNamedNumber(text, ["cost", "cogs", "gharama", "buying", "purchase"]);
  const nums = extractNumericTokens(text);

  const S = sales ?? (nums.length >= 1 ? nums[0] : null);
  const C = cost ?? (nums.length >= 2 ? nums[1] : null);

  if (S === null || C === null || S <= 0) return null;

  const profit = S - C;
  const marginPct = (profit / S) * 100;

  return { sales: S, cost: C, profit, marginPct };
}

function computeMarkup(text: string) {
  const cost = extractNamedNumber(text, ["cost", "cogs", "gharama", "buying", "purchase"]);
  const markup = extractNamedNumber(text, ["markup", "markup%"]);
  const nums = extractNumericTokens(text);

  const C = cost ?? (nums.length >= 1 ? nums[0] : null);
  const M = markup ?? (nums.length >= 2 ? nums[1] : null);

  if (C === null || M === null) return null;

  const selling = C * (1 + M / 100);
  return { cost: C, markupPct: M, selling };
}

function computeBreakeven(text: string) {
  const fixed = extractNamedNumber(text, ["fixed", "fixedcost", "fixedcosts", "rent", "mishahara"]);
  const margin = extractNamedNumber(text, ["margin", "margin%", "grossmargin", "asilimia"]);
  const nums = extractNumericTokens(text);

  const F = fixed ?? (nums.length >= 1 ? nums[0] : null);
  const M = margin ?? (nums.length >= 2 ? nums[1] : null);

  if (F === null || M === null || M <= 0) return null;

  const breakevenSales = F / (M / 100);
  return { fixed: F, marginPct: M, breakevenSales };
}

function computeRoi(text: string) {
  const investment = extractNamedNumber(text, ["investment", "capital", "mtaji", "uwekezaji", "start"]);
  const profit = extractNamedNumber(text, ["profit", "faida", "gain"]);
  const nums = extractNumericTokens(text);

  const I = investment ?? (nums.length >= 1 ? nums[0] : null);
  const P = profit ?? (nums.length >= 2 ? nums[1] : null);

  if (I === null || P === null || I <= 0) return null;

  const roi = P / I;
  return { investment: I, profit: P, roi };
}

/* =========================
   INTEL-CORE-2: Insights
   ========================= */

const TH = {
  // margins
  marginDangerPct: 10,
  marginLowPct: 15,
  marginGoodPct: 25,
  // markup
  markupLowPct: 15,
  // ROI (ratio)
  roiLow: 0.2, // 20%
  roiGood: 0.5, // 50%
};

function insightsProfitLoss(lang: DetectedLang, r: { sales: number; cost: number; other: number; profit: number; margin: number }) {
  const marginPct = r.sales > 0 ? (r.profit / r.sales) * 100 : 0;

  const sw: string[] = [];
  const en: string[] = [];

  // headline severity
  if (r.profit < 0) {
    sw.push("⚠️ Hali: HASARA (unauza chini ya gharama + overhead).");
    en.push("⚠️ Status: LOSS (selling below cost + overhead).");
  } else if (marginPct < TH.marginLowPct) {
    sw.push("⚠️ Hali: Faida ipo lakini margin ni ndogo (warning zone).");
    en.push("⚠️ Status: Profit exists but margin is low (warning zone).");
  } else if (marginPct >= TH.marginGoodPct) {
    sw.push("✅ Hali: Margin nzuri (healthy).");
    en.push("✅ Status: Strong margin (healthy).");
  } else {
    sw.push("✅ Hali: Margin ya kati (okay).");
    en.push("✅ Status: Mid margin (okay).");
  }

  // diagnosis hints
  sw.push(
    "Uchunguzi wa haraka:",
    "• Kama margin ni ndogo: supplier cost juu, bei chini, au leakages (discount/stock loss).",
    "• Kama hasara: angalia fixed costs (rent/mishahara), COGS, na bidhaa zenye margin ndogo. Tathmini ni ya biashara kwa jumla, sio bidhaa moja pekee."
  );
  en.push(
    "Quick diagnosis:",
    "• Low margin: high supplier cost, low pricing, or leakage (discounts/stock loss).",
    "• Loss: check fixed costs (rent/salaries) and margin-killer items."
  );

  // action plan (short, structured)
  sw.push(
    "Mpango wa siku 7 (actionable):",
    "1) Pitia bidhaa top 20 zinazouza sana: rekebisha bei/discount policy.",
    "2) Tafuta supplier alternative au negotiate (target: -3% hadi -8% COGS).",
    "3) Weka rule: bidhaa zenye margin < 10% ziwe na uangalizi maalum."
  );
  en.push(
    "7-day action plan:",
    "1) Review top 20 selling items: fix pricing/discount policy.",
    "2) Find alternative suppliers or negotiate (target: -3% to -8% COGS).",
    "3) Add a rule: items with margin < 10% require special control."
  );

  const outSW = "🧠 ZETRA AI Insights\n" + sw.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");
  const outEN = "🧠 ZETRA AI Insights\n" + en.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");

  if (lang === "SW") return outSW;
  if (lang === "EN") return outEN;
  return langMixed(outSW, outEN);
}

function insightsMargin(lang: DetectedLang, r: { sales: number; cost: number; profit: number; marginPct: number }) {
  const sw: string[] = [];
  const en: string[] = [];

  if (r.marginPct < TH.marginDangerPct) {
    sw.push("🚨 Margin iko hatari (<10%). Hii biashara inaweza kuchoka haraka kwenye cashflow.");
    en.push("🚨 Margin is dangerous (<10%). Cashflow will suffer quickly.");
  } else if (r.marginPct < TH.marginLowPct) {
    sw.push("⚠️ Margin ni ndogo (<15%). Unahitaji kurekebisha pricing au COGS.");
    en.push("⚠️ Margin is low (<15%). Adjust pricing or COGS.");
  } else if (r.marginPct >= TH.marginGoodPct) {
    sw.push("✅ Margin ni nzuri (≥25%). Hii ni zone ya ukuaji (growth).");
    en.push("✅ Margin is strong (≥25%). Good growth zone.");
  } else {
    sw.push("✅ Margin ya kati. Boresha kidogo ili ifike 20%+ kama inawezekana.");
    en.push("✅ Mid margin. Improve towards 20%+ if possible.");
  }

  sw.push(
    "Mapendekezo (fast):",
    "• Jaribu kuongeza bei +3% hadi +7% kwenye top sellers (A/B test ndani ya wiki 1).",
    "• Punguza leakages: discounts zisizo na record, stock loss, na returns.",
    "• Kama COGS iko juu, negotiate/ongeza volume kwa supplier."
  );
  en.push(
    "Recommendations (fast):",
    "• Test a +3% to +7% price lift on top sellers (A/B within 1 week).",
    "• Reduce leakage: untracked discounts, stock loss, and returns.",
    "• If COGS is high, negotiate or increase volume with suppliers."
  );

  const outSW = "🧠 ZETRA AI Insights\n" + sw.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");
  const outEN = "🧠 ZETRA AI Insights\n" + en.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");

  if (lang === "SW") return outSW;
  if (lang === "EN") return outEN;
  return langMixed(outSW, outEN);
}

function insightsMarkup(lang: DetectedLang, r: { cost: number; markupPct: number; selling: number }) {
  const sw: string[] = [];
  const en: string[] = [];

  if (r.markupPct < TH.markupLowPct) {
    sw.push("⚠️ Markup ni ndogo. Ukiongeza overhead (rent/mishahara) unaweza kukosa faida halisi.");
    en.push("⚠️ Markup is low. After overhead you may lose real profit.");
  } else if (r.markupPct >= 30) {
    sw.push("✅ Markup nzuri. Hakikisha tu price haishushi demand (angalia competitors).");
    en.push("✅ Strong markup. Make sure price doesn’t kill demand (check competitors).");
  } else {
    sw.push("✅ Markup ya kati. Inaweza kuwa sawa kulingana na category.");
    en.push("✅ Mid markup. Can be fine depending on category.");
  }

  sw.push(
    "Ushauri wa pricing:",
    "• Tumia psychological pricing (mf: 9,900 badala ya 10,000) inapofaa.",
    "• Kama una tiers: weka Retail/Wholesale tofauti kwa quantity.",
    "• Rekodi discounts zote — discount is margin."
  );
  en.push(
    "Pricing tips:",
    "• Use psychological pricing (e.g., 9,900 instead of 10,000) when relevant.",
    "• If you have tiers: set Retail/Wholesale pricing by quantity.",
    "• Track discounts — discounts are margin."
  );

  const outSW = "🧠 ZETRA AI Insights\n" + sw.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");
  const outEN = "🧠 ZETRA AI Insights\n" + en.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");

  if (lang === "SW") return outSW;
  if (lang === "EN") return outEN;
  return langMixed(outSW, outEN);
}

function insightsBreakeven(lang: DetectedLang, r: { fixed: number; marginPct: number; breakevenSales: number }) {
  const sw: string[] = [];
  const en: string[] = [];

  sw.push(
    "Maana ya break-even:",
    "• Hii ndiyo sales ya mwezi inayofanya hasara kuwa sifuri.",
    "• Ukizidi hapo — unaanza faida."
  );
  en.push(
    "Break-even meaning:",
    "• This is the monthly sales required to reach zero loss.",
    "• Above it — you start making profit."
  );

  if (r.marginPct < TH.marginLowPct) {
    sw.push("⚠️ Margin yako ni ndogo, break-even inakuwa juu. Lenga kuongeza margin kwanza.");
    en.push("⚠️ Low margin makes break-even too high. Focus on margin improvement first.");
  } else {
    sw.push("✅ Kama margin ni nzuri, weka target ya sales 10% juu ya break-even ili uwe salama.");
    en.push("✅ With good margin, set a sales target 10% above break-even for safety.");
  }

  sw.push(
    "Mpango wa kupunguza break-even:",
    "1) Punguza fixed costs (rent, mishahara, waste).",
    "2) Ongeza margin kwa top sellers.",
    "3) Ongeza conversion (upsell + bundles)."
  );
  en.push(
    "How to reduce break-even:",
    "1) Cut fixed costs (rent, salaries, waste).",
    "2) Improve margin on top sellers.",
    "3) Increase conversion (upsell + bundles)."
  );

  const outSW = "🧠 ZETRA AI Insights\n" + sw.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");
  const outEN = "🧠 ZETRA AI Insights\n" + en.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");

  if (lang === "SW") return outSW;
  if (lang === "EN") return outEN;
  return langMixed(outSW, outEN);
}

function insightsRoi(lang: DetectedLang, r: { investment: number; profit: number; roi: number }) {
  const sw: string[] = [];
  const en: string[] = [];

  if (r.roi < TH.roiLow) {
    sw.push("⚠️ ROI ni ndogo (<20%). Hii inaonyesha mtaji unarudi taratibu.");
    en.push("⚠️ ROI is low (<20%). Capital returns slowly.");
  } else if (r.roi >= TH.roiGood) {
    sw.push("✅ ROI ni nzuri (≥50%). Hii ni sign ya model yenye nguvu.");
    en.push("✅ ROI is strong (≥50%). This indicates a strong business model.");
  } else {
    sw.push("✅ ROI ya kati. Boresha margin au punguza fixed costs ili ipande.");
    en.push("✅ Mid ROI. Improve margin or reduce fixed costs to increase it.");
  }

  sw.push(
    "Njia 3 za kuongeza ROI:",
    "1) Ongeza profit bila kuongeza mtaji (upsell + bundles).",
    "2) Punguza mtaji unaozunguka (dead stock) — geuza kuwa fast movers.",
    "3) Punguza leakage: returns, discounts, theft, wrong pricing."
  );
  en.push(
    "3 ways to increase ROI:",
    "1) Increase profit without increasing capital (upsell + bundles).",
    "2) Reduce locked capital (dead stock) — convert to fast movers.",
    "3) Reduce leakage: returns, discounts, theft, wrong pricing."
  );

  const outSW = "🧠 ZETRA AI Insights\n" + sw.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");
  const outEN = "🧠 ZETRA AI Insights\n" + en.map((x) => `• ${x}`).join("\n").replace(/• •/g, "• ");

  if (lang === "SW") return outSW;
  if (lang === "EN") return outEN;
  return langMixed(outSW, outEN);
}

/* =========================
   Base advice/menu
   ========================= */

function swGeneralAdvice() {
  return (
    "Haya ni maelekezo ya msingi (universal) ya biashara:\n" +
    "1) Cashflow kwanza: fuatilia pesa inavyoingia/kutoka (daily/weekly).\n" +
    "2) Top sellers: bidhaa 20% zinazoleta 80% ya mauzo ziwe na stock ya kutosha.\n" +
    "3) Margin discipline: epuka bidhaa zinazoonekana zinauza sana lakini zinakula faida.\n" +
    "4) Reorder level: weka minimum stock kwa bidhaa muhimu.\n" +
    "5) Pricing rule: bei = gharama + faida (usiweke kwa kubahatisha).\n\n" +
    "Ukitaka plan kali: niambie aina ya biashara + mtaji + gharama za mwezi + mauzo ya siku."
  );
}

function enGeneralAdvice() {
  return (
    "Core business fundamentals (works for most businesses):\n" +
    "1) Cashflow first: track money in/out daily/weekly.\n" +
    "2) Top sellers: keep your 20% best-selling items always available.\n" +
    "3) Margin discipline: avoid fast-moving items that destroy profit.\n" +
    "4) Reorder levels: set minimum stock for key products.\n" +
    "5) Pricing rule: price = cost + profit (not guessing).\n\n" +
    "If you want a strong plan: share business type + capital + monthly costs + daily sales."
  );
}

function menuSW() {
  return (
    "Naweza kukusaidia haraka kwa:\n" +
    "1) Profit/Loss: `sales 800000 cost 520000` (au hata `800000 cost 520000`)\n" +
    "2) Margin %: `margin sales 800000 cost 520000`\n" +
    "3) Markup (bei ya kuuza): `cost 10000 markup 30`\n" +
    "4) Break-even: `fixed 1200000 margin 25`\n" +
    "5) ROI: `investment 3000000 profit 600000`\n"
  );
}

function menuEN() {
  return (
    "I can help quickly with:\n" +
    "1) Profit/Loss: `sales 800000 cost 520000` (or `800000 cost 520000`)\n" +
    "2) Margin %: `margin sales 800000 cost 520000`\n" +
    "3) Markup: `cost 10000 markup 30`\n" +
    "4) Break-even: `fixed 1200000 margin 25`\n" +
    "5) ROI: `investment 3000000 profit 600000`\n"
  );
}

/**
 * ✅ MAIN ENTRY (router.ts calls this)
 * INTEL-CORE-2: always append insight layer for calc intents (PRO AI).
 */
export function businessReply(lang: DetectedLang, text: string): string {
  const intent = detectCalcIntent(text);

  // ROI
  if (intent === "ROI") {
    const r = computeRoi(text);
    if (!r) {
      const sw = "Tuma mfano: `investment 3000000 profit 600000`";
      const en = "Send: `investment 3000000 profit 600000`";
      if (lang === "SW") return sw;
      if (lang === "EN") return en;
      return langMixed(sw, en);
    }

    const roiPct = fmtPctFromRatio(r.roi);

    const sw =
      "✅ Matokeo (ROI)\n" +
      `• Mtaji (Investment): ${fmtMoney(r.investment)}\n` +
      `• Faida (Profit): ${fmtMoney(r.profit)}\n` +
      `• ROI: ${roiPct}\n\n` +
      "Mwongozo wa haraka:\n" +
      "• ROI kubwa = mtaji unarudi kwa kasi.\n" +
      "• ROI ndogo = punguza gharama, ongeza margin, au ongeza mauzo bila kuongeza fixed costs.";

    const en =
      "✅ Result (ROI)\n" +
      `• Investment: ${fmtMoney(r.investment)}\n` +
      `• Profit: ${fmtMoney(r.profit)}\n` +
      `• ROI: ${roiPct}\n\n` +
      "Quick guidance:\n" +
      "• Higher ROI = your capital returns faster.\n" +
      "• Low ROI = reduce costs, improve margin, or grow sales without increasing fixed costs.";

    const insights = insightsRoi(lang, r);

    if (lang === "SW") return `${sw}\n\n${insights}`;
    if (lang === "EN") return `${en}\n\n${insights}`;
    return langMixed(`${sw}\n\n${insights}`, `${en}\n\n${insights}`);
  }

  // BREAKEVEN
  if (intent === "BREAKEVEN") {
    const r = computeBreakeven(text);
    if (!r) {
      const sw = "Tuma mfano: `fixed 1200000 margin 25`";
      const en = "Send: `fixed 1200000 margin 25`";
      if (lang === "SW") return sw;
      if (lang === "EN") return en;
      return langMixed(sw, en);
    }

    const sw =
      "✅ Break-even\n" +
      `• Fixed costs / mwezi: ${fmtMoney(r.fixed)}\n` +
      `• Gross margin: ${fmtPctFromPercent(r.marginPct)}\n` +
      `• Break-even sales / mwezi: ${fmtMoney(r.breakevenSales)}\n\n` +
      "Maana:\n" +
      "• Ukivuka hiyo sales kwa mwezi unaanza kupata faida.\n" +
      "• Shusha break-even kwa kupunguza fixed costs au kuongeza margin.";

    const en =
      "✅ Break-even\n" +
      `• Monthly fixed costs: ${fmtMoney(r.fixed)}\n` +
      `• Gross margin: ${fmtPctFromPercent(r.marginPct)}\n` +
      `• Break-even sales / month: ${fmtMoney(r.breakevenSales)}\n\n` +
      "Meaning:\n" +
      "• Above that monthly sales, you start making profit.\n" +
      "• Reduce break-even by lowering fixed costs or increasing margin.";

    const insights = insightsBreakeven(lang, r);

    if (lang === "SW") return `${sw}\n\n${insights}`;
    if (lang === "EN") return `${en}\n\n${insights}`;
    return langMixed(`${sw}\n\n${insights}`, `${en}\n\n${insights}`);
  }

  // MARKUP
  if (intent === "MARKUP") {
    const r = computeMarkup(text);
    if (!r) {
      const sw = "Tuma mfano: `cost 10000 markup 30`";
      const en = "Send: `cost 10000 markup 30`";
      if (lang === "SW") return sw;
      if (lang === "EN") return en;
      return langMixed(sw, en);
    }

    const sw =
      "✅ Markup\n" +
      `• Cost: ${fmtMoney(r.cost)}\n` +
      `• Markup: ${fmtPctFromPercent(r.markupPct)}\n` +
      `• Bei ya kuuza (suggested): ${fmtMoney(r.selling)}\n\n` +
      "Tip: Ukiwa na retail/wholesale tiers, tunaweza kuweka bei 2–3 kulingana na quantity.";

    const en =
      "✅ Markup\n" +
      `• Cost: ${fmtMoney(r.cost)}\n` +
      `• Markup: ${fmtPctFromPercent(r.markupPct)}\n` +
      `• Suggested selling price: ${fmtMoney(r.selling)}\n\n` +
      "Tip: With retail/wholesale tiers, you can set 2–3 prices by quantity.";

    const insights = insightsMarkup(lang, r);

    if (lang === "SW") return `${sw}\n\n${insights}`;
    if (lang === "EN") return `${en}\n\n${insights}`;
    return langMixed(`${sw}\n\n${insights}`, `${en}\n\n${insights}`);
  }

  // MARGIN
  if (intent === "MARGIN") {
    const r = computeMargin(text);
    if (!r) {
      const sw = "Tuma mfano: `sales 800000 cost 520000`";
      const en = "Send: `sales 800000 cost 520000`";
      if (lang === "SW") return sw;
      if (lang === "EN") return en;
      return langMixed(sw, en);
    }

    const sw =
      "✅ Margin\n" +
      `• Mauzo: ${fmtMoney(r.sales)}\n` +
      `• Gharama: ${fmtMoney(r.cost)}\n` +
      `• Faida: ${fmtMoney(r.profit)}\n` +
      `• Margin: ${fmtPctFromPercent(r.marginPct)}\n\n` +
      "Rule of thumb:\n" +
      "• Retail nyingi: 15%–35% (inategemea bidhaa).\n" +
      "• Kama margin < 10%: angalia supplier cost + discount/leakage.";

    const en =
      "✅ Margin\n" +
      `• Sales: ${fmtMoney(r.sales)}\n` +
      `• Cost: ${fmtMoney(r.cost)}\n` +
      `• Profit: ${fmtMoney(r.profit)}\n` +
      `• Margin: ${fmtPctFromPercent(r.marginPct)}\n\n` +
      "Rule of thumb:\n" +
      "• Many retail categories: 15%–35%.\n" +
      "• If margin < 10%: check supplier cost + discounts/leakage.";

    const insights = insightsMargin(lang, r);

    if (lang === "SW") return `${sw}\n\n${insights}`;
    if (lang === "EN") return `${en}\n\n${insights}`;
    return langMixed(`${sw}\n\n${insights}`, `${en}\n\n${insights}`);
  }

  // PROFIT/LOSS
  if (intent === "PROFIT_LOSS") {
    const r = computeProfitLoss(text);
    if (!r) {
      const sw = "Tuma mfano: `sales 800000 cost 520000 other 30000` (au `800000 cost 520000`)";
      const en = "Send: `sales 800000 cost 520000 other 30000` (or `800000 cost 520000`)";
      if (lang === "SW") return sw;
      if (lang === "EN") return en;
      return langMixed(sw, en);
    }

    const sign = r.profit >= 0 ? "+" : "−";
    const absProfit = Math.abs(r.profit);
    const marginPct = fmtPctFromRatio(r.margin);

    const sw =
      "✅ Matokeo (Profit/Loss)\n" +
      `• Mauzo (Sales): ${fmtMoney(r.sales)}\n` +
      `• Gharama (COGS): ${fmtMoney(r.cost)}\n` +
      `• Gharama nyingine: ${fmtMoney(r.other)}\n` +
      `• Faida/Hasara: ${sign}${fmtMoney(absProfit)}\n` +
      `• Margin: ${marginPct}\n\n` +
      "Mwongozo wa haraka:\n" +
      "• Margin ndogo: punguza COGS au ongeza bei/upsell.\n" +
      "• Hasara: tafuta bidhaa zinazo-kula margin + dhibiti fixed costs.";

    const en =
      "✅ Result (Profit/Loss)\n" +
      `• Sales: ${fmtMoney(r.sales)}\n` +
      `• Cost (COGS): ${fmtMoney(r.cost)}\n` +
      `• Other costs: ${fmtMoney(r.other)}\n` +
      `• Profit/Loss: ${sign}${fmtMoney(absProfit)}\n` +
      `• Margin: ${marginPct}\n\n` +
      "Quick guidance:\n" +
      "• Low margin: reduce COGS or improve pricing/upsell.\n" +
      "• Loss: identify margin-killers + control fixed costs.";

    const insights = insightsProfitLoss(lang, r);

    if (lang === "SW") return `${sw}\n\n${insights}`;
    if (lang === "EN") return `${en}\n\n${insights}`;
    return langMixed(`${sw}\n\n${insights}`, `${en}\n\n${insights}`);
  }

  // GENERAL
  if (intent === "GENERAL") {
    const sw = swGeneralAdvice();
    const en = enGeneralAdvice();

    // Light always-on “coach” footer (still safe)
    const swI =
      "🧠 ZETRA AI Insights\n" +
      "• Ukiwa tayari, nitengenezee ‘snapshot’ ya biashara yako: mtaji, gharama za mwezi, na mauzo ya siku.\n" +
      "• Kisha nitakupa plan ya wiki 2–4 (pricing + stock + marketing) inayoendana na biashara yako.";
    const enI =
      "🧠 ZETRA AI Insights\n" +
      "• When ready, give me a business snapshot: capital, monthly costs, daily sales.\n" +
      "• Then I’ll generate a 2–4 week plan (pricing + stock + marketing) tailored to you.";

    if (lang === "SW") return `${sw}\n\n${swI}`;
    if (lang === "EN") return `${en}\n\n${enI}`;
    return langMixed(`${sw}\n\n${swI}`, `${en}\n\n${enI}`);
  }

  // NONE
  const sw = menuSW();
  const en = menuEN();

  const swI =
    "🧠 ZETRA AI Insights\n" +
    "• Tuma numbers mbili angalau (mf: `800000 cost 520000`) nitakupa analysis + action plan.\n" +
    "• Ukisema ‘biashara ya aina gani’ nitakupa mkakati wa wiki 2–4.";
  const enI =
    "🧠 ZETRA AI Insights\n" +
    "• Send at least two numbers (e.g. `800000 cost 520000`) and I’ll analyze + give an action plan.\n" +
    "• If you tell me your business type, I’ll produce a 2–4 week strategy.";

  if (lang === "SW") return `${sw}\n\n${swI}`;
  if (lang === "EN") return `${en}\n\n${enI}`;
  return langMixed(`${sw}\n\n${swI}`, `${en}\n\n${enI}`);
}