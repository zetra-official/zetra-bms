import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";
import { formatMoney, useOrgMoneyPrefs } from "../../src/ui/money";

type CustomerRow = {
  id: string;
  store_id: string | null;
  organization_id: string | null;
  full_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  total_orders: number | null;
  total_spent: number | null;
  last_seen_at: string | null;
  updated_at: string | null;
  avatar_url: string | null;
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
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function normalizePhoneForAction(raw: string) {
  const s = clean(raw).replace(/[^\d+]/g, "");
  if (!s) return "";

  if (s.startsWith("+")) return `+${s.replace(/[^\d]/g, "")}`;

  const digits = s.replace(/[^\d]/g, "");

  if (digits.startsWith("0") && digits.length >= 9) return `+255${digits.slice(1)}`;
  if (digits.startsWith("255")) return `+${digits}`;

  return `+${digits}`;
}

function phoneForWhatsApp(raw: string) {
  return normalizePhoneForAction(raw).replace(/[^\d]/g, "");
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function prettyDate(raw?: string | null) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function CardBox({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: UI.border,
          borderRadius: 22,
          backgroundColor: UI.card,
          padding: 16,
          shadowColor: "#0F172A",
          shadowOpacity: 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function WebIcon({
  label,
  size = 22,
  color,
}: {
  label: string;
  size?: number;
  color: string;
}) {
  return (
    <Text style={{ color, fontSize: size, fontWeight: "900", lineHeight: size + 4 }}>
      {label}
    </Text>
  );
}

export default function CustomersScreen() {
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
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [errorText, setErrorText] = useState("");

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastChannel, setBroadcastChannel] = useState<"WHATSAPP" | "SMS">("WHATSAPP");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastIndex, setBroadcastIndex] = useState(0);

  const load = useCallback(async () => {
    if (!activeStoreId) {
      setRows([]);
      setErrorText("No active store selected.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setErrorText("");

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, store_id, organization_id, full_name, phone, normalized_phone, total_orders, total_spent, last_seen_at, updated_at, avatar_url"
      )
      .eq("store_id", activeStoreId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      setRows([]);
      setErrorText(error.message);
    } else {
      setRows((data ?? []) as CustomerRow[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [activeStoreId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;

    return rows.filter((c) => {
      const hay = `${c.full_name ?? ""} ${c.phone ?? ""} ${c.normalized_phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const broadcastRecipients = useMemo(() => {
    return filtered
      .map((c) => clean(c.normalized_phone) || clean(c.phone))
      .map(normalizePhoneForAction)
      .filter(Boolean);
  }, [filtered]);

  const exportCustomersPdf = useCallback(async () => {
    const rowsHtml = filtered
      .map((c, i) => {
        const name = clean(c.full_name) || "Customer";
        const phone = clean(c.phone) || clean(c.normalized_phone) || "—";
        const orders = Number(c.total_orders ?? 0);
        const spent = Number(c.total_spent ?? 0);

        return `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(name)}</td>
            <td>${esc(phone)}</td>
            <td class="right">${orders}</td>
            <td class="right">${esc(fmt(spent))}</td>
            <td>${esc(prettyDate(c.last_seen_at))}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 28px; color: #101827; }
            .brand { font-size: 30px; font-weight: 900; color: #059669; }
            .sub { color: #667085; font-weight: 700; margin-top: 4px; }
            .card { border: 1px solid #D0D5DD; border-radius: 18px; padding: 18px; margin-top: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
            th, td { padding: 10px; border-bottom: 1px solid #EAECF0; text-align: left; }
            th { background: #ECFDF3; color: #047857; }
            .right { text-align: right; font-weight: 800; }
            .footer { margin-top: 24px; color: #667085; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="brand">${esc(activeStoreName)}</div>
          <div class="sub">Customers Statement • Generated: ${esc(prettyDate(new Date().toISOString()))}</div>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Customer</th><th>Phone</th><th class="right">Orders</th><th class="right">Spent</th><th>Last Seen</th>
                </tr>
              </thead>
              <tbody>${rowsHtml || `<tr><td colspan="6">No customers found.</td></tr>`}</tbody>
            </table>
          </div>
          <div class="footer">Powered by ZETRA BMS • Premium customer records</div>
        </body>
      </html>
    `;

    const file = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(file.uri);
  }, [activeStoreName, filtered, fmt]);

  const sendBroadcastNext = useCallback(async () => {
    const message = clean(broadcastMessage);

    if (!message) {
      Alert.alert("Message required", "Andika ujumbe kwanza.");
      return;
    }

    if (broadcastRecipients.length === 0) {
      Alert.alert("No recipients", "Hakuna customer mwenye phone number.");
      return;
    }

    const phone = broadcastRecipients[broadcastIndex];

    if (!phone) {
      Alert.alert("Done", "Ujumbe umetumwa kwa list yote uliyochagua.");
      setBroadcastIndex(0);
      setBroadcastOpen(false);
      return;
    }

    const encoded = encodeURIComponent(message);

    if (broadcastChannel === "WHATSAPP") {
      const wa = phoneForWhatsApp(phone);
      await Linking.openURL(`https://wa.me/${wa}?text=${encoded}`);
    } else {
      await Linking.openURL(`sms:${phone}?body=${encoded}`);
    }

    setBroadcastIndex((x) => Math.min(x + 1, broadcastRecipients.length));
  }, [broadcastChannel, broadcastIndex, broadcastMessage, broadcastRecipients]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: UI.bg }} edges={["top"]}>
      <Modal visible={broadcastOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.35)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <CardBox style={{ gap: 12 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
              Broadcast Message
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Recipients: {broadcastRecipients.length} customers
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {(["WHATSAPP", "SMS"] as const).map((ch) => (
                <Pressable
                  key={ch}
                  onPress={() => setBroadcastChannel(ch)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: broadcastChannel === ch ? "rgba(5,150,105,0.35)" : UI.border,
                    backgroundColor: broadcastChannel === ch ? UI.emeraldSoft : UI.soft,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {ch === "WHATSAPP" ? "WhatsApp" : "SMS"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={broadcastMessage}
              onChangeText={setBroadcastMessage}
              placeholder="Andika ujumbe wa kutuma..."
              placeholderTextColor={UI.faint}
              multiline
              style={{
                color: UI.text,
                fontWeight: "800",
                minHeight: 120,
                textAlignVertical: "top",
                borderWidth: 1,
                borderColor: UI.border,
                backgroundColor: UI.soft,
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />

            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Progress: {Math.min(broadcastIndex, broadcastRecipients.length)} /{" "}
              {broadcastRecipients.length}
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setBroadcastOpen(false);
                  setBroadcastIndex(0);
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: UI.border,
                  backgroundColor: UI.soft,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={sendBroadcastNext}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(5,150,105,0.35)",
                  backgroundColor: UI.emeraldSoft,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: UI.emerald, fontWeight: "900" }}>
                  {broadcastIndex === 0 ? "Start" : "Send Next"}
                </Text>
              </Pressable>
            </View>
          </CardBox>
        </View>
      </Modal>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 170,
          gap: 14,
        }}
      >
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
            <WebIcon label="‹" size={30} color={UI.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 28 }}>
              Customers
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
              Store: {activeStoreName}
            </Text>
          </View>
        </View>

        <CardBox style={{ gap: 10 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
            Customer Intelligence
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            View customer profiles, purchase history, total spend, last visit, and contact actions.
          </Text>

          <Pressable
            onPress={exportCustomersPdf}
            style={({ pressed }) => ({
              paddingVertical: 13,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(5,150,105,0.30)",
              backgroundColor: UI.emeraldSoft,
              alignItems: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ color: UI.emerald, fontWeight: "900" }}>Export Customers PDF</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/customers/insights" as any)}
            style={({ pressed }) => ({
              paddingVertical: 13,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(5,150,105,0.30)",
              backgroundColor: UI.emeraldSoft,
              alignItems: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ color: UI.emerald, fontWeight: "900" }}>
              Customer Intelligence Alerts
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setBroadcastIndex(0);
              setBroadcastOpen(true);
            }}
            style={({ pressed }) => ({
              paddingVertical: 13,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(5,150,105,0.30)",
              backgroundColor: UI.emeraldSoft,
              alignItems: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ color: UI.emerald, fontWeight: "900" }}>
              Broadcast to Customers
            </Text>
          </Pressable>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer name or phone..."
            placeholderTextColor={UI.faint}
            style={{
              color: UI.text,
              fontWeight: "800",
              borderWidth: 1,
              borderColor: UI.border,
              backgroundColor: UI.soft,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 11,
            }}
          />
        </CardBox>

        {loading ? (
          <CardBox style={{ alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: UI.muted, fontWeight: "800" }}>Loading customers...</Text>
          </CardBox>
        ) : errorText ? (
          <CardBox>
            <Text style={{ color: UI.danger, fontWeight: "900" }}>{errorText}</Text>
          </CardBox>
        ) : filtered.length === 0 ? (
          <CardBox>
            <Text style={{ color: UI.muted, fontWeight: "900" }}>
              No customers found for this store yet.
            </Text>
          </CardBox>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((c) => {
              const name = clean(c.full_name) || "Customer";
              const phone = clean(c.phone) || clean(c.normalized_phone) || "—";
              const orders = Number(c.total_orders ?? 0);
              const spent = Number(c.total_spent ?? 0);

              return (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    router.push({
                      pathname: "/customers/[id]",
                      params: { id: c.id },
                    } as any)
                  }
                  style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                >
                  <CardBox style={{ gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: 20,
                          overflow: "hidden",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: "rgba(5,150,105,0.25)",
                          backgroundColor: UI.emeraldSoft,
                        }}
                      >
                        {clean(c.avatar_url) ? (
                          <Image
                            source={{ uri: clean(c.avatar_url) }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : (
                          <WebIcon label="👤" size={22} color={UI.emerald} />
                        )}
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        <Text
                          style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}
                          numberOfLines={1}
                        >
                          {phone}
                        </Text>
                      </View>

                      <WebIcon label="›" size={24} color={UI.faint} />
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View
                        style={{
                          flex: 1,
                          padding: 10,
                          borderRadius: 14,
                          backgroundColor: UI.soft,
                          borderWidth: 1,
                          borderColor: UI.border,
                        }}
                      >
                        <Text style={{ color: UI.muted, fontWeight: "900" }}>Orders</Text>
                        <Text style={{ color: UI.text, fontWeight: "900" }}>{orders}</Text>
                      </View>

                      <View
                        style={{
                          flex: 1,
                          padding: 10,
                          borderRadius: 14,
                          backgroundColor: UI.emeraldSoft,
                          borderWidth: 1,
                          borderColor: "rgba(5,150,105,0.18)",
                        }}
                      >
                        <Text style={{ color: UI.muted, fontWeight: "900" }}>Spent</Text>
                        <Text style={{ color: UI.text, fontWeight: "900" }}>{fmt(spent)}</Text>
                      </View>
                    </View>
                  </CardBox>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}