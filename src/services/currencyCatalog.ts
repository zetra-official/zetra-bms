// src/services/currencyCatalog.ts
import { kv } from "@/src/storage/kv";

export type CurrencyMeta = {
  code: string; // ISO 4217
  name: string;
  symbol?: string;
  symbolNative?: string;
  decimals?: number;
};

const KV_KEY = "zetra_currency_catalog_v1";
const KV_UPDATED_AT = "zetra_currency_catalog_v1_updated_at";

// ✅ Remote catalog (download once, then cached)
const SOURCE_URL =
  "https://raw.githubusercontent.com/ourworldincode/currency/main/currencies.json";

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

function sortCurrencies(list: CurrencyMeta[]) {
  const a = [...list];
  a.sort((x, y) => {
    const cx = upper(x.code);
    const cy = upper(y.code);
    if (cx < cy) return -1;
    if (cx > cy) return 1;
    return clean(x.name).localeCompare(clean(y.name));
  });
  return a;
}

function normalizeFromRemote(json: any): CurrencyMeta[] {
  const out: CurrencyMeta[] = [];
  if (!json || typeof json !== "object") return out;

  for (const k of Object.keys(json)) {
    const code = upper(k);
    const v = json[k] ?? {};
    const name = clean(v?.name) || code;
    const symbol = clean(v?.symbol) || undefined;
    const symbolNative = clean(v?.symbolNative) || undefined;

    let decimals: number | undefined = undefined;
    const d = v?.decimals ?? v?.ISOdigits ?? v?.ISODigits;
    if (typeof d === "number") decimals = d;
    else if (typeof d === "string" && d.trim() !== "" && !Number.isNaN(Number(d))) {
      decimals = Number(d);
    }

    out.push({ code, name, symbol, symbolNative, decimals });
  }

  return sortCurrencies(out);
}

// ✅ ultra-light fallback (app stays small)
export const FALLBACK_CURRENCIES: CurrencyMeta[] = sortCurrencies([
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", symbolNative: "TSh", decimals: 0 },
  { code: "USD", name: "United States Dollar", symbol: "$", symbolNative: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", symbolNative: "€", decimals: 2 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", symbolNative: "£", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", symbolNative: "KSh", decimals: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", symbolNative: "¥", decimals: 2 },
]);

export async function getCachedCurrencyCatalog(): Promise<CurrencyMeta[] | null> {
  const raw = await kv.getString(KV_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const list = parsed
      .filter((x) => x && typeof x.code === "string" && typeof x.name === "string")
      .map((x) => ({
        code: upper(x.code),
        name: clean(x.name),
        symbol: clean(x.symbol) || undefined,
        symbolNative: clean(x.symbolNative) || undefined,
        decimals: typeof x.decimals === "number" ? x.decimals : undefined,
      })) as CurrencyMeta[];

    return sortCurrencies(list);
  } catch {
    return null;
  }
}

async function setCachedCurrencyCatalog(list: CurrencyMeta[]) {
  await kv.setString(KV_KEY, JSON.stringify(list));
  await kv.setString(KV_UPDATED_AT, String(Date.now()));
}

export async function fetchRemoteCurrencyCatalog(): Promise<CurrencyMeta[]> {
  const res = await fetch(SOURCE_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Currency catalog fetch failed (${res.status})`);

  const txt = await res.text();
  const json = JSON.parse(txt);
  const list = normalizeFromRemote(json);
  if (!list.length) throw new Error("Currency catalog empty");
  return list;
}

/**
 * ✅ Fast load:
 * - cache if exists
 * - else fallback (instant)
 */
export async function loadCurrencyCatalogFast(): Promise<CurrencyMeta[]> {
  const cached = await getCachedCurrencyCatalog();
  return cached && cached.length ? cached : FALLBACK_CURRENCIES;
}

/**
 * ✅ Refresh:
 * - downloads full list once then caches it
 */
export async function refreshCurrencyCatalog(): Promise<CurrencyMeta[]> {
  const list = await fetchRemoteCurrencyCatalog();
  await setCachedCurrencyCatalog(list);
  return list;
}