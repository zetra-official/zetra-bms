import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";
import { formatMoney, useOrgMoneyPrefs } from "../../src/ui/money";

type CustomerRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  total_orders: number | null;
  total_spent: number | null;
  last_seen_at: string | null;
  updated_at: string | null;
};

const UI = {
  bg: "#F3F7FC",
  card: "#FFFFFF",
  soft: "#F8FAFC",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",
  danger: "#E11D48",
  warning: "#D97706",
  warningSoft: "rgba(217,119,6,0.10)",
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function daysSince(raw?: string | null) {
  if (!raw) return 9999;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 9999;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CustomerInsightsScreen() {
  const router = useRouter();
  const org: any = useOrg();

  const activeOrgId = clean(org.activeOrgId);
  const activeStoreId = clean(org.activeStoreId);
  const activeStoreName = clean(org.activeStoreName) || "Active Store";

  const money = useOrgMoneyPrefs(activeOrgId);
  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: money.currency || "TZS",
        locale: money.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [money.currency, money.locale]
  );

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const load = useCallback(async () => {
    if (!activeStoreId) {
      setRows([]);
      setErrorText("No active store selected.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, full_name, phone, normalized_phone, total_orders, total_spent, last_seen_at, updated_at"
      )
      .eq("store_id", activeStoreId)
      .order("total_spent", { ascending: false })
      .limit(200);

    if (error) {
      setErrorText(error.message);
      setRows([]);
    } else {
      setErrorText("");
      setRows((data ?? []) as CustomerRow[]);
    }

    setLoading(false);
  }, [activeStoreId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const inactive7 = useMemo(() => rows.filter((c) => daysSince(c.last_seen_at) >= 7), [rows]);
  const inactive14 = useMemo(() => rows.filter((c) => daysSince(c.last_seen_at) >= 14), [rows]);
  const inactive30 = useMemo(() => rows.filter((c) => daysSince(c.last_seen_at) >= 30), [rows]);

  const topCustomers = useMemo(
    () =>
      [...rows]
        .sort((a, b) => Number(b.total_spent ?? 0) - Number(a.total_spent ?? 0))
        .slice(0, 10),
    [rows]
  );

  function CustomerLine({ c }: { c: CustomerRow }) {
    const name = clean(c.full_name) || "Customer";
    const phone = clean(c.phone) || clean(c.normalized_phone) || "—";
    const d = daysSince(c.last_seen_at);
    const spent = Number(c.total_spent ?? 0);

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/customers/[id]",
            params: { id: c.id },
          } as any)
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <View
          style={{
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: UI.border,
            backgroundColor: UI.soft,
            gap: 5,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>{name}</Text>
          <Text style={{ color: UI.muted, fontWeight: "800" }}>{phone}</Text>
          <Text style={{ color: UI.emerald, fontWeight: "900" }}>
            {d >= 9999 ? "No recent purchase" : `Last purchase: ${d} day(s) ago`} • {fmt(spent)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Screen scroll bottomPad={120} contentStyle={{ backgroundColor: UI.bg }}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: UI.border,
              backgroundColor: UI.card,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
              Customer Alerts
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Store: {activeStoreName}
            </Text>
          </View>
        </View>

        {loading ? (
          <Card style={{ alignItems: "center", gap: 10, backgroundColor: UI.card }}>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Loading insights...</Text>
          </Card>
        ) : errorText ? (
          <Card
            style={{
              backgroundColor: "rgba(225,29,72,0.08)",
              borderColor: "rgba(225,29,72,0.25)",
            }}
          >
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{errorText}</Text>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Card style={{ flex: 1, backgroundColor: UI.card }}>
                <Text style={{ color: UI.muted, fontWeight: "900" }}>7+ Days</Text>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                  {inactive7.length}
                </Text>
              </Card>

              <Card style={{ flex: 1, backgroundColor: UI.card }}>
                <Text style={{ color: UI.muted, fontWeight: "900" }}>30+ Days</Text>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                  {inactive30.length}
                </Text>
              </Card>
            </View>

            <Card style={{ gap: 10, backgroundColor: UI.card }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
                Needs Follow-up
              </Text>

              {(inactive14.length ? inactive14 : inactive7).slice(0, 20).map((c) => (
                <CustomerLine key={c.id} c={c} />
              ))}

              {inactive7.length === 0 ? (
                <Text style={{ color: UI.muted, fontWeight: "800" }}>
                  No inactive customers yet.
                </Text>
              ) : null}
            </Card>

            <Card style={{ gap: 10, backgroundColor: UI.card }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
                Top Customers
              </Text>

              {topCustomers.length === 0 ? (
                <Text style={{ color: UI.muted, fontWeight: "800" }}>
                  No customer data yet.
                </Text>
              ) : (
                topCustomers.map((c) => <CustomerLine key={c.id} c={c} />)
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}