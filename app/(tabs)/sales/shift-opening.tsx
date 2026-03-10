import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { useOrgMoneyPrefs } from "@/src/ui/money";

type OpenCashierShiftRow = {
  shift_id: string;
  organization_id: string;
  store_id: string;
  membership_id: string;
  opening_cash: number;
  status: string;
  opened_at: string;
  closed_at?: string | null;
};

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateTimeLocal(input?: string | null) {
  if (!input) return "—";
  try {
    const d = new Date(input);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(input);
  }
}

function normalizeMoneyInput(raw: string) {
  const digitsOnly = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return digitsOnly.replace(/^0+(?=\d)/, "");
}

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isShiftOverdue(openedAt?: string | null) {
  if (!openedAt) return false;
  const opened = new Date(openedAt);
  if (!Number.isFinite(opened.getTime())) return false;
  return opened.getTime() < startOfDayLocal(new Date()).getTime();
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>
      {children}
    </Text>
  );
}

function InputBox(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="rgba(255,255,255,0.35)"
      keyboardType="numeric"
      editable={props.editable}
      style={{
        color: theme.colors.text,
        fontWeight: "800",
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor:
          props.editable === false ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        opacity: props.editable === false ? 0.7 : 1,
      }}
    />
  );
}

export default function ShiftOpeningScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeStoreId, activeStoreName, activeRole } =
    useOrg() as any;

  const money = useOrgMoneyPrefs(activeOrgId);
  const fmtMoney = useCallback((n: number) => money.fmt(Number(n || 0)), [money]);

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [openShift, setOpenShift] = useState<OpenCashierShiftRow | null>(null);
  const [openingCashDraft, setOpeningCashDraft] = useState("0");

  const isCashier = useMemo(
    () => String(activeRole ?? "").trim().toLowerCase() === "cashier",
    [activeRole]
  );

  const overdueShift = useMemo(() => {
    if (!openShift?.shift_id) return null;
    return isShiftOverdue(openShift.opened_at) ? openShift : null;
  }, [openShift]);

  const load = useCallback(
    async (mode: "boot" | "refresh") => {
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setErr(null);

      try {
        if (!isCashier) {
          throw new Error("Shift Opening ni kwa cashier tu.");
        }

        if (!activeStoreId) {
          throw new Error("No active store selected.");
        }

        const { data, error } = await supabase.rpc("get_my_open_cashier_shift_v1", {
          p_store_id: activeStoreId,
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : null;

        if (row?.shift_id) {
          setOpenShift({
            shift_id: String(row.shift_id),
            organization_id: String(row.organization_id ?? ""),
            store_id: String(row.store_id ?? ""),
            membership_id: String(row.membership_id ?? ""),
            opening_cash: toNum(row.opening_cash ?? 0),
            status: String(row.status ?? "OPEN"),
            opened_at: String(row.opened_at ?? ""),
            closed_at: row.closed_at ?? null,
          });
        } else {
          setOpenShift(null);
        }
      } catch (e: any) {
        setOpenShift(null);
        setErr(e?.message ?? "Failed to load shift opening");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeStoreId, isCashier]
  );

  useEffect(() => {
    void load("boot");
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load("refresh");
      return () => {};
    }, [load])
  );

  const startShift = useCallback(async () => {
    if (!isCashier) {
      Alert.alert("Blocked", "Shift Opening ni kwa cashier tu.");
      return;
    }

    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }

    if (isOffline) {
      Alert.alert("Offline", "Fungua shift ukiwa online kwanza.");
      return;
    }

    if (overdueShift?.shift_id) {
      Alert.alert(
        "Overdue Shift",
        "Una shift ya jana bado OPEN. Lazima uende Cashier Closing kwanza kabla ya kufungua shift mpya."
      );
      return;
    }

    if (openShift?.shift_id) {
      Alert.alert("Already Open", "Tayari una shift iliyo wazi kwenye store hii.");
      return;
    }

    const raw = normalizeMoneyInput(openingCashDraft);
    const openingCash = raw ? Number(raw) : 0;

    if (!Number.isFinite(openingCash) || openingCash < 0) {
      Alert.alert("Opening Cash", "Weka opening cash sahihi. Unaweza kuweka 0.");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("open_cashier_shift_v1", {
        p_store_id: activeStoreId,
        p_opening_cash: openingCash,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.shift_id) {
        throw new Error("Shift opened but no shift_id returned.");
      }

      setOpenShift({
        shift_id: String(row.shift_id),
        organization_id: String(row.organization_id ?? ""),
        store_id: String(row.store_id ?? ""),
        membership_id: String(row.membership_id ?? ""),
        opening_cash: toNum(row.opening_cash ?? 0),
        status: String(row.status ?? "OPEN"),
        opened_at: String(row.opened_at ?? ""),
        closed_at: row.closed_at ?? null,
      });

      Alert.alert("Shift Opened ✅", "Cashier shift imefunguliwa vizuri.");
    } catch (e: any) {
      Alert.alert("Shift Opening Failed", e?.message ?? "Failed to open shift");
    } finally {
      setSaving(false);
    }
  }, [activeStoreId, isCashier, isOffline, openShift?.shift_id, openingCashDraft, overdueShift]);

  const goSalesHome = useCallback(() => {
    router.replace("/(tabs)/sales" as any);
  }, [router]);

  const goCashierClosing = useCallback(() => {
    if (!openShift?.shift_id) {
      Alert.alert("Shift Not Open", "Hakuna shift wazi ya cashier kwenye store hii.");
      return;
    }
    router.push("/(tabs)/settings/cashier-closing" as any);
  }, [openShift?.shift_id, router]);

  return (
    <Screen scroll>
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
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              Shift Opening
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} • {activeRole ?? "—"}
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
              {isOffline ? "OFFLINE" : "ONLINE"}
            </Text>
          </View>
        </View>

        {!isCashier && (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>
              Shift Opening ni kwa cashier tu.
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Hii screen imefungwa kwa cashier role pekee.
            </Text>
          </Card>
        )}

        {!!err && (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
          </Card>
        )}

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading shift...
            </Text>
          </View>
        ) : overdueShift ? (
          <Card
            style={{
              gap: 12,
              borderColor: "rgba(245,158,11,0.35)",
              backgroundColor: "rgba(245,158,11,0.08)",
            }}
          >
            <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 18 }}>
              OVERDUE SHIFT
            </Text>

            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Una shift ya siku iliyopita bado OPEN.
            </Text>

            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Status:{" "}
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {String(overdueShift.status ?? "OPEN").toUpperCase()}
                </Text>
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Opened At:{" "}
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtDateTimeLocal(overdueShift.opened_at)}
                </Text>
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Opening Cash:{" "}
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtMoney(overdueShift.opening_cash)}
                </Text>
              </Text>
            </View>

            <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
              Hauwezi kufungua shift mpya mpaka uende Cashier Closing ukafunge shift hii ya zamani.
            </Text>

            <Button title="Go to Cashier Closing" onPress={goCashierClosing} variant="primary" />

            <Button title="Back to Sales" onPress={goSalesHome} variant="secondary" />
          </Card>
        ) : openShift ? (
          <Card style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Active Shift ✅
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Status</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                  {String(openShift.status ?? "OPEN").toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Opening Cash</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                  {fmtMoney(openShift.opening_cash)}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Opened At</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4 }}>
                  {fmtDateTimeLocal(openShift.opened_at)}
                </Text>
              </View>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                borderRadius: 16,
                padding: 12,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Shift hii ndio itatumika kufuatilia cashier huyu mpaka closing.
              </Text>
            </View>

            <Button
              title="Go to Cashier Closing"
              onPress={goCashierClosing}
              variant="primary"
            />

            <Button title="Back to Sales" onPress={goSalesHome} variant="secondary" />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Open New Shift
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Kila cashier lazima afungue shift yake kwanza. Unaweza kuweka opening cash au ukaweka 0
              kama hakuna cash ya kuanzia.
            </Text>

            <View>
              <InputLabel>Opening Cash</InputLabel>
              <InputBox
                value={openingCashDraft}
                onChangeText={(t) => setOpeningCashDraft(normalizeMoneyInput(t))}
                placeholder="mf: 0"
                editable={!saving}
              />
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Opening cash ya sasa: {fmtMoney(toNum(openingCashDraft || 0))}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Hii ni cash ya kuanzia drawer ya cashier. Mauzo ya cashier yataanza kuhesabiwa kwenye shift hii.
              </Text>
            </View>

            <Button
              title={saving ? "Opening Shift..." : "Open Shift"}
              onPress={startShift}
              disabled={saving || !isCashier || isOffline}
              variant="primary"
            />

            <Button
              title={refreshing ? "Refreshing..." : "Refresh"}
              onPress={() => load("refresh")}
              disabled={refreshing}
              variant="secondary"
            />
          </Card>
        )}
      </View>
    </Screen>
  );
}