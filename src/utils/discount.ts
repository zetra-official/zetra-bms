export type DiscountType = "fixed" | "percent" | null;
export type DiscountResult = { type: DiscountType; value: number; amount: number };

/**
 * ✅ Robust Discount Parser
 *
 * Supports:
 *  - "10%" / "10.5%" => percent
 *  - "10k" / "10 k" / "10.5k" => fixed * 1,000
 *  - "1m" / "1 m" / "2.5m"   => fixed * 1,000,000
 *  - "5000" / "5,000"       => fixed
 */
export function parseDiscountInput(input: string, total: number): DiscountResult {
  const t = String(input ?? "").toLowerCase().trim();
  if (!t || total <= 0) return { type: null, value: 0, amount: 0 };

  // 1) Percent: "10%" / "10.5%"
  const pctMatch = t.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pctMatch?.[1]) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct) && pct > 0) {
      const clampedPct = Math.min(100, Math.max(0, pct));
      const amt = Math.min(total, Math.round((total * clampedPct) / 100));
      return { type: "percent", value: clampedPct, amount: Math.max(0, amt) };
    }
  }

  // 2) Fixed: accept "10k", "10 k", "2.5m", "2.5 m", "5000", "5,000"
  const compact = t.replace(/\s+/g, "");
  const m = compact.match(/^(-?[0-9][0-9,]*(?:\.[0-9]+)?)([km])?$/i);

  const rawNum =
    m?.[1] ?? (compact.match(/-?[0-9][0-9,]*(?:\.[0-9]+)?/)?.[0] ?? "");
  if (!rawNum) return { type: null, value: 0, amount: 0 };

  const suffix = (m?.[2] ?? compact.match(/[km]\b/i)?.[0] ?? "").toLowerCase();

  const cleaned = rawNum.replace(/,/g, "");
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return { type: null, value: 0, amount: 0 };

  n = Math.abs(n);

  const mult = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  const fixedValue = n * mult;

  const amount = Math.max(0, Math.min(total, Math.round(fixedValue)));
  return { type: "fixed", value: fixedValue, amount };
}

/** Convert to DB discount fields expected by create_sale_with_payment_v3 */
export function toDbDiscount(d: DiscountResult): {
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  discount_amount: number;
} {
  if (!d.type || d.amount <= 0) {
    return { discount_type: null, discount_value: null, discount_amount: 0 };
  }

  if (d.type === "percent") {
    return { discount_type: "PERCENT", discount_value: d.value, discount_amount: d.amount };
  }

  return { discount_type: "FIXED", discount_value: d.value, discount_amount: d.amount };
}