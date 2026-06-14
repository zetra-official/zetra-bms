// app/finance/business-debts.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/src/supabase/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type DebtRow = {
  id: string;
  organization_id: string;
  store_id: string | null;
  store_name: string;
  debt_scope: "STORE" | "ORG";
  lender_name: string;
  lender_phone: string | null;
  debt_type: string;
  principal_amount: number;
  paid_amount: number;
  balance_amount: number;
  purpose: string | null;
  note: string | null;
  debt_date: string;
  due_date: string | null;
  status: string;
  is_overdue: boolean;
  created_at: string;
  supplier_id?: string | null;
};

type SupplierRow = {
  id: string;
  organization_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

type DebtPaymentRow = {
  id: string;
  debt_id: string;
  amount: number;
  note: string | null;
  created_at: string;
};

type SummaryRow = {
  total_debt: number;
  total_paid: number;
  total_balance: number;
  open_count: number;
  partial_count: number;
  paid_count: number;
  overdue_count: number;
  stock_value: number;
  debt_vs_stock_difference: number;
  risk_level: string;
  risk_message: string;
};

const EMPTY_SUMMARY: SummaryRow = {
  total_debt: 0,
  total_paid: 0,
  total_balance: 0,
  open_count: 0,
  partial_count: 0,
  paid_count: 0,
  overdue_count: 0,
  stock_value: 0,
  debt_vs_stock_difference: 0,
  risk_level: "SAFE",
  risk_message: "No data",
};

function Stat({
  label,
  value,
  hint,
  desktop = false,
}: {
  label: string;
  value: string;
  hint?: string;
  desktop?: boolean;
}) {
  return (
    <View
      style={{
        flex: desktop ? undefined : 1,
        width: desktop ? "24%" : undefined,
        minWidth: desktop ? 180 : undefined,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(255,255,255,0.04)",
        borderRadius: 18,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 11 }}>
        {label}
      </Text>

      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {value}
      </Text>

      {!!hint ? (
        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function getDebtTone(item: DebtRow) {
  const status = String(item.status ?? "").toUpperCase();
  if (item.is_overdue) return { label: "OVERDUE", color: UI.danger, bg: "rgba(239,68,68,0.10)" };
  if (status === "PAID") return { label: "PAID", color: UI.success, bg: "rgba(16,185,129,0.10)" };
  if (status === "PARTIAL") return { label: "PARTIAL", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
  return { label: "OPEN", color: "#2563EB", bg: "rgba(37,99,235,0.10)" };
}

function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);

  return d.toLocaleString("en-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dueText(item: DebtRow) {
  if (!item.due_date) return "No due date";

  const today = new Date();
  const due = new Date(item.due_date);

  if (Number.isNaN(due.getTime())) return "Due date invalid";

  const diff = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff < 0) return `Overdue by ${Math.abs(diff)} days`;
  if (diff === 0) return "Due today";

  return `Due in ${diff} days`;
}

export default function BusinessDebtsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isDesktopWeb = Platform.OS === "web" && width >= 900;
  const pageMaxWidth = isDesktopWeb ? 1180 : undefined;
  const pagePaddingX = isDesktopWeb ? 28 : 16;

  const {
    activeOrgId,
    activeStoreId,
    activeRole,
  } = useOrg() as any;

  const orgId = String(activeOrgId ?? "").trim();
  const storeId = String(activeStoreId ?? "").trim();

  const isOwner =
    String(activeRole ?? "").trim().toLowerCase() === "owner";

  const money = useOrgMoneyPrefs(orgId);

  const fmt = useCallback(
    (n: number) =>
      formatMoney(n || 0, {
        currency: money.currency || "TZS",
        locale: money.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [money.currency, money.locale]
  );

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<DebtRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow>(EMPTY_SUMMARY);

  const [error, setError] = useState<string | null>(null);

  const [openAdd, setOpenAdd] = useState(false);
  const [editDebtId, setEditDebtId] = useState<string | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<DebtRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);

  const [lender, setLender] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "PARTIAL" | "OVERDUE" | "PAID">("ALL");
  const [sortMode, setSortMode] = useState<"HIGHEST" | "NEWEST" | "OVERDUE">("HIGHEST");
const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
const [historyDebt, setHistoryDebt] = useState<DebtRow | null>(null);
const [historyLoading, setHistoryLoading] = useState(false);
const [historyRows, setHistoryRows] = useState<DebtPaymentRow[]>([]);

  const load = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    setError(null);

    try {
      const debtsRes = await supabase.rpc("get_business_debts", {
        p_organization_id: orgId,
        p_store_id: storeId || null,
        p_status: null,
      });

      if (debtsRes.error) throw debtsRes.error;

      const summaryRes = await supabase.rpc(
        "get_business_debt_summary",
        {
          p_organization_id: orgId,
          p_store_id: storeId || null,
        }
      );

      if (summaryRes.error) throw summaryRes.error;

      const suppliersRes = await supabase
        .from("suppliers")
        .select("id, organization_id, name, phone, email")
        .eq("organization_id", orgId)
        .order("name", { ascending: true });

      if (suppliersRes.error) throw suppliersRes.error;

      const debtRows = Array.isArray(debtsRes.data)
        ? debtsRes.data
        : [];

      const summaryRow = Array.isArray(summaryRes.data)
        ? summaryRes.data[0]
        : summaryRes.data;

      setRows(debtRows as DebtRow[]);
      setSuppliers((suppliersRes.data ?? []) as SupplierRow[]);
      setSummary(
        (summaryRow as SummaryRow) || EMPTY_SUMMARY
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load debts");
      setRows([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [orgId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const supplierSuggestions = useMemo(() => {
    const q = lender.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 5);

    return suppliers
      .filter((s) =>
        `${s.name ?? ""} ${s.phone ?? ""} ${s.email ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 6);
  }, [lender, suppliers]);

  const resetDebtForm = useCallback(() => {
    setEditDebtId(null);
    setSelectedSupplierId(null);
    setLender("");
    setAmount("");
    setPurpose("");
    setNote("");
    setShowSupplierSuggestions(false);
  }, []);

  const openCreateDebt = useCallback(() => {
    resetDebtForm();
    setOpenAdd(true);
  }, [resetDebtForm]);

  const openEditDebt = useCallback((debt: DebtRow) => {
    setSelectedDebt(null);
    setEditDebtId(debt.id);
    setSelectedSupplierId(debt.supplier_id ?? null);
    setLender(debt.lender_name ?? "");
    setAmount(String(debt.principal_amount ?? ""));
    setPurpose(debt.purpose ?? "");
    setNote(debt.note ?? "");
    setOpenAdd(true);
  }, []);

  const onSaveDebt = useCallback(async () => {
    try {
      if (!lender.trim()) {
        Alert.alert("Required", "Weka jina la mkopeshaji");
        return;
      }

      const amt = Number(amount);

      if (!amt || amt <= 0) {
        Alert.alert("Required", "Weka amount sahihi");
        return;
      }

      if (editDebtId) {
        const { error } = await supabase.rpc("update_business_debt_v1", {
          p_debt_id: editDebtId,
          p_lender_name: lender.trim(),
          p_principal_amount: amt,
          p_purpose: purpose.trim() || null,
          p_note: note.trim() || null,
          p_supplier_id: selectedSupplierId,
        });

        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("create_business_debt", {
          p_organization_id: orgId,
          p_store_id: storeId || null,
          p_lender_name: lender.trim(),
          p_principal_amount: amt,
          p_purpose: purpose.trim() || null,
          p_note: note.trim() || null,
          p_debt_scope: storeId ? "STORE" : "ORG",
        });

        if (error) throw error;

        const createdId =
          typeof data === "string"
            ? data
            : Array.isArray(data)
            ? String(data[0] ?? "")
            : String((data as any)?.id ?? (data as any)?.create_business_debt ?? "");

        if (selectedSupplierId && createdId) {
          const linkRes = await supabase.rpc("update_business_debt_v1", {
            p_debt_id: createdId,
            p_lender_name: lender.trim(),
            p_principal_amount: amt,
            p_purpose: purpose.trim() || null,
            p_note: note.trim() || null,
            p_supplier_id: selectedSupplierId,
          });

          if (linkRes.error) throw linkRes.error;
        }
      }

      setOpenAdd(false);

      resetDebtForm();

      await load();

      Alert.alert("Success", editDebtId ? "Debt updated successfully" : "Debt added successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    }
  }, [
    lender,
    amount,
    purpose,
    note,
    orgId,
    storeId,
    load,
    editDebtId,
    selectedSupplierId,
    resetDebtForm,
  ]);
const onPayDebt = useCallback(async () => {
    try {
      if (!selectedDebt?.id) return;

      const amt = Number(payAmount);
      if (!amt || amt <= 0) {
        Alert.alert("Required", "Weka kiasi sahihi cha kulipa.");
        return;
      }

      const { error } = await supabase.rpc("record_business_debt_payment", {
        p_debt_id: selectedDebt.id,
        p_amount: amt,
        p_note: null,
      });

      if (error) throw error;

      setPayAmount("");
      setSelectedDebt(null);
      await load();

      Alert.alert("Success", "Malipo ya deni yamehifadhiwa.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Imeshindikana kuhifadhi malipo.");
    }
  }, [selectedDebt, payAmount, load]);
  const openDebtHistory = useCallback(async (debt: DebtRow) => {
  setHistoryDebt(debt);
  setHistoryRows([]);
  setHistoryLoading(true);

  try {
    const { data, error } = await supabase
      .from("business_debt_payments")
      .select("id, debt_id, amount, note, created_at")
      .eq("debt_id", debt.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    setHistoryRows((data ?? []) as DebtPaymentRow[]);
  } catch (e: any) {
    Alert.alert("History Error", e?.message ?? "Failed to load debt history");
    setHistoryRows([]);
  } finally {
    setHistoryLoading(false);
  }
}, []);

  const displayRisk = useMemo(() => {
    const balance = Number(summary.total_balance || 0);
    const stock = Number(summary.stock_value || 0);

    if (balance <= 0) {
      return {
        level: "SAFE",
        message: "Hakuna deni active kwa sasa.",
      };
    }

    if (balance > stock) {
      return {
        level: "RISK",
        message: "Tahadhari: deni limezidi stock value ya store/organization hii.",
      };
    }

    if (balance >= stock * 0.7) {
      return {
        level: "WATCH",
        message: "Deni bado liko ndani ya stock value, lakini limekaribia kiwango cha tahadhari.",
      };
    }

    return {
      level: "SAFE",
      message: "Biashara iko salama: stock value ni kubwa kuliko deni lililobaki.",
    };
  }, [summary.total_balance, summary.stock_value]);

  const riskColor = useMemo(() => {
    if (displayRisk.level === "RISK") return UI.danger;
    if (displayRisk.level === "WATCH") return "#F59E0B";
    return UI.success;
  }, [displayRisk.level]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = [...rows];

    if (statusFilter === "OVERDUE") {
      list = list.filter((x) => x.is_overdue);
    } else if (statusFilter !== "ALL") {
      list = list.filter((x) => String(x.status ?? "").toUpperCase() === statusFilter);
    }

    if (q) {
      list = list.filter((x) =>
        `${x.lender_name ?? ""} ${x.store_name ?? ""} ${x.status ?? ""} ${x.purpose ?? ""} ${x.note ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortMode === "NEWEST") {
        return new Date(b.created_at ?? b.debt_date ?? 0).getTime() - new Date(a.created_at ?? a.debt_date ?? 0).getTime();
      }

      if (sortMode === "OVERDUE") {
        return Number(b.is_overdue) - Number(a.is_overdue);
      }

      return Number(b.balance_amount || 0) - Number(a.balance_amount || 0);
    });

    return list;
  }, [rows, search, statusFilter, sortMode]);

  const debtCounts = useMemo(() => {
    return {
      all: rows.length,
      open: rows.filter((x) => String(x.status).toUpperCase() === "OPEN").length,
      partial: rows.filter((x) => String(x.status).toUpperCase() === "PARTIAL").length,
      overdue: rows.filter((x) => x.is_overdue).length,
      paid: rows.filter((x) => String(x.status).toUpperCase() === "PAID").length,
    };
  }, [rows]);

  const groupedRows = useMemo(() => {
    const overdue = visibleRows.filter((x) => x.is_overdue);
    const active = visibleRows.filter((x) => !x.is_overdue && String(x.status).toUpperCase() !== "PAID");
    const paid = visibleRows.filter((x) => String(x.status).toUpperCase() === "PAID");

    return [
      { title: "Overdue / Risk", rows: overdue },
      { title: "Active Debts", rows: active },
      { title: "Paid Debts", rows: paid },
    ].filter((g) => g.rows.length > 0);
  }, [visibleRows]);

  return (
    <Screen
      scroll
      contentStyle={{
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: Math.max(insets.bottom, 18) + 20,
        paddingHorizontal: pagePaddingX,
        width: "100%",
        maxWidth: pageMaxWidth,
        alignSelf: "center",
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={UI.text}
        />
      }
    >
      <Card
        style={{
          borderRadius: 24,
          gap: 14,
          backgroundColor: UI.card,
        }}
      >
        <Text
          style={{
            color: UI.text,
            fontWeight: "900",
            fontSize: 24,
          }}
        >
          Business Debts
        </Text>

        <Text
          style={{
            color: UI.muted,
            fontWeight: "800",
            lineHeight: 22,
          }}
        >
          Fuatilia madeni ya biashara, malipo, na
          uhusiano wa debt dhidi ya stock value.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Stat label="Total Debt" value={fmt(summary.total_debt)} desktop={isDesktopWeb} />
          <Stat label="Balance" value={fmt(summary.total_balance)} desktop={isDesktopWeb} />
          <Stat label="Stock Value" value={fmt(summary.stock_value)} desktop={isDesktopWeb} />
          <Stat label="Difference" value={fmt(summary.debt_vs_stock_difference)} desktop={isDesktopWeb} />
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: riskColor,
            backgroundColor: "rgba(255,255,255,0.04)",
            borderRadius: 18,
            padding: 14,
            gap: 6,
          }}
        >
          <Text
            style={{
              color: riskColor,
              fontWeight: "900",
              fontSize: 13,
            }}
          >
            {displayRisk.level}
          </Text>

          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              lineHeight: 22,
            }}
          >
            {displayRisk.message}
          </Text>
        </View>

        {isOwner ? (
          <Button
            title="Add Debt"
            onPress={openCreateDebt}
          />
        ) : null}
      </Card>

      {!!error ? (
        <Card
          style={{
            marginTop: 14,
            borderColor: "rgba(239,68,68,0.35)",
            backgroundColor: "rgba(239,68,68,0.10)",
          }}
        >
          <Text
            style={{ color: UI.danger, fontWeight: "900" }}
          >
            {error}
          </Text>
        </Card>
      ) : null}

<Card style={{ marginTop: 14, gap: 12, borderRadius: 22 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
          Debt List
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            ["ALL", debtCounts.all],
            ["OPEN", debtCounts.open],
            ["PARTIAL", debtCounts.partial],
            ["OVERDUE", debtCounts.overdue],
            ["PAID", debtCounts.paid],
          ].map(([label, count]) => (
            <View
              key={String(label)}
              style={{
                flexGrow: 1,
                minWidth: isDesktopWeb ? "18%" : "30%",
                borderWidth: 1,
                borderColor: UI.border,
                backgroundColor: UI.background,
                borderRadius: 14,
                padding: 10,
              }}
            >
              <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 10 }}>
                {String(label)}
              </Text>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
                {String(count)}
              </Text>
            </View>
          ))}
        </View>

        <TextInput
          placeholder="Search lender, supplier, store, status..."
          placeholderTextColor={UI.faint}
          value={search}
          onChangeText={setSearch}
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 16,
            paddingHorizontal: 14,
            height: 50,
            color: UI.text,
            fontWeight: "800",
            backgroundColor: UI.background,
          }}
        />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["ALL", "OPEN", "PARTIAL", "OVERDUE", "PAID"] as const).map((x) => (
            <Pressable
              key={x}
              onPress={() => setStatusFilter(x)}
              style={{
                borderWidth: 1,
                borderColor: statusFilter === x ? UI.emeraldBorder : UI.border,
                backgroundColor: statusFilter === x ? UI.emeraldSoft : UI.background,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{x}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["HIGHEST", "Highest"],
            ["NEWEST", "Newest"],
            ["OVERDUE", "Overdue"],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setSortMode(key as any)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: sortMode === key ? UI.emeraldBorder : UI.border,
                backgroundColor: sortMode === key ? UI.emeraldSoft : UI.background,
                borderRadius: 14,
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: UI.muted, fontWeight: "800" }}>
          Showing {visibleRows.length} of {rows.length} debts
        </Text>
      </Card>

      <View style={{ marginTop: 14, gap: 14 }}>
  {groupedRows.map((group) => (
          <View key={group.title} style={{ gap: 10 }}>
            <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, letterSpacing: 0.5 }}>
              {group.title.toUpperCase()}
            </Text>

            <View
              style={{
                flexDirection: isDesktopWeb ? "row" : "column",
                flexWrap: isDesktopWeb ? "wrap" : "nowrap",
                gap: 14,
              }}
            >
            {group.rows.map((item) => {
              const tone = getDebtTone(item);
              const expanded = expandedDebtId === item.id;
              const principal = Math.max(1, toNum(item.principal_amount));
              const paid = toNum(item.paid_amount);
              const progress = Math.max(0, Math.min(100, (paid / principal) * 100));

              return (
                <Pressable
                  key={item.id}
                  onPress={() => setExpandedDebtId(expanded ? null : item.id)}
                  onLongPress={() => setSelectedDebt(item)}
                  style={{ width: isDesktopWeb ? "49%" : "100%" }}
                >
                  <Card
                    style={{
                      borderRadius: 22,
                      gap: 12,
                      borderColor: tone.color,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 5,
                        backgroundColor: tone.color,
                      }}
                    />

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 999,
                          backgroundColor: tone.bg,
                          borderWidth: 1,
                          borderColor: tone.color,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: tone.color, fontWeight: "900" }}>
                          {String(item.lender_name || "?").slice(0, 1).toUpperCase()}
                        </Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }} numberOfLines={1}>
                          {item.lender_name}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }} numberOfLines={1}>
                          {item.store_name || "Organization"} • {dueText(item)}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: tone.color,
                          backgroundColor: tone.bg,
                        }}
                      >
                        <Text style={{ color: tone.color, fontWeight: "900", fontSize: 11 }}>
                          {tone.label}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.06)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderRadius: 16,
                        padding: 12,
                        gap: 8,
                      }}
                    >
                      <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 11 }}>
                        Balance
                      </Text>

                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                        {fmt(item.balance_amount)}
                      </Text>

                      <View
                        style={{
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: "rgba(148,163,184,0.20)",
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            width: `${progress}%`,
                            height: "100%",
                            backgroundColor: tone.color,
                            borderRadius: 999,
                          }}
                        />
                      </View>

                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Paid {progress.toFixed(0)}% • Debt: {fmt(item.principal_amount)} • Paid: {fmt(item.paid_amount)}
                      </Text>
                    </View>

                    {expanded ? (
                      <View style={{ gap: 10 }}>
                        {!!item.purpose ? (
                          <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 20 }}>
                            Purpose: {item.purpose}
                          </Text>
                        ) : null}

                        {!!item.note ? (
                          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                            {item.note}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
  onPress={() => setSelectedDebt(item)}
                            style={{
                              flex: 1,
                              borderRadius: 14,
                              backgroundColor: UI.primary,
                              paddingVertical: 11,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Pay</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => openEditDebt(item)}
                            style={{
                              flex: 1,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: UI.border,
                              paddingVertical: 11,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: UI.text, fontWeight: "900" }}>Edit</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => openDebtHistory(item)}
                            style={{
                              flex: 1,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: UI.emeraldBorder,
                              backgroundColor: UI.emeraldSoft,
                              paddingVertical: 11,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: UI.emerald, fontWeight: "900" }}>History</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 13 }}>
                        Tap to expand • Pay / Edit / History ›
                      </Text>
                    )}

                    <Text
                      style={{
                        color: item.is_overdue ? UI.danger : UI.faint,
                        fontWeight: "800",
                        fontSize: 12,
                      }}
                    >
                      {item.is_overdue ? "OVERDUE" : "ACTIVE"} • {item.debt_date}
                    </Text>
                  </Card>
                </Pressable>
              );
            })}
            </View>
          </View>
        ))}

        {!loading && visibleRows.length === 0 ? (
          <Card
            style={{
              borderRadius: 22,
              alignItems: "center",
              paddingVertical: 32,
            }}
          >
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 16,
              }}
            >
              No Debts
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                marginTop: 8,
              }}
            >
              Hakuna madeni yaliyowekwa bado.
            </Text>
          </Card>
        ) : null}
      </View>
<Modal
        visible={!!selectedDebt}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDebt(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.70)", justifyContent: isDesktopWeb ? "center" : "flex-end" }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: UI.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 14 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                {selectedDebt?.lender_name}
              </Text>

              <Stat label="Total Debt" value={fmt(selectedDebt?.principal_amount ?? 0)} />
              <Stat label="Paid" value={fmt(selectedDebt?.paid_amount ?? 0)} />
              <Stat label="Balance" value={fmt(selectedDebt?.balance_amount ?? 0)} />

              {!!selectedDebt?.purpose && (
                <Text style={{ color: UI.text, fontWeight: "900" }}>
                  Purpose: {selectedDebt.purpose}
                </Text>
              )}

              {!!selectedDebt?.note && (
                <Text style={{ color: UI.muted, fontWeight: "800" }}>
                  {selectedDebt.note}
                </Text>
              )}

              {isOwner && Number(selectedDebt?.balance_amount ?? 0) > 0 ? (
                <>
                  <TextInput
                    placeholder="Kiasi cha kulipa deni"
                    placeholderTextColor={UI.faint}
                    keyboardType="numeric"
                    value={payAmount}
                    onChangeText={setPayAmount}
                    style={{
                      borderWidth: 1,
                      borderColor: UI.border,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      height: 52,
                      color: UI.text,
                      fontWeight: "800",
                      backgroundColor: UI.background,
                    }}
                  />

                  <Button title="Record Payment" onPress={onPayDebt} />
<Button
  title="View History"
  onPress={() => {
    if (selectedDebt) {
      const debt = selectedDebt;
      setSelectedDebt(null);
      void openDebtHistory(debt);
    }
  }}
  variant="secondary"
/>
                  <Button
                    title="Edit Debt"
                    onPress={() => {
                      if (selectedDebt) openEditDebt(selectedDebt);
                    }}
                    variant="secondary"
                  />
                </>
              ) : null}

              <Pressable
                onPress={() => setSelectedDebt(null)}
                style={{
                  height: 52,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: UI.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Close</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={!!historyDebt}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryDebt(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.70)",
            justifyContent: "flex-end",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
          >
            <View
              style={{
               backgroundColor: UI.card,
width: isDesktopWeb ? 760 : "100%",
maxHeight: isDesktopWeb ? "92%" : undefined,
alignSelf: "center",
borderRadius: isDesktopWeb ? 28 : 0,
borderTopLeftRadius: 28,
borderTopRightRadius: 28,
                padding: 18,
                paddingBottom: Math.max(insets.bottom, 12) + 18,
                gap: 14,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
                Debt History
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 14 }}>
                {historyDebt?.lender_name ?? "—"}
              </Text>

              <Card style={{ gap: 10, borderRadius: 18 }}>
                <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 11 }}>
                  DEBT RECORDED
                </Text>

                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  {fmtDateTime(historyDebt?.created_at ?? historyDebt?.debt_date)}
                </Text>

                <Text style={{ color: UI.muted, fontWeight: "800" }}>
                  Original Debt: {fmt(historyDebt?.principal_amount ?? 0)} • Balance:{" "}
                  {fmt(historyDebt?.balance_amount ?? 0)}
                </Text>
              </Card>

              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                Payment Timeline
              </Text>

              {historyLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 18 }}>
                  <ActivityIndicator />
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
                    Loading history...
                  </Text>
                </View>
              ) : historyRows.length === 0 ? (
                <Card style={{ borderRadius: 18 }}>
                  <Text style={{ color: UI.muted, fontWeight: "900" }}>
                    Hakuna malipo yaliyorekodiwa bado.
                  </Text>
                </Card>
              ) : (
                historyRows.map((p, index) => (
                  <View
                    key={p.id}
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        backgroundColor: UI.emeraldSoft,
                        borderWidth: 1,
                        borderColor: UI.emeraldBorder,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
                        {index + 1}
                      </Text>
                    </View>

                    <Card style={{ flex: 1, borderRadius: 18, gap: 6 }}>
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                        {fmt(p.amount)}
                      </Text>

                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        {fmtDateTime(p.created_at)}
                      </Text>

                      {!!p.note ? (
                        <Text style={{ color: UI.faint, fontWeight: "800" }}>
                          {p.note}
                        </Text>
                      ) : null}
                    </Card>
                  </View>
                ))
              )}

              <Pressable
                onPress={() => setHistoryDebt(null)}
                style={{
                  height: 52,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: UI.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Close</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={openAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenAdd(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.70)",
            justifyContent: "flex-end",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: UI.card,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 18,
                paddingBottom: Math.max(insets.bottom, 12) + 18,
                gap: 14,
              }}
            >
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 20,
              }}
            >
              {editDebtId ? "Edit Business Debt" : "Add Business Debt"}
            </Text>

            <TextInput
              placeholder="Lender name"
              placeholderTextColor={UI.faint}
              value={lender}
              onChangeText={(text) => {
                setLender(text);
                setSelectedSupplierId(null);
                setShowSupplierSuggestions(true);
              }}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 16,
                paddingHorizontal: 14,
                height: 52,
                color: UI.text,
                fontWeight: "800",
                backgroundColor: UI.background,
              }}
            />

            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setShowSupplierSuggestions((v) => !v)}
                style={{
                  borderWidth: 1,
                  borderColor: selectedSupplierId ? UI.emeraldBorder : UI.border,
                  backgroundColor: selectedSupplierId ? UI.emeraldSoft : UI.background,
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>
                  Supplier suggestion
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                  {selectedSupplierId
                    ? `Selected: ${lender}`
                    : "Bonyeza hapa kuchagua supplier aliyepo"}
                </Text>
              </Pressable>

              {showSupplierSuggestions ? (
                supplierSuggestions.length > 0 ? (
                  supplierSuggestions.map((s) => {
                    const active = selectedSupplierId === s.id;

                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setSelectedSupplierId(s.id);
                          setLender(s.name);
                          setShowSupplierSuggestions(false);
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? UI.emeraldBorder : UI.border,
                          backgroundColor: active ? UI.emeraldSoft : UI.background,
                          borderRadius: 14,
                          padding: 12,
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900" }}>
                          {s.name}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
                          {s.phone || "No phone"} {s.email ? `• ${s.email}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Hakuna supplier suggestion inayofanana.
                  </Text>
                )
              ) : null}
            </View>

            <TextInput
              placeholder="Amount"
              placeholderTextColor={UI.faint}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 16,
                paddingHorizontal: 14,
                height: 52,
                color: UI.text,
                fontWeight: "800",
                backgroundColor: UI.background,
              }}
            />

            <TextInput
              placeholder="Purpose"
              placeholderTextColor={UI.faint}
              value={purpose}
              onChangeText={setPurpose}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 16,
                paddingHorizontal: 14,
                height: 52,
                color: UI.text,
                fontWeight: "800",
                backgroundColor: UI.background,
              }}
            />

            <TextInput
              placeholder="Note"
              placeholderTextColor={UI.faint}
              value={note}
              onChangeText={setNote}
              multiline
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 14,
                minHeight: 110,
                color: UI.text,
                fontWeight: "800",
                backgroundColor: UI.background,
                textAlignVertical: "top",
              }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setOpenAdd(false)}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: UI.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: UI.text,
                    fontWeight: "900",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={onSaveDebt}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 18,
                  backgroundColor: UI.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "900",
                  }}
                >
                  {editDebtId ? "Update Debt" : "Save Debt"}
                </Text>
              </Pressable>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}