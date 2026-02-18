import AsyncStorage from "@react-native-async-storage/async-storage";

const k = (storeId: string) => `zetra_sales_products_cache_v1:${storeId}`;
const ks = (storeId: string) => `zetra_sales_products_cache_sync_v1:${storeId}`;

export async function saveSalesProductsCache(storeId: string, rows: any[]) {
  const now = new Date().toISOString();
  await Promise.all([
    AsyncStorage.setItem(k(storeId), JSON.stringify(rows ?? [])),
    AsyncStorage.setItem(ks(storeId), now),
  ]);
  return now;
}

export async function loadSalesProductsCache(storeId: string) {
  const [raw, sync] = await Promise.all([AsyncStorage.getItem(k(storeId)), AsyncStorage.getItem(ks(storeId))]);
  const parsed = raw ? JSON.parse(raw) : [];
  return {
    rows: Array.isArray(parsed) ? parsed : [],
    lastSync: sync ? String(sync) : null,
  };
}