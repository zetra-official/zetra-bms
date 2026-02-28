// src/storage/kv.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export const KV_KEYS = {
  activeOrgId: "zetra_active_org_id",
  activeStoreId: "zetra_active_store_id",
} as const;

/** ✅ Canonical per-org currency key (org-level accounting consistency) */
export function orgCurrencyKey(orgId: string) {
  const id = String(orgId || "").trim() || "global";
  return `zetra_org_currency_v1_${id}`;
}

/** ✅ Canonical per-org timezone key (org-level reporting cutoffs) */
export function orgTimezoneKey(orgId: string) {
  const id = String(orgId || "").trim() || "global";
  return `zetra_org_timezone_v1_${id}`;
}

/** (optional future) locale key */
export function orgLocaleKey(orgId: string) {
  const id = String(orgId || "").trim() || "global";
  return `zetra_org_locale_v1_${id}`;
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore storage failure (app must still run)
  }
}

async function safeRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(raw: string | null): T | null {
  try {
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const kv = {
  // ===== string =====
  getString: safeGet,
  setString: safeSet,
  remove: safeRemove,

  // ===== json =====
  getJson: async <T>(key: string): Promise<T | null> => {
    const raw = await safeGet(key);
    return safeJsonParse<T>(raw);
  },

  setJson: async (key: string, value: unknown | null): Promise<void> => {
    try {
      if (value === null) {
        await safeRemove(key);
        return;
      }
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  },

  // ===== AI memory key builder =====
  aiMemoryKey: (orgKey: string) => `zetra_ai_memory__${String(orgKey || "global")}`,

  // ===== Currency helpers (org-level) =====
  getOrgCurrency: async (orgId: string): Promise<string | null> => {
    return safeGet(orgCurrencyKey(orgId));
  },

  setOrgCurrency: async (orgId: string, currencyCode: string | null): Promise<void> => {
    const code = String(currencyCode ?? "").trim().toUpperCase();
    await safeSet(orgCurrencyKey(orgId), code ? code : null);
  },

  // ===== Timezone helpers (org-level) =====
  getOrgTimezone: async (orgId: string): Promise<string | null> => {
    return safeGet(orgTimezoneKey(orgId));
  },

  setOrgTimezone: async (orgId: string, tz: string | null): Promise<void> => {
    const v = String(tz ?? "").trim();
    await safeSet(orgTimezoneKey(orgId), v ? v : null);
  },

  // (optional future)
  getOrgLocale: async (orgId: string): Promise<string | null> => {
    return safeGet(orgLocaleKey(orgId));
  },

  setOrgLocale: async (orgId: string, locale: string | null): Promise<void> => {
    const v = String(locale ?? "").trim();
    await safeSet(orgLocaleKey(orgId), v ? v : null);
  },

  clearActiveSelection: async () => {
    await Promise.all([safeRemove(KV_KEYS.activeOrgId), safeRemove(KV_KEYS.activeStoreId)]);
  },
};