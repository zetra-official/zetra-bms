// app/(tabs)/sales/expenses.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

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

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `TZS ${Math.round(n).toLocaleString()}`;
  }
}

function isoDateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export default function ExpensesScreen() {
  const router = useRouter();
  const { activeOrgName, activeRole, activeStoreId, activeStoreName } = useOrg();

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

  // form
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const paymentMethodLabel = useMemo(() => paymentMethod.trim() || "CASH", [paymentMethod]);

  const ranges = useMemo(() => {
    const now = new Date();
    const tFrom = isoDateOnly(now);
    const tTo = isoDateOnly(now);

    const wFrom = isoDateOnly(startOfWeekMonday(now));
    const wTo = isoDateOnly(now);

    const mFrom = isoDateOnly(startOfMonth(now));
    const mTo = isoDateOnly(now);

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
      const { data, error: e } = await supabase.rpc("get_expense_summary", {
        p_store_id: activeStoreId,
        p_from: from,
        p_to: to,
      });
      if (e) throw e;

      const row = Array.isArray(data) ? data[0] : data;
      return {
        total: Number(row?.total ?? 0),
        count: Number(row?.count ?? 0),
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

    const { data, error: e } = await supabase.rpc("get_expenses", {
      p_store_id: activeStoreId,
      p_from: ranges.month.from,
      p_to: ranges.month.to,
    });
    if (e) throw e;

    setRows((data ?? []) as ExpenseRow[]);
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
      await Promise.all([loadSummary(), loadList()]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load expenses");
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
      const { error: e } = await supabase.rpc("create_expense", {
        p_store_id: activeStoreId,
        p_amount: n,
        p_category: cat,
        p_note: note.trim() || null,
        p_payment_method: paymentMethodLabel,
        p_expense_date: ranges.today.from,
      });
      if (e) throw e;

      setAmount("");
      setCategory("");
      setNote("");
      Keyboard.dismiss();

      await loadAll();
      Alert.alert("Saved", "Expense imeongezwa.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to create expense");
    } finally {
      setLoading(false);
    }
  }, [
    activeStoreId,
    canCreate,
    amount,
    category,
    note,
    paymentMethodLabel,
    ranges.today.from,
    loadAll,
  ]);

  return (
    <Screen scroll bottomPad={220}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
          Expenses
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: theme.colors.card,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
        </Pressable>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Active Store</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeStoreName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Role</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeRole ?? "—"}
        </Text>

        <Button
          title={loading ? "Loading..." : "Refresh"}
          onPress={loadAll}
          disabled={loading}
          variant="secondary"
          style={{ marginTop: 6 }}
        />
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      {/* Summary */}
      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Summary
      </Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Today</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {fmtTZS(today.total)}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Count: <Text style={{ color: theme.colors.text }}>{today.count}</Text>
          </Text>
        </Card>

        <Card style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Week</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            {fmtTZS(week.total)}
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Count: <Text style={{ color: theme.colors.text }}>{week.count}</Text>
          </Text>
        </Card>
      </View>

      <Card style={{ gap: 6 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Month</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {fmtTZS(month.total)}
        </Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Count: <Text style={{ color: theme.colors.text }}>{month.count}</Text>
        </Text>
      </Card>

      {/* Create Expense */}
      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Add Expense
      </Text>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Amount (TZS)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="mf: 12000"
          placeholderTextColor="rgba(255,255,255,0.35)"
          keyboardType="numeric"
          returnKeyType="next"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
          }}
        />

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Category</Text>
        <TextInput
          value={category}
          onChangeText={setCategory}
          placeholder="mf: Rent / Transport / WiFi"
          placeholderTextColor="rgba(255,255,255,0.35)"
          returnKeyType="next"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
          }}
        />

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Payment Method</Text>
        <TextInput
          value={paymentMethod}
          onChangeText={setPaymentMethod}
          placeholder="CASH / M-PESA / CARD"
          placeholderTextColor="rgba(255,255,255,0.35)"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
          }}
        />

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="mf: Office water, electricity..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          multiline
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
            minHeight: 56,
          }}
        />

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

      {/* List */}
      <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
        Recent (This Month) ({rows.length})
      </Text>

      {rows.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>No expenses</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "700", marginTop: 6 }}>
            Anza ku-record matumizi kwa kutumia form hapo juu.
          </Text>
        </Card>
      ) : (
        rows.map((r) => (
          <Card key={r.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                {r.category ?? "Expense"}
              </Text>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.dangerBorder,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.dangerSoft,
                }}
              >
                <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>
                  {fmtTZS(Number(r.amount ?? 0))}
                </Text>
              </View>
            </View>

            {!!r.note && (
              <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
                Note: <Text style={{ color: theme.colors.muted }}>{r.note}</Text>
              </Text>
            )}

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Date: <Text style={{ color: theme.colors.text }}>{r.expense_date}</Text>
              {"   "}•{"   "}
              Pay:{" "}
              <Text style={{ color: theme.colors.text }}>
                {r.payment_method ?? "—"}
              </Text>
            </Text>

            {canManage && (
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                (Owner/Admin) management hooks reserved (next step).
              </Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}