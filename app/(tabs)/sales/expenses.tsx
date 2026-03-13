// app/(tabs)/sales/expenses.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";
import { useOrgMoneyPrefs } from "../../../src/ui/money";

type ExpenseRow = {
  id: string;
  organization_id: string;
  store_id: string;
  amount: number;
  category: string | null;
  note: string | null;
  payment_method?: string | null;
  expense_date: string; // yyyy-mm-dd
  created_at: string;
  created_by_membership_id?: string;
};

type Summary = {
  total: number;
  count: number;
};

function isoDateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out (${ms}ms)`)), ms);

    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function prettyRpcError(err: any): string {
  const msg = String(err?.message ?? err ?? "").trim();

  if (!msg) return "Something went wrong.";
  if (/not authenticated/i.test(msg)) return "Not authenticated. Tafadhali login tena.";
  if (/no access/i.test(msg) || /owner\/admin/i.test(msg)) {
    return "No access. Hii kazi ni ya Owner/Admin tu.";
  }
  if (/timed out/i.test(msg)) return msg;
  return msg;
}

function sanitizeAmountInput(v: string) {
  const cleaned = String(v ?? "").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function sectionTitle(title: string) {
  return (
    <Text
      style={{
        fontWeight: "900",
        fontSize: 18,
        color: theme.colors.text,
        letterSpacing: 0.2,
      }}
    >
      {title}
    </Text>
  );
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 8 }}>
      {children}
    </Text>
  );
}

function PillChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
        backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.05)",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={15}
          color={active ? theme.colors.emerald : theme.colors.text}
        />
      ) : null}
      <Text
        style={{
          color: active ? theme.colors.text : theme.colors.text,
          fontWeight: "900",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryMiniCard({
  title,
  value,
  count,
  icon,
  accent = "emerald",
}: {
  title: string;
  value: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: "emerald" | "blue" | "violet";
}) {
  const accentMap =
    accent === "blue"
      ? {
          border: "rgba(59,130,246,0.32)",
          bg: "rgba(59,130,246,0.10)",
          icon: "#60A5FA",
        }
      : accent === "violet"
      ? {
          border: "rgba(168,85,247,0.32)",
          bg: "rgba(168,85,247,0.10)",
          icon: "#C084FC",
        }
      : {
          border: theme.colors.emeraldBorder,
          bg: theme.colors.emeraldSoft,
          icon: theme.colors.emerald,
        };

  return (
    <View
      style={{
        flex: 1,
        minHeight: 124,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.035)",
        padding: 14,
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: accentMap.border,
          backgroundColor: accentMap.bg,
        }}
      >
        <Ionicons name={icon} size={18} color={accentMap.icon} />
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 13 }}>
          {title}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 21,
            marginTop: 6,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
          Count: <Text style={{ color: theme.colors.text }}>{count}</Text>
        </Text>
      </View>
    </View>
  );
}

function InputShell({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.045)",
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          marginTop: 1,
        }}
      >
        <Ionicons name={icon} size={16} color={theme.colors.muted} />
      </View>

      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

  const money = useOrgMoneyPrefs(String(activeOrgId || ""));
  const fmt = useCallback((n: number) => money.fmt(n), [money]);

  const canCreate = useMemo(() => !!activeStoreId, [activeStoreId]);
  const canManage = useMemo(() => {
    return (["owner", "admin"] as const).includes((activeRole ?? "staff") as any);
  }, [activeRole]);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [today, setToday] = useState<Summary>({ total: 0, count: 0 });
  const [week, setWeek] = useState<Summary>({ total: 0, count: 0 });
  const [month, setMonth] = useState<Summary>({ total: 0, count: 0 });

  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const liftAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(liftAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, liftAnim]);

  const paymentMethodLabel = useMemo(() => paymentMethod.trim() || "CASH", [paymentMethod]);

  const ranges = useMemo(() => {
    const now = new Date();
    const todayDate = new Date(now);
    todayDate.setHours(0, 0, 0, 0);

    const tomorrow = addDays(todayDate, 1);

    const tFrom = isoDateOnly(todayDate);
    const tTo = isoDateOnly(tomorrow);

    const wFrom = isoDateOnly(startOfWeekMonday(todayDate));
    const wTo = isoDateOnly(tomorrow);

    const mFrom = isoDateOnly(startOfMonth(todayDate));
    const mTo = isoDateOnly(tomorrow);

    return {
      today: { from: tFrom, to: tTo },
      week: { from: wFrom, to: wTo },
      month: { from: mFrom, to: mTo },
    };
  }, []);

  const loadSummary = useCallback(async () => {
    if (!activeStoreId) {
      setToday({ total: 0, count: 0 });
      setWeek({ total: 0, count: 0 });
      setMonth({ total: 0, count: 0 });
      return;
    }

    const call = async (from: string, to: string): Promise<Summary> => {
      const res = await withTimeout(
        supabase.rpc("get_expense_summary", {
          p_store_id: activeStoreId,
          p_from: from,
          p_to: to,
        }),
        12_000,
        "get_expense_summary"
      );

      const data = (res as any)?.data;
      const e = (res as any)?.error;
      if (e) throw e;

      const row = Array.isArray(data) ? data[0] : data;
      return {
        total: Number((row as any)?.total ?? 0),
        count: Number((row as any)?.count ?? 0),
      };
    };

    const [a, b, c] = await Promise.all([
      call(ranges.today.from, ranges.today.to),
      call(ranges.week.from, ranges.week.to),
      call(ranges.month.from, ranges.month.to),
    ]);

    setToday(a);
    setWeek(b);
    setMonth(c);
  }, [activeStoreId, ranges]);

  const loadList = useCallback(async () => {
    if (!activeStoreId) {
      setRows([]);
      return;
    }

    const res = await withTimeout(
      supabase.rpc("get_expenses", {
        p_store_id: activeStoreId,
        p_from: ranges.month.from,
        p_to: ranges.month.to,
      }),
      12_000,
      "get_expenses"
    );

    const data = (res as any)?.data;
    const e = (res as any)?.error;
    if (e) throw e;

    setRows(((data ?? []) as any[]) as ExpenseRow[]);
  }, [activeStoreId, ranges.month.from, ranges.month.to]);

  const loadAll = useCallback(async () => {
    if (!activeStoreId) {
      setRows([]);
      setError("No active store selected.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await loadSummary();

      try {
        await loadList();
      } catch (e: any) {
        setRows([]);
        setError(prettyRpcError(e));
      }
    } catch (err: any) {
      setError(prettyRpcError(err));
      setRows([]);
      setToday({ total: 0, count: 0 });
      setWeek({ total: 0, count: 0 });
      setMonth({ total: 0, count: 0 });
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, loadSummary, loadList]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createExpense = useCallback(async () => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }
    if (!canCreate) return;
    if (loading) return;

    const raw = amount.trim();
    const n = Number(raw);

    if (!raw || Number.isNaN(n) || n <= 0) {
      Alert.alert("Invalid Amount", "Weka kiasi sahihi (namba > 0).");
      return;
    }

    const cat = category.trim();
    if (!cat) {
      Alert.alert("Category Required", "Weka category ya matumizi (mf. Rent, Transport...).");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await withTimeout(
        supabase.rpc("create_expense", {
          p_store_id: activeStoreId,
          p_amount: n,
          p_category: cat,
          p_note: note.trim() || null,
          p_payment_method: paymentMethodLabel,
          p_expense_date: ranges.today.from,
        }),
        12_000,
        "create_expense"
      );

      const e = (res as any)?.error;
      if (e) throw e;

      setAmount("");
      setCategory("");
      setNote("");
      setPaymentMethod("CASH");
      Keyboard.dismiss();

      await loadAll();
      Alert.alert("Saved", "Expense imeongezwa.");
    } catch (err: any) {
      const msg = prettyRpcError(err);
      setError(msg);
      Alert.alert("Failed", msg);
    } finally {
      setLoading(false);
    }
  }, [
    activeStoreId,
    canCreate,
    loading,
    amount,
    category,
    note,
    paymentMethodLabel,
    ranges.today.from,
    loadAll,
  ]);

  const quickCategories = useMemo(
    () => ["Rent", "Transport", "WiFi", "Electricity", "Office", "Fuel"],
    []
  );

  const paymentMethods = useMemo(() => ["CASH", "M-PESA", "BANK", "CARD"], []);

  return (
    <Screen scroll={false} bottomPad={40}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 36 }}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: liftAnim }],
            gap: 14,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 31,
                  fontWeight: "900",
                  color: theme.colors.text,
                  letterSpacing: -0.6,
                }}
              >
                Expenses
              </Text>
              <Text
                style={{
                  color: theme.colors.muted,
                  fontWeight: "800",
                  marginTop: 4,
                }}
              >
                Track store spending with a cleaner premium layout.
              </Text>
            </View>

            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: "rgba(255,255,255,0.05)",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* Top compact overview */}
          <Card
            style={{
              gap: 14,
              padding: 16,
              borderRadius: 24,
              backgroundColor: "rgba(255,255,255,0.035)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "stretch",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 10 }}>
                <View>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                    Organization
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: "900",
                      fontSize: 20,
                      marginTop: 4,
                    }}
                    numberOfLines={1}
                  >
                    {activeOrgName ?? "—"}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 18,
                      backgroundColor: "rgba(255,255,255,0.035)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                      Active Store
                    </Text>
                    <Text
                      style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}
                      numberOfLines={1}
                    >
                      {activeStoreName ?? "—"}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 110,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 18,
                      backgroundColor: "rgba(255,255,255,0.035)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                      Role
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: "900",
                        marginTop: 6,
                        textTransform: "capitalize",
                      }}
                    >
                      {activeRole ?? "—"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  borderRadius: 18,
                  backgroundColor: theme.colors.emeraldSoft,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons name="wallet-outline" size={18} color={theme.colors.emerald} />
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  Ready to record expense
                </Text>
              </View>

              <Pressable
                onPress={() => void loadAll()}
                disabled={loading}
                style={({ pressed }) => ({
                  width: 56,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading ? 0.6 : pressed ? 0.92 : 1,
                })}
              >
                <Ionicons
                  name="refresh"
                  size={20}
                  color={theme.colors.text}
                />
              </Pressable>
            </View>
          </Card>

          {!!error && (
            <Card
              style={{
                borderColor: theme.colors.dangerBorder,
                backgroundColor: theme.colors.dangerSoft,
                padding: 14,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                <Text style={{ color: theme.colors.danger, fontWeight: "900", flex: 1 }}>
                  {error}
                </Text>
              </View>
            </Card>
          )}

          {/* Summary */}
          {sectionTitle("Summary")}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <SummaryMiniCard
              title="Today"
              value={fmt(today.total)}
              count={today.count}
              icon="sunny-outline"
              accent="emerald"
            />
            <SummaryMiniCard
              title="Week"
              value={fmt(week.total)}
              count={week.count}
              icon="calendar-outline"
              accent="blue"
            />
          </View>

          <SummaryMiniCard
            title="This Month"
            value={fmt(month.total)}
            count={month.count}
            icon="stats-chart-outline"
            accent="violet"
          />

          {/* Add Expense */}
          {sectionTitle("Add Expense")}

          <Card
            style={{
              gap: 14,
              padding: 16,
              borderRadius: 24,
              backgroundColor: "rgba(255,255,255,0.035)",
            }}
          >
            <InputShell icon="cash-outline">
              <InputLabel>Amount</InputLabel>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                placeholder="mf: 12000"
                placeholderTextColor="rgba(255,255,255,0.35)"
                keyboardType="numeric"
                returnKeyType="next"
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  fontSize: 16,
                  paddingVertical: 2,
                }}
              />
            </InputShell>

            <InputShell icon="pricetag-outline">
              <InputLabel>Category</InputLabel>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder="mf: Rent / Transport / WiFi"
                placeholderTextColor="rgba(255,255,255,0.35)"
                returnKeyType="next"
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  fontSize: 16,
                  paddingVertical: 2,
                }}
              />
            </InputShell>

            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Quick categories
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {quickCategories.map((x) => (
                  <PillChip
                    key={x}
                    label={x}
                    active={category.trim().toLowerCase() === x.toLowerCase()}
                    onPress={() => setCategory(x)}
                    icon="sparkles-outline"
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Payment method
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {paymentMethods.map((m) => (
                  <PillChip
                    key={m}
                    label={m}
                    active={paymentMethodLabel === m}
                    onPress={() => setPaymentMethod(m)}
                    icon={
                      m === "CASH"
                        ? "wallet-outline"
                        : m === "M-PESA"
                        ? "phone-portrait-outline"
                        : m === "BANK"
                        ? "business-outline"
                        : "card-outline"
                    }
                  />
                ))}
              </View>
            </View>

            <InputShell icon="document-text-outline">
              <InputLabel>Note (optional)</InputLabel>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="mf: Office water, electricity..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                multiline
                style={{
                  color: theme.colors.text,
                  fontWeight: "800",
                  fontSize: 15,
                  minHeight: 64,
                  textAlignVertical: "top",
                  paddingVertical: 2,
                }}
              />
            </InputShell>

            <Button
              title={loading ? "Saving..." : "Save Expense"}
              onPress={createExpense}
              disabled={loading || !canCreate}
              variant="primary"
            />

            {!activeStoreId && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Chagua Active Store kwanza.
              </Text>
            )}
          </Card>

          {/* Recent */}
          {sectionTitle(`Recent (This Month) (${rows.length})`)}

          {rows.length === 0 ? (
            <Card
              style={{
                padding: 18,
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="receipt-outline" size={20} color={theme.colors.muted} />
              </View>

              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                No expenses yet
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "700" }}>
                Anza ku-record matumizi kwa kutumia form hapo juu.
              </Text>
            </Card>
          ) : (
            rows.map((r, idx) => (
              <Animated.View
                key={r.id}
                style={{
                  opacity: fadeAnim,
                  transform: [{ translateY: Animated.multiply(liftAnim, 0.6) }],
                }}
              >
                <Card
                  style={{
                    gap: 12,
                    padding: 16,
                    borderRadius: 22,
                    backgroundColor: "rgba(255,255,255,0.035)",
                    borderColor:
                      idx === 0 ? "rgba(239,68,68,0.24)" : theme.colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "900",
                          fontSize: 17,
                        }}
                        numberOfLines={1}
                      >
                        {r.category ?? "Expense"}
                      </Text>

                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: "rgba(255,255,255,0.04)",
                          }}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 12 }}>
                            {r.payment_method ?? "—"}
                          </Text>
                        </View>

                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: "rgba(255,255,255,0.04)",
                          }}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 12 }}>
                            {r.expense_date}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.dangerBorder,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: theme.colors.dangerSoft,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.danger,
                          fontWeight: "900",
                          fontSize: 15,
                        }}
                      >
                        {fmt(Number(r.amount ?? 0))}
                      </Text>
                    </View>
                  </View>

                  {!!r.note && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 16,
                        backgroundColor: "rgba(255,255,255,0.035)",
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                        NOTE
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "800",
                          marginTop: 6,
                          lineHeight: 20,
                        }}
                      >
                        {r.note}
                      </Text>
                    </View>
                  )}

                  {canManage ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingTop: 2,
                      }}
                    >
                      <Ionicons
                        name="construct-outline"
                        size={14}
                        color={theme.colors.muted}
                      />
                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        Owner/Admin management hooks reserved (next step).
                      </Text>
                    </View>
                  ) : null}
                </Card>
              </Animated.View>
            ))
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}