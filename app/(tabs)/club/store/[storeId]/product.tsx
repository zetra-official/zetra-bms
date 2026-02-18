import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Image as RNImage, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CatalogItem = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  created_at: string | null;
  updated_at: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n)} TZS`;
  }
}

export default function StoreCatalogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ storeId?: string }>();
  const storeId = clean(params?.storeId);

  const topPad = Math.max(insets.top, 10) + 8;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      if (!storeId) throw new Error("Store missing");

      const { data, error } = await supabase.rpc("get_store_catalog", { p_store_id: storeId });
      if (error) throw error;

      setItems((data ?? []) as CatalogItem[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load catalog");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const renderItem = useCallback(({ item }: { item: CatalogItem }) => {
    const img = clean(item.image_url);
    return (
      <Card style={{ padding: 12, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {img ? (
              <RNImage source={{ uri: img }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <Ionicons name="image-outline" size={18} color={theme.colors.faint} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>{item.name}</Text>
            <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 6 }}>
              {fmtTZS(Number(item.price ?? 0))}
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
              {item.is_available ? "Available" : "Unavailable"}
            </Text>
          </View>
        </View>
      </Card>
    );
  }, []);

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: topPad, paddingBottom: 12, gap: 12 }}>
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  backgroundColor: theme.colors.emeraldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="pricetag-outline" size={18} color={theme.colors.emerald} />
              </View>
              <View>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>Store Catalog</Text>
                <Text style={{ color: theme.colors.faint, fontWeight: "900", fontSize: 12 }}>Public products list</Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
            </Pressable>
          </View>
        </Card>

        {!!err && (
          <Card style={{ padding: 12, borderColor: theme.colors.dangerBorder, backgroundColor: theme.colors.dangerSoft }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}
      </View>
    );
  }, [err, router, topPad]);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <FlatList
        data={items}
        keyExtractor={(x) => String(x.id)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.page, paddingBottom: Math.max(insets.bottom, 10) + 16 }}
        ListEmptyComponent={
          loading ? null : (
            <Card style={{ padding: 14 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>No products</Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Hii store bado haijaweka bidhaa kwenye catalog.
              </Text>
            </Card>
          )
        }
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>Loading...</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}