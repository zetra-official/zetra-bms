import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type RangeKey = "TODAY" | "YESTERDAY" | "WEEK" | "CUSTOM";

type SoldItemsRow = {
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity_sold: number;
  sales_value: number;
};

function ymd(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getRange(key: RangeKey) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (key === "TODAY") {
    return { from: ymd(start), to: ymd(end), label: "Today" };
  }

  if (key === "YESTERDAY") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    return { from: ymd(start), to: ymd(end), label: "Yesterday" };
  }

  start.setDate(start.getDate() - 6);
  return { from: ymd(start), to: ymd(end), label: "Last 7 Days" };
}

export default function SoldItemsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const orgId = String(params?.orgId ?? "").trim();
  const storeId = String(params?.storeId ?? "").trim();
  const storeName = String(params?.storeName ?? "Active Store").trim();

  const { currency, locale } = useOrgMoneyPrefs(orgId);

  const [rangeKey, setRangeKey] = useState<RangeKey>("TODAY");
const [customFrom, setCustomFrom] = useState(ymd(new Date()));
const [customTo, setCustomTo] = useState(ymd(new Date()));
  const [rows, setRows] = useState<SoldItemsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const range = useMemo(() => {
  if (rangeKey === "CUSTOM") {
    return {
      from: customFrom,
      to: customTo,
      label: "Custom Date",
    };
  }

  return getRange(rangeKey);
}, [rangeKey, customFrom, customTo]);

  const totalQty = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.quantity_sold || 0), 0),
    [rows]
  );

  const totalValue = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.sales_value || 0), 0),
    [rows]
  );

  const money = useCallback(
    (n: number) =>
      formatMoney(Number(n || 0), {
        currency,
        locale,
      }).replace(/\s+/g, " "),
    [currency, locale]
  );

  const load = useCallback(async () => {
    if (!orgId || !storeId) {
      setErr("Organization au store haijapatikana.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const { data, error } = await supabase.rpc("get_chapchap_sales_summary_v1", {
        p_org_id: orgId,
        p_store_id: storeId,
        p_from_date: range.from,
        p_to_date: range.to,
      });

      if (error) throw error;

      const mapped: SoldItemsRow[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        product_id: r?.product_id ?? null,
        product_name: String(r?.product_name ?? "Unknown Product"),
        sku: r?.sku ? String(r.sku) : null,
        quantity_sold: Number(r?.quantity_sold ?? 0),
        sales_value: Number(r?.sales_value ?? 0),
      }));

      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message ?? "Imeshindikana kusoma Sold Items summary.");
    } finally {
      setLoading(false);
    }
  }, [orgId, storeId, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen scroll={false} bottomPad={0}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 14 }}
      >
        <View style={{ gap: 8 }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>‹ Back</Text>
          </Pressable>

          <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: "900" }}>
            Sold Items
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 20 }}>
            Bidhaa zilizouzwa kwa active store, zimepangwa kwa makundi yake bila kutoa expenses.
          </Text>
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
            STORE
          </Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
            {storeName || "Active Store"}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Kipindi: {range.label} · {range.from} mpaka {range.to}
          </Text>
        </Card>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["TODAY", "YESTERDAY", "WEEK", "CUSTOM"] as RangeKey[]).map((k) => {
            const active = rangeKey === k;
            return (
              <Pressable
                key={k}
                onPress={() => setRangeKey(k)}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: active ? "rgba(236,72,153,0.65)" : theme.colors.border,
                  backgroundColor: active ? "rgba(236,72,153,0.18)" : theme.colors.card,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? "#F9A8D4" : theme.colors.muted,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  {k === "TODAY"
  ? "Today"
  : k === "YESTERDAY"
  ? "Yesterday"
  : k === "WEEK"
  ? "7 Days"
  : "Custom"}
                </Text>
              </Pressable>
            );
          })}
        </View>

    {rangeKey === "CUSTOM" ? (
  <Card style={{ gap: 12 }}>
    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
      Arrange Date
    </Text>

    <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 20 }}>
      Andika tarehe kwa mfumo wa YYYY-MM-DD. Mfano: 2026-06-01 mpaka 2026-06-02.
    </Text>

    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>
          From
        </Text>
        <TextInput
          value={customFrom}
          onChangeText={setCustomFrom}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.colors.muted}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 14,
            backgroundColor: theme.colors.card,
            color: theme.colors.text,
            fontWeight: "900",
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>
          To
        </Text>
        <TextInput
          value={customTo}
          onChangeText={setCustomTo}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.colors.muted}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 14,
            backgroundColor: theme.colors.card,
            color: theme.colors.text,
            fontWeight: "900",
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        />
      </View>
    </View>

    <Pressable
      onPress={load}
      disabled={loading}
      style={{
        borderRadius: 16,
        backgroundColor: "#BE185D",
        paddingVertical: 13,
        alignItems: "center",
        opacity: loading ? 0.6 : 1,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
        Apply Date
      </Text>
    </Pressable>
  </Card>
) : null}

<View style={{ flexDirection: "row", gap: 10 }}>
  <Card style={{ flex: 1 }}>
    <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
      Items Sold
    </Text>
    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 24, marginTop: 6 }}>
      {totalQty}
    </Text>
  </Card>

  <Card style={{ flex: 1 }}>
    <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
      Sales Value
    </Text>
    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18, marginTop: 8 }}>
      {money(totalValue)}
    </Text>
  </Card>
</View>

        <Card style={{ borderColor: "rgba(245,158,11,0.40)", backgroundColor: "rgba(245,158,11,0.10)" }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", lineHeight: 20 }}>
            Hii ni thamani ya bidhaa zilizouzwa tu. Haijatoa expenses, matumizi, credit collection wala profit.
          </Text>
        </Card>

        {loading ? (
          <Card style={{ alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Loading Sold Items...
            </Text>
          </Card>
        ) : err ? (
          <Card style={{ borderColor: "rgba(239,68,68,0.45)", backgroundColor: "rgba(239,68,68,0.10)" }}>
            <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>{err}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
              Kama RPC bado haijawekwa, hatua inayofuata ni kuongeza SQL ya get_chapchap_sales_summary_v1.
            </Text>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Hakuna bidhaa zilizouzwa kwenye kipindi hiki.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Sold Products
            </Text>

            {rows.map((r, index) => (
              <Card key={`${r.product_id ?? r.product_name}-${index}`} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {r.product_name}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
                      {r.sku ? `SKU: ${r.sku}` : "No SKU"}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: "#F9A8D4", fontWeight: "900", fontSize: 18 }}>
                      {r.quantity_sold}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                      qty sold
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border,
                    paddingTop: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                    Selling value
                  </Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {money(r.sales_value)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        <Pressable
          onPress={load}
          disabled={loading}
          style={{
            borderRadius: 18,
            backgroundColor: "#BE185D",
            paddingVertical: 14,
            alignItems: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
            Refresh Sold Items
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}