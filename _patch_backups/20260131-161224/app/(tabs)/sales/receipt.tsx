// app/(tabs)/sales/receipt.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

type SaleDetail = {
  sale_id?: string;
  id?: string;
  created_at?: string;
  payment_method?: string | null;
  note?: string | null;
  items?: Array<{
    product_id: string;
    product_name?: string | null;
    sku?: string | null;
    qty: number;
  }>;
};

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string | string[] }>();
  const saleId = (one(params.saleId) ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!saleId) throw new Error("Missing saleId");

      let res = await supabase.rpc("get_sale_detail", { p_sale_id: saleId } as any);
      if (res.error) res = await supabase.rpc("get_sale_detail", { p_id: saleId } as any);
      if (res.error) res = await supabase.rpc("get_sale_detail", { sale_id: saleId } as any);

      if (res.error) throw res.error;

      const d = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      setDetail(d as any);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load receipt");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const when = useMemo(() => {
    const t = detail?.created_at;
    if (!t) return "â€”";
    try {
      return new Date(t).toLocaleString();
    } catch {
      return String(t);
    }
  }, [detail?.created_at]);

  const items = detail?.items ?? [];

  return (
    <Screen bottomPad={140}>
      <View style={{ flex: 1, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              Receipt
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Sale: {saleId ? saleId.slice(0, 10) : "â€”"}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Loading receipt...
            </Text>
          </View>
        ) : err ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "800" }}>{err}</Text>
            <Button title="Retry" onPress={load} variant="primary" />
          </Card>
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>When</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{when}</Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                Payment
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {detail?.payment_method ?? "â€”"}
              </Text>

              {!!detail?.note && (
                <>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Note
                  </Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {detail.note}
                  </Text>
                </>
              )}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Items ({items.length})
              </Text>

              {items.length === 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>No items found.</Text>
              ) : (
                items.map((it, idx) => (
                  <View
                    key={`${it.product_id}-${idx}`}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 10,
                      paddingVertical: 6,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                        {it.product_name ?? "Product"}
                      </Text>
                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        SKU: {it.sku ?? "â€”"}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>x{it.qty}</Text>
                  </View>
                ))
              )}
            </Card>

            <Card style={{ gap: 10 }}>
              <Button
                title="Back to History"
                onPress={() => router.replace("/sales/history")}
                variant="primary"
              />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
