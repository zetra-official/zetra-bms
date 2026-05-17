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
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";

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
  created_by?: string | null;
  created_by_membership_id?: string | null;
  recorded_by_email?: string | null;
  recorded_by_role?: string | null;
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
    return "Screen hii ni kwa usimamizi wa matumizi ya store. Tafadhali tumia mwonekano wa sales summary.";
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

function normalizeExpensePaymentMethod(value: any): "CASH" | "MOBILE" | "BANK" | "OTHER" {
  const v = String(value ?? "").trim().toUpperCase();

  if (v === "CASH") return "CASH";

  if (
    v === "MOBILE" ||
    v === "MOBILE_MONEY" ||
    v === "M-PESA" ||
    v === "MPESA" ||
    v === "TIGOPESA" ||
    v === "AIRTELMONEY" ||
    v === "HALOPESA"
  ) {
    return "MOBILE";
  }

  if (v === "BANK" || v === "BANK_TRANSFER" || v === "TRANSFER") {
    return "BANK";
  }

  return "OTHER";
}

function paymentMethodIcon(method: string): keyof typeof Ionicons.glyphMap {
  if (method === "CASH") return "wallet-outline";
  if (method === "MOBILE") return "phone-portrait-outline";
  if (method === "BANK") return "business-outline";
  return "help-circle-outline";
}

function sectionTitle(title: string) {
  return (
    <Text
      style={{
        fontWeight: "900",
        fontSize: 15,
        color: theme.colors.text,
        letterSpacing: 0.1,
      }}
    >
      {title}
    </Text>
  );
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: theme.colors.muted,
        fontWeight: "900",
        marginBottom: 4,
        fontSize: 11,
      }}
    >
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
        paddingVertical: 8,
        paddingHorizontal: 12,
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
          size={14}
          color={active ? theme.colors.emerald : theme.colors.text}
        />
      ) : null}
      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 12,
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
        minHeight: 104,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: 12,
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: accentMap.border,
          backgroundColor: accentMap.bg,
        }}
      >
        <Ionicons name={icon} size={16} color={accentMap.icon} />
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
          {title}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 17,
            marginTop: 6,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4, fontSize: 11 }}>
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
        gap: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.035)",
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          marginTop: 1,
        }}
      >
        <Ionicons name={icon} size={14} color={theme.colors.muted} />
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

  const roleLower = String(activeRole ?? "").trim().toLowerCase();
  const isOwnerOrAdmin = roleLower === "owner" || roleLower === "admin";
  const isStaffView = roleLower === "staff";

  const [staffExpenseAllowed, setStaffExpenseAllowed] = useState(false);
  const [staffExpenseLoading, setStaffExpenseLoading] = useState(false);

  const canCreate = useMemo(() => {
    if (!activeStoreId) return false;
    if (isOwnerOrAdmin) return true;
    if (isStaffView && staffExpenseAllowed) return true;
    return false;
  }, [activeStoreId, isOwnerOrAdmin, isStaffView, staffExpenseAllowed]);

  const showSummaryOnly = isStaffView && !staffExpenseAllowed;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [today, setToday] = useState<Summary>({ total: 0, count: 0 });
  const [week, setWeek] = useState<Summary>({ total: 0, count: 0 });
  const [month, setMonth] = useState<Summary>({ total: 0, count: 0 });

  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOBILE" | "BANK">("CASH");

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const isEditing = !!editingExpenseId;

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

  const loadStaffExpensePermission = useCallback(async () => {
    if (!activeStoreId || !isStaffView) {
      setStaffExpenseAllowed(false);
      return;
    }

    setStaffExpenseLoading(true);
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("staff_can_manage_expense")
        .eq("id", activeStoreId)
        .maybeSingle();

      if (error) throw error;
      setStaffExpenseAllowed(!!data?.staff_can_manage_expense);
    } catch {
      try {
        const { data, error } = await supabase
          .from("stores")
          .select("allow_staff_expense")
          .eq("id", activeStoreId)
          .maybeSingle();

        if (error) throw error;
        setStaffExpenseAllowed(!!data?.allow_staff_expense);
      } catch {
        setStaffExpenseAllowed(false);
      }
    } finally {
      setStaffExpenseLoading(false);
    }
  }, [activeStoreId, isStaffView]);

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
        supabase.rpc("get_expense_summary_v2", {
          p_store_id: activeStoreId,
          p_from: from,
          p_to: to,
        }),
        12_000,
        "get_expense_summary_v2"
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
      supabase.rpc("get_expenses_v2", {
        p_store_id: activeStoreId,
        p_from: ranges.month.from,
        p_to: ranges.month.to,
      }),
      12_000,
      "get_expenses_v2"
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
    void loadStaffExpensePermission();
  }, [loadStaffExpensePermission]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

const resetExpenseForm = useCallback(() => {
    setEditingExpenseId(null);
    setAmount("");
    setCategory("");
    setNote("");
    setPaymentMethod("CASH");
    Keyboard.dismiss();
  }, []);

  const startEditExpense = useCallback((r: ExpenseRow) => {
    setEditingExpenseId(r.id);
    setAmount(String(Number(r.amount ?? 0)));
    setCategory(String(r.category ?? "").trim());
    setNote(String(r.note ?? ""));
    const method = normalizeExpensePaymentMethod(r.payment_method);
    setPaymentMethod(method === "OTHER" ? "CASH" : method);
  }, []);

  const saveExpense = useCallback(async () => {
    if (!activeStoreId) {
      Alert.alert("Missing", "No active store selected.");
      return;
    }

    if (!canCreate) {
      Alert.alert(
        "No Access",
        "Huna ruhusa ya kurekodi expense kwenye store hii. Owner awezeshe Staff expense kwenye store husika."
      );
      return;
    }

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
        isEditing
          ? supabase.rpc("update_expense_v2", {
              p_expense_id: editingExpenseId,
              p_amount: n,
              p_category: cat,
              p_note: note.trim() || null,
              p_payment_method: paymentMethodLabel,
            })
          : supabase.rpc("create_expense_v2", {
              p_store_id: activeStoreId,
              p_amount: n,
              p_category: cat,
              p_note: note.trim() || null,
              p_payment_method: paymentMethodLabel,
              p_expense_date: ranges.today.from,
            }),
        12_000,
        isEditing ? "update_expense_v2" : "create_expense_v2"
      );

      const e = (res as any)?.error;
      if (e) throw e;

      resetExpenseForm();

      await loadAll();
      Alert.alert("Saved", isEditing ? "Expense imebadilishwa." : "Expense imeongezwa.");
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
    isEditing,
    editingExpenseId,
    resetExpenseForm,
  ]);

  const deleteExpense = useCallback(
    (r: ExpenseRow) => {
      Alert.alert(
        "Delete Expense",
        "Una uhakika unataka kufuta expense hii?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (loading) return;

              setLoading(true);
              setError(null);

              try {
                const res = await withTimeout(
                  supabase.rpc("delete_expense_v2", {
                    p_expense_id: r.id,
                  }),
                  12_000,
                  "delete_expense_v2"
                );

                const e = (res as any)?.error;
                if (e) throw e;

                if (editingExpenseId === r.id) {
                  resetExpenseForm();
                }

                await loadAll();
                Alert.alert("Deleted", "Expense imefutwa.");
              } catch (err: any) {
                const msg = prettyRpcError(err);
                setError(msg);
                Alert.alert("Failed", msg);
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    },
    [editingExpenseId, loadAll, loading, resetExpenseForm]
  );

  const quickCategories = useMemo(
    () => ["Rent", "Transport", "WiFi", "Electricity", "Office", "Fuel"],
    []
  );

  const paymentMethods = useMemo(() => ["CASH", "MOBILE", "BANK"] as const, []);

  if (showSummaryOnly) {
    return (
      <Screen scroll bottomPad={110}>
        <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: liftAnim }],
              gap: 14,
            }}
          >
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
                    fontSize: 24,
                    fontWeight: "900",
                    color: theme.colors.text,
                    letterSpacing: -0.6,
                  }}
                >
                  Store Spending
                </Text>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    marginTop: 2,
                  }}
                >
                  View ya muhtasari wa matumizi ya store yako.
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

            <Card
              style={{
                gap: 10,
                padding: 12,
                borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              <View>
                <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                  Organization
                </Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 17,
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
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.035)",
                    padding: 10,
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
                    width: 96,
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

              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.emeraldBorder,
                  borderRadius: 14,
                  backgroundColor: theme.colors.emeraldSoft,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons name="eye-outline" size={16} color={theme.colors.emerald} />
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  Hapa unaona muhtasari wa matumizi tu
                </Text>
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

            <Card
              style={{
                padding: 18,
                gap: 8,
                borderRadius: 22,
                backgroundColor: "rgba(255,255,255,0.035)",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Management Only
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 20 }}>
                Kuongeza au kubadilisha expense kunafanywa na owner/admin. Wewe unaendelea kuona
                muhtasari wa matumizi ya store yako kwa urahisi.
              </Text>
            </Card>
          </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen scroll bottomPad={24}>
      <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: liftAnim }],
            gap: 14,
          }}
        >
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
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: "rgba(255,255,255,0.05)",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

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
                <Ionicons name="wallet-outline" size={16} color={theme.colors.emerald} />
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {isStaffView ? "Staff expense enabled for this store" : "Ready to record expense"}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  void loadStaffExpensePermission();
                  void loadAll();
                }}
                disabled={loading}
                style={({ pressed }) => ({
                  width: 46,
                  borderRadius: 14,
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
                  size={18}
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

          

            {sectionTitle("Summary")}

          <View style={{ flexDirection: "row", gap: 8 }}>
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

          {sectionTitle("Add Expense")}

          <Card
            style={{
              gap: 10,
              padding: 12,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.03)",
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
                  fontSize: 14,
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
                    icon={paymentMethodIcon(m)}
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
                  fontSize: 13,
                  minHeight: 52,
                  textAlignVertical: "top",
                  paddingVertical: 2,
                }}
              />
            </InputShell>

            <Pressable
              onPress={saveExpense}
              disabled={loading || staffExpenseLoading || !canCreate}
              style={({ pressed }) => ({
                minHeight: 44,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.emeraldBorder,
                backgroundColor: theme.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 14,
                opacity: loading || staffExpenseLoading || !canCreate ? 0.5 : pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
                {loading
                  ? "Saving..."
                  : staffExpenseLoading
                  ? "Checking..."
                  : isEditing
                  ? "Update Expense"
                  : "Save Expense"}
              </Text>
            </Pressable>

            {isEditing && (
              <Pressable
                onPress={resetExpenseForm}
                disabled={loading}
                style={({ pressed }) => ({
                  minHeight: 42,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  opacity: loading ? 0.5 : pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
                  Cancel Edit
                </Text>
              </Pressable>
            )}

            {!activeStoreId && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Chagua Active Store kwanza.
              </Text>
            )}
          </Card>

          {sectionTitle(`Recent (This Month) (${rows.length})`)}

          {rows.length === 0 ? (
            <Card
              style={{
                padding: 12,
                gap: 6,
                alignItems: "flex-start",
                borderRadius: 18,
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
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="receipt-outline" size={16} color={theme.colors.muted} />
              </View>

              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
                No expenses yet
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "700" }}>
                Anza ku-record matumizi kwa kutumia form hapo juu.
              </Text>
            </Card>
          ) : (
            rows.map((r, idx) => {
              const method = normalizeExpensePaymentMethod(r.payment_method);

              return (
                <Animated.View
                  key={r.id}
                  style={{
                    opacity: fadeAnim,
                    transform: [{ translateY: Animated.multiply(liftAnim, 0.6) }],
                  }}
                >
                  <Card
                    style={{
                      gap: 8,
                      padding: 12,
                      borderRadius: 16,
                      backgroundColor: "rgba(255,255,255,0.03)",
                      borderColor:
                        idx === 0 ? "rgba(239,68,68,0.20)" : theme.colors.border,
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
                            fontSize: 14,
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
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: "rgba(255,255,255,0.04)",
                            }}
                          >
                            <Ionicons
                              name={paymentMethodIcon(method)}
                              size={12}
                              color={theme.colors.muted}
                            />
                            <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 11 }}>
                              {method === "OTHER" ? "—" : method}
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
                            <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 11 }}>
                              {r.expense_date}
                            </Text>
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: theme.colors.emeraldBorder,
                              backgroundColor: theme.colors.emeraldSoft,
                            }}
                          >
                            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 11 }}>
                              By: {r.recorded_by_email || r.recorded_by_role || "User"}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: theme.colors.dangerBorder,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: theme.colors.dangerSoft,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.colors.danger,
                            fontWeight: "900",
                            fontSize: 13,
                          }}
                        >
                          {fmt(Number(r.amount ?? 0))}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => startEditExpense(r)}
                        disabled={loading}
                        style={({ pressed }) => ({
                          flex: 1,
                          minHeight: 38,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.emeraldBorder,
                          backgroundColor: theme.colors.emeraldSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: loading ? 0.5 : pressed ? 0.92 : 1,
                        })}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                          Edit
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => deleteExpense(r)}
                        disabled={loading}
                        style={({ pressed }) => ({
                          flex: 1,
                          minHeight: 38,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.dangerBorder,
                          backgroundColor: theme.colors.dangerSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: loading ? 0.5 : pressed ? 0.92 : 1,
                        })}
                      >
                        <Text style={{ color: theme.colors.danger, fontWeight: "900", fontSize: 12 }}>
                          Delete
                        </Text>
                      </Pressable>
                    </View>

                    {!!r.note && (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: 12,
                          backgroundColor: "rgba(255,255,255,0.03)",
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 11 }}>
                          NOTE
                        </Text>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontWeight: "800",
                            marginTop: 4,
                            lineHeight: 18,
                            fontSize: 12,
                          }}
                        >
                          {r.note}
                        </Text>
                      </View>
                    )}
                  </Card>
                </Animated.View>
              );
            })
          )}
        </Animated.View>
    </Screen>
  );
}