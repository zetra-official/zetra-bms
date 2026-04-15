// src/storage/kv.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const KV_KEYS = {
  activeOrgId: "zetra_active_org_id",
  activeStoreId: "zetra_active_store_id",
  lastWorkspacePrefix: "zetra_last_workspace_v1",
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

/** ✅ Canonical per-org locale key (drives number formatting rules) */
export function orgLocaleKey(orgId: string) {
  const id = String(orgId || "").trim() || "global";
  return `zetra_org_locale_v1_${id}`;
}

/** ✅ Canonical per-org date format key (display-only) */
export function orgDateFormatKey(orgId: string) {
  const id = String(orgId || "").trim() || "global";
  return `zetra_org_date_format_v1_${id}`;
}

/** ✅ Canonical per-org number format key (display-only) */
export function orgNumberFormatKey(orgId: string) {
  const id = String(orgId || "").trim() || "global";
  return `zetra_org_number_format_v1_${id}`;
}

async function storageGetItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSetItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore storage failure (app must still run)
  }
}

async function storageRemoveItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function safeGet(key: string): Promise<string | null> {
  return storageGetItem(key);
}

async function safeSet(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) {
      await storageRemoveItem(key);
      return;
    }
    await storageSetItem(key, value);
  } catch {
    // ignore storage failure (app must still run)
  }
}

async function safeRemove(key: string): Promise<void> {
  await storageRemoveItem(key);
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
      await storageSetItem(key, JSON.stringify(value));
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

  // ===== Locale helpers (org-level) =====
  getOrgLocale: async (orgId: string): Promise<string | null> => {
    return safeGet(orgLocaleKey(orgId));
  },

  setOrgLocale: async (orgId: string, locale: string | null): Promise<void> => {
    const v = String(locale ?? "").trim();
    await safeSet(orgLocaleKey(orgId), v ? v : null);
  },

  // ===== Date format helpers (org-level) =====
  getOrgDateFormat: async (orgId: string): Promise<string | null> => {
    return safeGet(orgDateFormatKey(orgId));
  },

  setOrgDateFormat: async (orgId: string, fmt: string | null): Promise<void> => {
    const v = String(fmt ?? "").trim();
    await safeSet(orgDateFormatKey(orgId), v ? v : null);
  },

  // ===== Number format helpers (org-level) =====
  getOrgNumberFormat: async (orgId: string): Promise<string | null> => {
    return safeGet(orgNumberFormatKey(orgId));
  },

  setOrgNumberFormat: async (orgId: string, fmt: string | null): Promise<void> => {
    const v = String(fmt ?? "").trim();
    await safeSet(orgNumberFormatKey(orgId), v ? v : null);
  },

  clearActiveSelection: async () => {
    await Promise.all([safeRemove(KV_KEYS.activeOrgId), safeRemove(KV_KEYS.activeStoreId)]);
  },

  lastWorkspaceKeyForUser: (userId: string) => {
    const id = String(userId || "").trim() || "anonymous";
    return `${KV_KEYS.lastWorkspacePrefix}:${id}`;
  },

  getLastWorkspaceForUser: async (
    userId: string
  ): Promise<{ orgId: string | null; storeId: string | null } | null> => {
    const key = `${KV_KEYS.lastWorkspacePrefix}:${String(userId || "").trim() || "anonymous"}`;
    const raw = await safeGet(key);
    const parsed = safeJsonParse<{ orgId?: string | null; storeId?: string | null }>(raw);

    if (!parsed) return null;

    return {
      orgId: String(parsed.orgId ?? "").trim() || null,
      storeId: String(parsed.storeId ?? "").trim() || null,
    };
  },

  setLastWorkspaceForUser: async (
    userId: string,
    value: { orgId: string | null; storeId: string | null } | null
  ): Promise<void> => {
    const key = `${KV_KEYS.lastWorkspacePrefix}:${String(userId || "").trim() || "anonymous"}`;

    if (!value) {
      await safeRemove(key);
      return;
    }

    await kv.setJson(key, {
      orgId: String(value.orgId ?? "").trim() || null,
      storeId: String(value.storeId ?? "").trim() || null,
    });
  },
};