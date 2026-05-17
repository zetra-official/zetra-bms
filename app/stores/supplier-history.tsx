// app/stores/supplier-history.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";

type HistoryRange = "RECENT" | "TODAY" | "WEEK" | "MONTH" | "ALL";

type MovementRow = {
  movement_id?: string | null;
  id?: string | null;
  product_name?: string | null;
  sku?: string | null;
  store_name?: string | null;
  mode?: string | null;
  amount?: number | null;
  supplier_invoice_no?: string | null;
  note?: string | null;
  created_at?: string | null;
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmtDate(input?: string | null) {
  if (!input) return "—";
  try {
    return new Date(input).toLocaleString();
  } catch {
    return String(input);
  }
}

function isSameDay(d: Date, now = new Date()) {
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisWeek(d: Date, now = new Date()) {
  const diffMs = now.getTime() - d.getTime();
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function isThisMonth(d: Date, now = new Date()) {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function SupplierHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    supplierId?: string | string[];
    supplierName?: string | string[];
  }>();

  const supplierId = String(one(params.supplierId) ?? "").trim();
  const supplierName = String(one(params.supplierName) ?? "Supplier").trim() || "Supplier";

  const { activeOrgId } = useOrg() as any;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [range, setRange] = useState<HistoryRange>("RECENT");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const orgId = String(activeOrgId ?? "").trim();
      if (!orgId) throw new Error("No active organization.");
      if (!supplierId) throw new Error("Missing supplier.");

      const { data, error } = await supabase.rpc("get_supplier_stock_history_v1", {
        p_supplier_id: supplierId,
      });

      if (error) throw error;

      setRows((data ?? []) as MovementRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

    if (range === "RECENT") return sorted.slice(0, 5);
    if (range === "ALL") return sorted;

    return sorted.filter((r) => {
      const d = new Date(r.created_at ?? "");
      if (Number.isNaN(d.getTime())) return false;

      if (range === "TODAY") return isSameDay(d);
      if (range === "WEEK") return isThisWeek(d);
      if (range === "MONTH") return isThisMonth(d);

      return true;
    });
  }, [range, rows]);

  const totalQty = useMemo(() => {
    return visibleRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  }, [visibleRows]);

  return (
    <Screen scroll bottomPad={160}>
      <View style={{ gap: 14 }}>
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
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 24 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: "900" }}>
              Supplier History
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {supplierName}
            </Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            History Filters
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              ["RECENT", "Recent 5"],
              ["TODAY", "Today"],
              ["WEEK", "7 Days"],
              ["MONTH", "Month"],
              ["ALL", "All"],
            ].map(([key, label]) => {
              const active = range === key;

              return (
                <Pressable
                  key={key}
                  onPress={() => setRange(key as HistoryRange)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
                    backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text
                    style={{
                      color: active ? theme.colors.emerald : theme.colors.text,
                      fontWeight: "900",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Entries: {visibleRows.length} • Qty: {totalQty}
          </Text>
        </Card>

        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 20 }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading supplier history...
            </Text>
          </View>
        ) : visibleRows.length === 0 ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Hakuna stock history kwenye filter hii.
            </Text>
          </Card>
        ) : (
          visibleRows.map((r, index) => (
            <Card key={String(r.movement_id ?? r.id ?? index)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    {r.product_name ?? "Product"}
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    SKU: {r.sku ?? "—"} • Store: {r.store_name ?? "—"}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.30)",
                    backgroundColor: "rgba(52,211,153,0.10)",
                  }}
                >
                  <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                    {String(r.mode ?? "ADD").toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Qty: {Number(r.amount ?? 0)}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Invoice / Ref: {r.supplier_invoice_no || "—"}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Date: {fmtDate(r.created_at)}
              </Text>

              {!!String(r.note ?? "").trim() && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Note: {String(r.note ?? "").trim()}
                </Text>
              )}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}