// src/storage/kv.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export const KV_KEYS = {
  activeOrgId: "zetra_active_org_id",
  activeStoreId: "zetra_active_store_id",
} as const;

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

export const kv = {
  getString: safeGet,
  setString: safeSet,
  remove: safeRemove,
  clearActiveSelection: async () => {
    await Promise.all([
      safeRemove(KV_KEYS.activeOrgId),
      safeRemove(KV_KEYS.activeStoreId),
    ]);
  },
};