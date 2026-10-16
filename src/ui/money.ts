// src/ui/money.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kv } from "@/src/storage/kv";

/**
 * ✅ Single source of truth for money formatting in ZETRA.
 * - Reads org-level currency from KV: zetra_org_currency_v1_${orgId}
 * - Display-only: does NOT change calculations.
 *
 * NEW:
 * - opts.showCurrency === false => returns numbers ONLY (no TSh / no TZS)
 */

export type MoneyPrefs = {
  currency: string; // ISO 4217 e.g., TZS, USD
  locale: string; // e.g., en-TZ
};

const DEFAULT_PREFS: MoneyPrefs = {
  currency: "TZS",
  locale: "en-TZ",
};

// Preserve the existing TZS display convention; otherwise use runtime currency metadata.
function guessMaxFractionDigits(currency: string) {
  const c = String(currency || "TZS").trim().toUpperCase();
  if (!c) return 0;

  if (c === "TZS") return 0;
  return getNumberFormatter("en", { style: "currency", currency: c })
    .resolvedOptions().maximumFractionDigits;
}

// Bounded cache shared by reports and lists; no financial values are retained.
const formatterCache = new Map<string, Intl.NumberFormat>();
function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions) {
  const key = JSON.stringify([locale, options]);
  const existing = formatterCache.get(key);
  if (existing) return existing;
  const formatter = new Intl.NumberFormat(locale, options);
  if (formatterCache.size >= 64) {
    const oldest = formatterCache.keys().next().value;
    if (oldest !== undefined) formatterCache.delete(oldest);
  }
  formatterCache.set(key, formatter);
  return formatter;
}

export async function getOrgMoneyPrefs(orgId: string): Promise<MoneyPrefs> {
  const id = String(orgId || "").trim();
  if (!id) return DEFAULT_PREFS;

  const code = (await kv.getOrgCurrency(id)) || DEFAULT_PREFS.currency;
  // (future) locale support
  const locale = (await kv.getOrgLocale(id)) || DEFAULT_PREFS.locale;

  return {
    currency:
      String(code || DEFAULT_PREFS.currency).trim().toUpperCase() ||
      DEFAULT_PREFS.currency,
    locale: String(locale || DEFAULT_PREFS.locale).trim() || DEFAULT_PREFS.locale,
  };
}

export function useOrgMoneyPrefs(orgId: string) {
  const id = String(orgId || "").trim();

  const [prefs, setPrefs] = useState<MoneyPrefs>(DEFAULT_PREFS);
  const aliveRef = useRef(true);
  const scopeRef = useRef(id);
  const refreshGeneration = useRef(0);
  scopeRef.current = id;

  const refresh = useCallback(async () => {
    if (scopeRef.current !== id) return;
    const generation = ++refreshGeneration.current;
    if (!id) {
      setPrefs(DEFAULT_PREFS);
      return;
    }
    const p = await getOrgMoneyPrefs(id);
    if (!aliveRef.current || scopeRef.current !== id || generation !== refreshGeneration.current) return;
    setPrefs(p);
  }, [id]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  const setCurrency = useCallback(
    async (code: string) => {
      if (!id) return;
      const c = String(code || "").trim().toUpperCase();
      const current = await getOrgMoneyPrefs(id);
      // A KV preference is not an accounting migration or evidence of transaction currency.
      if ((c || DEFAULT_PREFS.currency) !== current.currency) {
        throw new Error("BUSINESS_CURRENCY_CHANGE_REQUIRES_VERIFIED_CONTRACT");
      }
      await refresh();
    },
    [id, refresh]
  );

  const fmt = useCallback(
    (
      amount: number,
      override?: {
        currency?: string | null;
        locale?: string | null;
        showCurrency?: boolean | null;
      }
    ) => {
      const currency =
        String(override?.currency || prefs.currency || DEFAULT_PREFS.currency)
          .trim()
          .toUpperCase() || DEFAULT_PREFS.currency;

      const locale =
        String(override?.locale || prefs.locale || DEFAULT_PREFS.locale).trim() ||
        DEFAULT_PREFS.locale;

      const showCurrency = override?.showCurrency !== false; // default true

      const n = Number(amount);
      if (!Number.isFinite(n)) return "—";
      const safeN = n;

      try {
        const maxFD = guessMaxFractionDigits(currency);
        if (!showCurrency) {
          return getNumberFormatter(locale, {
            style: "decimal",
            maximumFractionDigits: maxFD,
          }).format(safeN);
        }

        return getNumberFormatter(locale, {
          style: "currency",
          currency,
          maximumFractionDigits: maxFD,
        }).format(safeN);
      } catch {
        // fallback (still respects showCurrency)
        return showCurrency
          ? `${currency} ${String(safeN)}`
          : String(safeN);
      }
    },
    [prefs.currency, prefs.locale]
  );

  return useMemo(
    () => ({
      prefs,
      currency: prefs.currency,
      locale: prefs.locale,
      refresh,
      setCurrency,
      fmt,
    }),
    [prefs, refresh, setCurrency, fmt]
  );
}

/** Simple static formatter (used when you already have currency/locale resolved) */
export function formatMoney(
  amount: number,
  opts?: {
    currency?: string | null;
    locale?: string | null;
    showCurrency?: boolean | null; // NEW
  }
) {
  const currency =
    String(opts?.currency || DEFAULT_PREFS.currency).trim().toUpperCase() ||
    DEFAULT_PREFS.currency;
  const locale = String(opts?.locale || DEFAULT_PREFS.locale).trim() || DEFAULT_PREFS.locale;
  const showCurrency = opts?.showCurrency !== false; // default true

  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
      const safeN = n;

  try {
    const maxFD = guessMaxFractionDigits(currency);
    if (!showCurrency) {
      return getNumberFormatter(locale, {
        style: "decimal",
        maximumFractionDigits: maxFD,
      }).format(safeN);
    }

    return getNumberFormatter(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: maxFD,
    }).format(safeN);
  } catch {
    return showCurrency
      ? `${currency} ${String(safeN)}`
      : String(safeN);
  }
}
