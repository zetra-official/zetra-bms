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

// Small safe guess for fraction digits (keeps legacy TZS 0-decimals)
function guessMaxFractionDigits(currency: string) {
  const c = String(currency || "TZS").trim().toUpperCase();
  if (!c) return 0;

  // Common 0-decimal currencies (safe minimal list)
  const ZERO = new Set([
    "TZS",
    "UGX",
    "RWF",
    "BIF",
    "XAF",
    "XOF",
    "JPY",
    "KRW",
    "VND",
  ]);

  return ZERO.has(c) ? 0 : 2;
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

  const refresh = useCallback(async () => {
    if (!id) {
      setPrefs(DEFAULT_PREFS);
      return;
    }
    const p = await getOrgMoneyPrefs(id);
    if (!aliveRef.current) return;
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
      await kv.setOrgCurrency(id, c || null);
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
      const safeN = Number.isFinite(n) ? n : 0;

      const maxFD = guessMaxFractionDigits(currency);

      try {
        if (!showCurrency) {
          return new Intl.NumberFormat(locale, {
            style: "decimal",
            maximumFractionDigits: maxFD,
          }).format(safeN);
        }

        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          maximumFractionDigits: maxFD,
        }).format(safeN);
      } catch {
        // fallback (still respects showCurrency)
        return showCurrency
          ? `${currency} ${String(Math.round(safeN))}`
          : `${String(Math.round(safeN))}`;
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
  const safeN = Number.isFinite(n) ? n : 0;

  const maxFD = guessMaxFractionDigits(currency);

  try {
    if (!showCurrency) {
      return new Intl.NumberFormat(locale, {
        style: "decimal",
        maximumFractionDigits: maxFD,
      }).format(safeN);
    }

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: maxFD,
    }).format(safeN);
  } catch {
    return showCurrency
      ? `${currency} ${String(Math.round(safeN))}`
      : `${String(Math.round(safeN))}`;
  }
}