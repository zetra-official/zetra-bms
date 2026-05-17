// app/(tabs)/field-procurement/workspace.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { StoreGuard } from "../../../src/ui/StoreGuard";

import { formatMoney } from "../../../src/ui/money";

const UI = {
  text: "#111827",
  muted: "rgba(75,85,99,0.88)",
  faint: "rgba(107,114,128,0.72)",
  emerald: "#059669",
  warning: "#B45309",
  danger: "#DC2626",
};

type WalletSummaryRow = {
  wallet_id: string;
  organization_id: string;
  store_id: string;
  membership_id: string;
  agent_email: string;
  agent_role: string;
  balance: number;
  total_allocated: number;
  total_purchases: number;
  total_expenses: number;
  total_adjustments: number;
  last_activity_at: string | null;
};

type StaffChoiceRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string;
};

type ActiveCycleRow = {
  cycle_id: string;
  title: string;
  target_amount: number;
  status: string;
  opened_at: string;
  note: string | null;
};
type AgentStockRow = {
  membership_id: string;
  agent_email: string;
  item_name: string;
  unit: string;
  total_quantity: number;
  total_amount: number;
  avg_unit_price: number;
  records_count: number;
};
type CycleSummaryRow = {
  cycle_id: string;
  target_amount: number;
  total_allocated: number;
  total_target_spent: number;
  total_operational_spent: number;
  total_spent: number;
  field_remaining: number;
  agent_wallet_balance: number;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function fmt(n: number) {
  return formatMoney(toNum(n), {
    currency: "TZS",
    locale: "en-TZ",
  }).replace(/\s+/g, " ");
}

function fmtLocal(iso?: string | null) {
  if (!iso) return "No activity";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No activity";
  try {
    return d.toLocaleString();
  } catch {
    return "No activity";
  }
}

const FIELD_UNIT_PRESETS = [
  "gram", "kg", "ton", "piece", "sack",
  "box", "bag", "bundle", "carton", "crate",
  "liter", "ml", "meter", "cm", "yard",
  "dozen", "pair", "roll", "bottle", "bucket",
];

const FIELD_PROCUREMENT_UNIT_KEY = "zetra_field_procurement_default_unit_v1";
const FIELD_PROCUREMENT_PRICE_KEY = "zetra_field_procurement_default_price_v1";

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
        {label}
      </Text>

      <Text
        style={{ color: UI.text, fontWeight: "900", fontSize: 16, lineHeight: 20 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>

      {!!hint && (
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </View>
  );
}

export default function FieldProcurementWorkspaceScreen() {
  const { activeOrgId, activeOrgName, activeStoreName, activeStoreId, activeRole, refresh } =
    useOrg();

  const storeId = clean(activeStoreId);
  const role = clean(activeRole).toLowerCase();
  const canManage = role === "owner" || role === "admin";

  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState<WalletSummaryRow[]>([]);
  const [agentStocks, setAgentStocks] = useState<AgentStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [staffLoading, setStaffLoading] = useState(false);
  const [staffChoices, setStaffChoices] = useState<StaffChoiceRow[]>([]);

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [selectedMembershipId, setSelectedMembershipId] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("");
  const [allocateNote, setAllocateNote] = useState("");
  const [allocating, setAllocating] = useState(false);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseMembershipId, setExpenseMembershipId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseItemName, setExpenseItemName] = useState("");
  const [expenseUnit, setExpenseUnit] = useState("gram");
  const [expenseQuantity, setExpenseQuantity] = useState("");
  const [expenseExpectedUnitPrice, setExpenseExpectedUnitPrice] = useState("");
  const [expenseActualUnitPrice, setExpenseActualUnitPrice] = useState("");
  const [expenseVarianceNote, setExpenseVarianceNote] = useState("");
const [unitPickerOpen, setUnitPickerOpen] = useState(false);
const [pricePresetOpen, setPricePresetOpen] = useState(false);
const [savedUnit, setSavedUnit] = useState("gram");
const [savedPrice, setSavedPrice] = useState("");
  const [expensePurpose, setExpensePurpose] = useState<"TARGET" | "OPERATIONAL">("OPERATIONAL");
  const [expenseCategory, setExpenseCategory] = useState<
    "GOODS_PURCHASE" | "TRANSPORT" | "FOOD" | "COMMUNICATION" | "LODGING" | "OTHER"
  >("TRANSPORT");
  const [savingExpense, setSavingExpense] = useState(false);

 const [cycleLoading, setCycleLoading] = useState(false);
  const [activeCycle, setActiveCycle] = useState<ActiveCycleRow | null>(null);
  const [cycleSummary, setCycleSummary] = useState<CycleSummaryRow | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleTitle, setCycleTitle] = useState("");
  const [cycleTargetAmount, setCycleTargetAmount] = useState("");
  const [cycleNote, setCycleNote] = useState("");
  const [savingCycle, setSavingCycle] = useState(false);

  const loadActiveCycle = useCallback(async () => {
  if (!storeId) {
    setActiveCycle(null);
setCycleSummary(null);
setAgentStocks([]);
return;
  }

  setCycleLoading(true);
  try {
    const { data, error: e } = await supabase.rpc("get_active_field_cycle_v1", {
      p_store_id: storeId,
    });

    if (e) throw e;

    const row = Array.isArray(data) ? data?.[0] : null;

    if (!row?.cycle_id) {
     setActiveCycle(null);
setCycleSummary(null);
setAgentStocks([]);
return;
    }

    const nextCycle: ActiveCycleRow = {
      cycle_id: clean(row?.cycle_id),
      title: clean(row?.title) || "Active Field",
      target_amount: toNum(row?.target_amount),
      status: clean(row?.status) || "OPEN",
      opened_at: clean(row?.opened_at),
      note: clean(row?.note) || null,
    };

    setActiveCycle(nextCycle);

const { data: stockData, error: stockError } = await supabase.rpc(
  "get_field_agent_stock_summary_v1",
  {
    p_store_id: storeId,
    p_cycle_id: nextCycle.cycle_id,
  }
);

if (!stockError) {
  setAgentStocks(
    (Array.isArray(stockData) ? stockData : []).map((s: any) => ({
      membership_id: clean(s?.membership_id),
      agent_email: clean(s?.agent_email) || "—",
      item_name: clean(s?.item_name) || "Unknown Item",
      unit: clean(s?.unit) || "unit",
      total_quantity: toNum(s?.total_quantity),
      total_amount: toNum(s?.total_amount),
      avg_unit_price: toNum(s?.avg_unit_price),
      records_count: Number(s?.records_count ?? 0),
    }))
  );
} else {
  setAgentStocks([]);
}

    const { data: summaryData, error: summaryError } = await supabase.rpc(
      "get_active_field_cycle_summary_v1",
      {
        p_store_id: storeId,
      }
    );

    if (summaryError) throw summaryError;

    const s = Array.isArray(summaryData) ? summaryData?.[0] : null;

    setCycleSummary(
      s
        ? {
            cycle_id: clean(s?.cycle_id) || nextCycle.cycle_id,
            target_amount: toNum(s?.target_amount ?? nextCycle.target_amount),
            total_allocated: toNum(s?.total_allocated),
           total_target_spent: toNum(s?.total_target_spent ?? s?.target_spent),
total_operational_spent: toNum(s?.total_operational_spent ?? s?.operational_spent),

            total_spent: toNum(s?.total_spent),
            field_remaining: toNum(s?.field_remaining),
            agent_wallet_balance: toNum(s?.agent_wallet_balance),
          }
        : {
            cycle_id: nextCycle.cycle_id,
            target_amount: nextCycle.target_amount,
            total_allocated: 0,
            total_target_spent: 0,
            total_operational_spent: 0,
            total_spent: 0,
            field_remaining: nextCycle.target_amount,
            agent_wallet_balance: 0,
          }
    );
 } catch {
  setActiveCycle(null);
  setCycleSummary(null);
  setAgentStocks([]);
} finally {
    setCycleLoading(false);
  }
}, [storeId]);

  const loadWallets = useCallback(async () => {
    if (!storeId) {
      setWallets([]);
      setError("No active Field Procurement store selected.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: e } = await supabase.rpc("get_field_wallet_summary_v1", {
        p_store_id: storeId,
      });

      if (e) throw e;

      const rows = Array.isArray(data) ? data : [];

      setWallets(
        rows.map((r: any) => ({
          wallet_id: clean(r?.wallet_id),
          organization_id: clean(r?.organization_id),
          store_id: clean(r?.store_id),
          membership_id: clean(r?.membership_id),
          agent_email: clean(r?.agent_email) || "—",
          agent_role: clean(r?.agent_role) || "staff",
          balance: toNum(r?.balance),
          total_allocated: toNum(r?.total_allocated),
          total_purchases: toNum(r?.total_purchases),
          total_expenses: toNum(r?.total_expenses),
          total_adjustments: toNum(r?.total_adjustments),
          last_activity_at: clean(r?.last_activity_at) || null,
        }))
      );
    } catch (e: any) {
      setWallets([]);
      setError(clean(e?.message) || "Failed to load Field Procurement wallets.");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useFocusEffect(
    useCallback(() => {
      void loadActiveCycle();
      void loadWallets();

      (async () => {
        try {
          const [unitValue, priceValue] = await Promise.all([
            AsyncStorage.getItem(FIELD_PROCUREMENT_UNIT_KEY),
            AsyncStorage.getItem(FIELD_PROCUREMENT_PRICE_KEY),
          ]);

          const nextUnit = clean(unitValue) || "gram";
          const nextPrice = clean(priceValue);

          setSavedUnit(nextUnit);
          setSavedPrice(nextPrice);
          setExpenseUnit(nextUnit);
          setExpenseActualUnitPrice(nextPrice);
        } catch {
          // keep defaults
        }
      })();
    }, [loadActiveCycle, loadWallets])
  );

  const loadStaffChoices = useCallback(async () => {
    const orgId = clean(activeOrgId);
    if (!orgId) {
      setStaffChoices([]);
      return;
    }

    setStaffLoading(true);
    try {
      const { data, error: e } = await supabase.rpc("get_org_staff_choices", {
        p_org_id: orgId,
      });

      if (e) throw e;

      const rows = Array.isArray(data) ? data : [];

      setStaffChoices(
        rows
          .map((r: any) => ({
            membership_id: clean(r?.membership_id),
            user_id: clean(r?.user_id),
            email: clean(r?.email) || null,
            role: clean(r?.role) || "staff",
          }))
          .filter((r) => r.membership_id)
      );
    } catch (e: any) {
      setStaffChoices([]);
      Alert.alert("Failed", clean(e?.message) || "Failed to load staff choices.");
    } finally {
      setStaffLoading(false);
    }
  }, [activeOrgId]);

  const totals = useMemo(() => {
    return wallets.reduce(
      (acc, w) => {
        acc.balance += toNum(w.balance);
        acc.allocated += toNum(w.total_allocated);
        acc.purchases += toNum(w.total_purchases);
        acc.expenses += toNum(w.total_expenses);
        return acc;
      },
      { balance: 0, allocated: 0, purchases: 0, expenses: 0 }
    );
  }, [wallets]);
const isTargetExpense = expensePurpose === "TARGET";

  const expenseQtyValue = useMemo(
    () => toNum(String(expenseQuantity).replace(/,/g, "").trim()),
    [expenseQuantity]
  );

  const expenseActualUnitPriceValue = useMemo(
    () => toNum(String(expenseActualUnitPrice).replace(/,/g, "").trim()),
    [expenseActualUnitPrice]
  );

  const computedTargetAmount = useMemo(() => {
    if (!isTargetExpense) return 0;
    if (expenseQtyValue <= 0 || expenseActualUnitPriceValue <= 0) return 0;
    return expenseQtyValue * expenseActualUnitPriceValue;
  }, [isTargetExpense, expenseQtyValue, expenseActualUnitPriceValue]);

  const finalExpenseAmount = isTargetExpense
    ? computedTargetAmount
    : toNum(String(expenseAmount).replace(/,/g, "").trim());
  const onRefresh = async () => {
    await Promise.resolve(refresh());
    await loadActiveCycle();
    await loadWallets();
  };

  const openCycleModal = useCallback(() => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    setCycleTitle("");
    setCycleTargetAmount("");
    setCycleNote("");
    setCycleOpen(true);
  }, [canManage]);

  const closeCycleModal = useCallback(() => {
    if (savingCycle) return;
    setCycleOpen(false);
    setCycleTitle("");
    setCycleTargetAmount("");
    setCycleNote("");
  }, [savingCycle]);

  const saveOpenCycle = useCallback(async () => {
    if (!storeId) {
      Alert.alert("Missing Store", "Hakuna active Field Procurement store.");
      return;
    }

    const title = clean(cycleTitle);
    if (!title) {
      Alert.alert("Missing Title", "Weka jina la field/trip.");
      return;
    }

    const targetValue = toNum(String(cycleTargetAmount).replace(/,/g, "").trim());

    setSavingCycle(true);
    try {
      const { error: e } = await supabase.rpc("open_field_cycle_v1", {
        p_store_id: storeId,
        p_title: title,
        p_target_amount: targetValue,
        p_note: clean(cycleNote) || null,
      });

      if (e) throw e;

      await loadActiveCycle();
      await loadWallets();

      Alert.alert("Success ✅", "Field imefunguliwa vizuri.");
      closeCycleModal();
    } catch (e: any) {
      Alert.alert("Open Field failed", clean(e?.message) || "Unknown error");
    } finally {
      setSavingCycle(false);
    }
  }, [storeId, cycleTitle, cycleTargetAmount, cycleNote, loadActiveCycle, loadWallets, closeCycleModal]);

  const closeActiveCycle = useCallback(async () => {
    if (!activeCycle?.cycle_id) {
      Alert.alert("No Active Field", "Hakuna field iliyo wazi.");
      return;
    }

    Alert.alert(
      "Close Field",
      "Una uhakika unataka kufunga field hii? Transactions mpya zitaanza kwenye field mpya.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          style: "destructive",
          onPress: async () => {
            setSavingCycle(true);
            try {
              const { error: e } = await supabase.rpc("close_field_cycle_v1", {
                p_cycle_id: activeCycle.cycle_id,
                p_close_note: "Closed from Field Procurement workspace",
              });

              if (e) throw e;

              await loadActiveCycle();
              await loadWallets();

              Alert.alert("Success ✅", "Field imefungwa vizuri.");
            } catch (e: any) {
              Alert.alert("Close Field failed", clean(e?.message) || "Unknown error");
            } finally {
              setSavingCycle(false);
            }
          },
        },
      ]
    );
  }, [activeCycle?.cycle_id, loadActiveCycle, loadWallets]);

  const openAllocateModal = useCallback(async () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    if (!activeCycle?.cycle_id) {
      Alert.alert("Open Field Required", "Fungua field cycle kwanza kabla ya ku-allocate money.");
      return;
    }

    setSelectedMembershipId("");
    setAllocateAmount("");
    setAllocateNote("");
    setAllocateOpen(true);
    await loadStaffChoices();
  }, [canManage, activeCycle?.cycle_id, loadStaffChoices]);

  const closeAllocateModal = useCallback(() => {
    if (allocating) return;
    setAllocateOpen(false);
    setSelectedMembershipId("");
    setAllocateAmount("");
    setAllocateNote("");
  }, [allocating]);

  const saveAllocation = useCallback(async () => {
    if (!storeId) {
      Alert.alert("Missing Store", "Hakuna active Field Procurement store.");
      return;
    }

    if (!selectedMembershipId) {
      Alert.alert("Missing Agent", "Chagua agent kwanza.");
      return;
    }

    const amountValue = toNum(String(allocateAmount).replace(/,/g, "").trim());

    if (amountValue <= 0) {
      Alert.alert("Invalid Amount", "Weka amount sahihi zaidi ya sifuri.");
      return;
    }

    setAllocating(true);
    try {
      const { error: e } = await supabase.rpc("allocate_field_wallet_v1", {
        p_store_id: storeId,
        p_membership_id: selectedMembershipId,
        p_amount: amountValue,
        p_note: clean(allocateNote) || null,
      });

      if (e) throw e;

      await loadActiveCycle();
      await loadWallets();

      Alert.alert("Success ✅", "Fedha zimewekwa kwenye wallet ya agent.");
      closeAllocateModal();
    } catch (e: any) {
      Alert.alert("Allocation failed", clean(e?.message) || "Unknown error");
    } finally {
      setAllocating(false);
    }
  }, [
    storeId,
    selectedMembershipId,
    allocateAmount,
    allocateNote,
    refresh,
    loadActiveCycle,
    loadWallets,
    closeAllocateModal,
  ]);

  const openExpenseModal = useCallback(async () => {
    if (!activeCycle?.cycle_id) {
      Alert.alert("Open Field Required", "Fungua field cycle kwanza kabla ya kurekodi expense.");
      return;
    }

    setExpenseMembershipId("");
    setExpenseAmount("");
    setExpenseNote("");
    setExpenseItemName("");
    setExpenseUnit(clean(savedUnit) || "gram");
    setExpenseQuantity("");
    setExpenseExpectedUnitPrice("");
    setExpenseActualUnitPrice(clean(savedPrice));
setExpenseVarianceNote("");
setUnitPickerOpen(false);
setPricePresetOpen(false);
setExpensePurpose("TARGET");
    setExpenseCategory("GOODS_PURCHASE");
    setExpenseOpen(true);

    const defaultWallet = wallets.find((w) => clean(w.membership_id)) ?? null;

    if (canManage) {
      if (defaultWallet?.membership_id) {
        setExpenseMembershipId(defaultWallet.membership_id);
      }
      await loadStaffChoices();
    } else {
      if (defaultWallet?.membership_id) {
        setExpenseMembershipId(defaultWallet.membership_id);
      }
    }
  }, [canManage, activeCycle?.cycle_id, loadStaffChoices, wallets, savedUnit, savedPrice]);

  const closeExpenseModal = useCallback(() => {
    if (savingExpense) return;
    setExpenseOpen(false);
    setExpenseMembershipId("");
    setExpenseAmount("");
    setExpenseNote("");
    setExpenseItemName("");
    setExpenseUnit(clean(savedUnit) || "gram");
    setExpenseQuantity("");
    setExpenseExpectedUnitPrice("");
    setExpenseActualUnitPrice(clean(savedPrice));
    setExpenseVarianceNote("");
  }, [savingExpense]);

  const saveExpense = useCallback(async () => {
    if (!storeId) {
      Alert.alert("Missing Store", "Hakuna active Field Procurement store.");
      return;
    }

    if (!expenseMembershipId) {
      Alert.alert("Missing Agent", "Chagua agent/wallet kwanza.");
      return;
    }

    const amountValue = finalExpenseAmount;
    const quantityValue = toNum(String(expenseQuantity).replace(/,/g, "").trim());
    const actualPriceValue = toNum(String(expenseActualUnitPrice).replace(/,/g, "").trim());

    if (expensePurpose === "TARGET") {
      if (!clean(expenseItemName)) {
        Alert.alert("Missing Item", "Weka jina la mzigo/bidhaa kwanza.");
        return;
      }

      if (!clean(expenseUnit)) {
        Alert.alert("Missing Unit", "Chagua kipimo cha mzigo kwanza.");
        return;
      }

      if (quantityValue <= 0) {
        Alert.alert("Invalid Quantity", "Weka quantity sahihi zaidi ya sifuri.");
        return;
      }

      if (actualPriceValue <= 0) {
        Alert.alert("Invalid Price", "Weka bei sahihi kwa kipimo ulichochagua.");
        return;
      }
    }

    if (amountValue <= 0) {
      Alert.alert("Invalid Amount", "Weka amount sahihi zaidi ya sifuri.");
      return;
    }

    setSavingExpense(true);
    try {
      const expectedPriceValue = 0;

      const { error: e } = await supabase.rpc("record_field_expense_v1", {
        p_store_id: storeId,
        p_membership_id: expenseMembershipId,
        p_amount: amountValue,
        p_note: clean(expenseNote) || null,
        p_purpose: expensePurpose,
        p_category: expenseCategory,
        p_item_name: clean(expenseItemName) || null,
        p_unit: clean(expenseUnit) || null,
        p_quantity: quantityValue > 0 ? quantityValue : null,
        p_expected_unit_price: expectedPriceValue > 0 ? expectedPriceValue : null,
        p_actual_unit_price: actualPriceValue > 0 ? actualPriceValue : null,
        p_variance_note: clean(expenseVarianceNote) || null,
      });

      if (e) throw e;

      await loadActiveCycle();
      await loadWallets();

      Alert.alert("Success ✅", "Field expense imehifadhiwa na balance imepungua.");
      closeExpenseModal();
    } catch (e: any) {
      Alert.alert("Expense failed", clean(e?.message) || "Unknown error");
    } finally {
      setSavingExpense(false);
    }
  }, [
    storeId,
    expenseMembershipId,
    finalExpenseAmount,
    expenseNote,
    expensePurpose,
    expenseCategory,
    expenseItemName,
    expenseUnit,
    expenseQuantity,
    expenseActualUnitPrice,
    expenseVarianceNote,
    refresh,
    loadActiveCycle,
    loadWallets,
    closeExpenseModal,
  ]);

  const renderAgentSelector = ({
    selectedId,
    onSelect,
  }: {
    selectedId: string;
    onSelect: (id: string) => void;
  }) => {
    if (staffLoading) {
      return <Text style={{ color: UI.faint, fontWeight: "800" }}>Loading agents...</Text>;
    }

    if (staffChoices.length === 0) {
      return (
        <Card
          style={{
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(248,250,252,0.82)",
            borderRadius: 18,
            padding: 12,
          }}
        >
          <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
            Hakuna staff/agent aliyeonekana. Hakikisha agent ameongezwa na kupewa access ya store hii.
          </Text>
        </Card>
      );
    }

    return (
      <View style={{ gap: 8 }}>
        {staffChoices.map((staff) => {
          const active = selectedId === staff.membership_id;

          return (
            <Pressable
              key={staff.membership_id}
              onPress={() => onSelect(staff.membership_id)}
              style={({ pressed }) => ({
                borderRadius: 16,
                borderWidth: 1,
                borderColor: active ? "rgba(16,185,129,0.34)" : "rgba(255,255,255,0.10)",
                backgroundColor: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                paddingVertical: 12,
                paddingHorizontal: 12,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
                {staff.email ?? "No email"}
              </Text>
              <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}>
                Role: {staff.role}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <Screen
  scroll={false}
  contentStyle={{
    backgroundColor: "#EAF3FB",
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  }}
>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 16,
          paddingBottom: 120,
        }}
      >
        <StoreGuard>
          <Card
            style={{
              gap: 16,
              borderRadius: 24,
             borderColor: "rgba(16,185,129,0.26)",
backgroundColor: "#F7FFFB",
              overflow: "hidden",
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -80,
                right: -60,
                width: 220,
                height: 220,
                borderRadius: 999,
                backgroundColor: "rgba(16,185,129,0.08)",
              }}
            />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.30)",
                  backgroundColor: "rgba(16,185,129,0.12)",
                }}
              >
                <Ionicons name="trail-sign-outline" size={22} color={UI.emerald} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 11, letterSpacing: 0.9 }}>
                  FIELD PROCUREMENT WORKSPACE
                </Text>

                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22, marginTop: 4 }} numberOfLines={1}>
                  {activeStoreName ?? "Field Procurement Store"}
                </Text>
              </View>
            </View>

            <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
              Organization: {activeOrgName ?? "—"}
            </Text>

            <Card
              style={{
                gap: 10,
                borderRadius: 20,
                borderColor: activeCycle ? "rgba(16,185,129,0.24)" : "rgba(245,158,11,0.24)",
                backgroundColor: activeCycle ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
                {cycleLoading ? "Checking Field..." : activeCycle ? activeCycle.title : "No Active Field"}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                {activeCycle
                  ? `Target: ${fmt(activeCycle.target_amount)} • Opened: ${fmtLocal(activeCycle.opened_at)}`
                  : "Fungua field mpya ili allocation na expenses ziingie kwenye cycle sahihi."}
              </Text>

              {!!activeCycle?.note ? (
                <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
                  {activeCycle.note}
                </Text>
              ) : null}

              {canManage ? (
                activeCycle ? (
                  <Pressable
                    onPress={closeActiveCycle}
                    disabled={savingCycle}
                    style={({ pressed }) => ({
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(239,68,68,0.32)",
                      backgroundColor: "rgba(239,68,68,0.12)",
                      paddingVertical: 12,
                      alignItems: "center",
                      opacity: savingCycle ? 0.55 : pressed ? 0.92 : 1,
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {savingCycle ? "Closing..." : "Close Field"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={openCycleModal}
                    disabled={savingCycle}
                    style={({ pressed }) => ({
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.30)",
                      backgroundColor: "rgba(16,185,129,0.12)",
                      paddingVertical: 12,
                      alignItems: "center",
                      opacity: savingCycle ? 0.55 : pressed ? 0.92 : 1,
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Open Field</Text>
                  </Pressable>
                )
              ) : null}
            </Card>

            <Card
              style={{
                gap: 10,
                borderRadius: 20,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(248,250,252,0.82)",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 17 }}>
                Field Wallet Overview
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                Hapa utaona fedha zilizotolewa kwa agents, manunuzi, matumizi, na balance ya kila agent.
              </Text>

    <View style={{ flexDirection: "row", gap: 12 }}>
  <MiniStat
    label="Target Fund"
    value={fmt(cycleSummary?.target_amount ?? activeCycle?.target_amount ?? 0)}
    hint="field budget"
  />
  <MiniStat
    label="Field Remaining"
    value={fmt(cycleSummary?.field_remaining ?? 0)}
    hint="not allocated"
  />
</View>

<View style={{ flexDirection: "row", gap: 12 }}>
  <MiniStat
    label="Allocated"
    value={fmt(cycleSummary?.total_allocated ?? totals.allocated)}
    hint="to agents"
  />
  <MiniStat
    label="Agent Balance"
    value={fmt(cycleSummary?.agent_wallet_balance ?? totals.balance)}
    hint="with agents"
  />
</View>

<View style={{ flexDirection: "row", gap: 12 }}>
  <MiniStat
    label="Target Spent"
    value={fmt(cycleSummary?.total_target_spent ?? 0)}
    hint="main purpose"
  />
  <MiniStat
    label="Operational"
    value={fmt(cycleSummary?.total_operational_spent ?? 0)}
    hint="field costs"
  />
</View>
            </Card>

            {canManage ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={openAllocateModal}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.30)",
                    backgroundColor: "rgba(16,185,129,0.12)",
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    alignItems: "center",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>Allocate Money</Text>
                </Pressable>

                <Pressable
                  onPress={openExpenseModal}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(241,245,249,0.88)",
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    alignItems: "center",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>Record Expense</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={openExpenseModal}
                style={({ pressed }) => ({
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.30)",
                  backgroundColor: "rgba(16,185,129,0.12)",
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  alignItems: "center",
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Record Field Expense</Text>
              </Pressable>
            )}

            <Pressable
              onPress={onRefresh}
              disabled={loading || cycleLoading}
              style={({ pressed }) => ({
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(241,245,249,0.88)",
                paddingVertical: 14,
                paddingHorizontal: 14,
                alignItems: "center",
                opacity: loading || cycleLoading ? 0.55 : pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                {loading || cycleLoading ? "Loading..." : "Refresh"}
              </Text>
            </Pressable>
          </Card>

          <Card
            style={{
              marginTop: 14,
              gap: 14,
              borderRadius: 24,
             borderColor: "rgba(16,185,129,0.24)",
backgroundColor: "#F8FAFF",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
              Agent Wallets
            </Text>

            {!!error ? (
              <Card
                style={{
                  borderColor: "rgba(201,74,74,0.35)",
                  backgroundColor: "rgba(201,74,74,0.10)",
                  borderRadius: 18,
                  padding: 12,
                }}
              >
                <Text style={{ color: UI.danger, fontWeight: "900" }}>{error}</Text>
              </Card>
            ) : null}

            {loading ? (
              <Text style={{ color: UI.faint, fontWeight: "800" }}>Loading wallets...</Text>
            ) : wallets.length === 0 ? (
              <Card
                style={{
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(248,250,252,0.82)",
                  borderRadius: 18,
                  padding: 12,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", lineHeight: 20 }}>
                  Hakuna wallet bado.
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                  Owner/Admin atakapomkabidhi agent fedha, wallet itaonekana hapa.
                </Text>
              </Card>
            ) : (
              wallets.map((w) => (
                <Card
                  key={w.wallet_id}
                  style={{
                    gap: 10,
                    borderRadius: 20,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(248,250,252,0.82)",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }} numberOfLines={1}>
                        {w.agent_email}
                      </Text>
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4 }}>
                        Role: {w.agent_role}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 16 }}>
                        {fmt(w.balance)}
                      </Text>
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4, fontSize: 12 }}>
                        Balance
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <MiniStat label="Allocated" value={fmt(w.total_allocated)} />
                    <MiniStat label="Purchases" value={fmt(w.total_purchases)} />
                    <MiniStat label="Expenses" value={fmt(w.total_expenses)} />
                  </View>

                 <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
  Last activity: {fmtLocal(w.last_activity_at)}
</Text>

{agentStocks.filter((s) => s.membership_id === w.membership_id).length > 0 ? (
  <Card
    style={{
      marginTop: 4,
      gap: 8,
      borderRadius: 18,
      borderColor: "rgba(16,185,129,0.18)",
      backgroundColor: "rgba(16,185,129,0.06)",
      padding: 12,
    }}
  >
    <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 15 }}>
      Mzigo aliokusanya
    </Text>

    {agentStocks
      .filter((s) => s.membership_id === w.membership_id)
      .map((s) => (
        <View key={`${s.membership_id}-${s.item_name}-${s.unit}`}>
          <Text style={{ color: UI.text, fontWeight: "900" }}>
            {s.item_name}
          </Text>
          <Text style={{ color: UI.emerald, fontWeight: "900", marginTop: 3 }}>
            {s.total_quantity} {s.unit}
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 3 }}>
            Cost: {fmt(s.total_amount)} • Avg: {fmt(s.avg_unit_price)} / {s.unit}
          </Text>
        </View>
      ))}
  </Card>
) : null}
                </Card>
              ))
            )}
          </Card>

          <Modal visible={cycleOpen} transparent animationType="fade" onRequestClose={closeCycleModal}>
            <Pressable
              onPress={closeCycleModal}
              style={{
                flex: 1,
                backgroundColor: "rgba(4,8,15,0.94)",
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.24)",
                  backgroundColor: "#11161F",
                  overflow: "hidden",
                  maxHeight: "86%",
                }}
              >
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.10)" }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>Open Field</Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                    Fungua field/trip mpya ili hesabu zianze upya kwa cycle hii.
                  </Text>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 12 }}>
                  <TextInput
                    value={cycleTitle}
                    onChangeText={setCycleTitle}
                    placeholder="mfano: Madini Trip April 24"
                    placeholderTextColor="rgba(234,242,255,0.35)"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  />

                  <TextInput
                    value={cycleTargetAmount}
                    onChangeText={(t) => setCycleTargetAmount(t.replace(/[^0-9.]/g, ""))}
                    placeholder="Target amount mfano: 10000000"
                    placeholderTextColor="rgba(234,242,255,0.35)"
                    keyboardType="numeric"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  />

                  <TextInput
                    value={cycleNote}
                    onChangeText={setCycleNote}
                    placeholder="Note mfano: fedha ya kukusanya mzigo wa wiki hii"
                    placeholderTextColor="rgba(234,242,255,0.35)"
                  multiline
                    style={{
                      minHeight: 84,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                      textAlignVertical: "top",
                    }}
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={closeCycleModal}
                      disabled={savingCycle}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(241,245,249,0.88)",
                        paddingVertical: 14,
                        alignItems: "center",
                        opacity: savingCycle ? 0.55 : pressed ? 0.92 : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      onPress={saveOpenCycle}
                      disabled={savingCycle || !clean(cycleTitle)}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.30)",
                        backgroundColor: "rgba(16,185,129,0.12)",
                        paddingVertical: 14,
                        alignItems: "center",
                        opacity: savingCycle || !clean(cycleTitle) ? 0.55 : pressed ? 0.92 : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {savingCycle ? "Saving..." : "Open"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal visible={allocateOpen} transparent animationType="fade" onRequestClose={closeAllocateModal}>
            <Pressable
              onPress={closeAllocateModal}
              style={{
                flex: 1,
                backgroundColor: "rgba(4,8,15,0.94)",
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.24)",
                  backgroundColor: "#11161F",
                  overflow: "hidden",
                  maxHeight: "86%",
                }}
              >
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.10)" }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>Allocate Money</Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                    Chagua agent na kiasi cha fedha unachomkabidhi kwenye field hii.
                  </Text>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 12 }}>
                  <Text style={{ color: UI.muted, fontWeight: "900" }}>Select Agent</Text>

                  {renderAgentSelector({
                    selectedId: selectedMembershipId,
                    onSelect: setSelectedMembershipId,
                  })}

                  <TextInput
                    value={allocateAmount}
                    onChangeText={(t) => setAllocateAmount(t.replace(/[^0-9.]/g, ""))}
                    placeholder="mfano: 500000"
                    placeholderTextColor="rgba(234,242,255,0.35)"
                    keyboardType="numeric"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  />

                  <TextInput
                    value={allocateNote}
                    onChangeText={setAllocateNote}
                    placeholder="mfano: fedha ya kununua mzigo leo"
                    placeholderTextColor="rgba(234,242,255,0.35)"
                    multiline
                    style={{
                      minHeight: 84,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                      textAlignVertical: "top",
                    }}
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={closeAllocateModal}
                      disabled={allocating}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(241,245,249,0.88)",
                        paddingVertical: 14,
                        alignItems: "center",
                        opacity: allocating ? 0.55 : pressed ? 0.92 : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      onPress={saveAllocation}
                      disabled={allocating || !selectedMembershipId || toNum(allocateAmount) <= 0}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.30)",
                        backgroundColor: "rgba(16,185,129,0.12)",
                        paddingVertical: 14,
                        alignItems: "center",
                        opacity:
                          allocating || !selectedMembershipId || toNum(allocateAmount) <= 0
                            ? 0.55
                            : pressed
                            ? 0.92
                            : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {allocating ? "Saving..." : "Allocate"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal visible={expenseOpen} transparent animationType="fade" onRequestClose={closeExpenseModal}>
            <Pressable
              onPress={closeExpenseModal}
              style={{
                flex: 1,
                backgroundColor: "rgba(4,8,15,0.94)",
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.24)",
                  backgroundColor: "#11161F",
                  overflow: "hidden",
                  maxHeight: "86%",
                }}
              >
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.10)" }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>Record Expense</Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                    Rekodi matumizi ya field. TARGET ni lengo kuu; OPERATIONAL ni matumizi ya kawaida.
                  </Text>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 12 }}>
                  {canManage ? (
                    <>
                      <Text style={{ color: UI.muted, fontWeight: "900" }}>Select Agent</Text>
                      {renderAgentSelector({
                        selectedId: expenseMembershipId,
                        onSelect: setExpenseMembershipId,
                      })}
                    </>
                  ) : null}

                  <Text style={{ color: UI.muted, fontWeight: "900" }}>Purpose</Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => {
                        setExpensePurpose("TARGET");
                        setExpenseCategory("GOODS_PURCHASE");
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor:
                          expensePurpose === "TARGET"
                            ? "rgba(16,185,129,0.34)"
                            : "rgba(255,255,255,0.10)",
                        backgroundColor:
                          expensePurpose === "TARGET"
                            ? "rgba(16,185,129,0.12)"
                            : "rgba(255,255,255,0.05)",
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        opacity: pressed ? 0.92 : 1,
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>Target</Text>
  {expensePurpose === "TARGET" ? (
    <Ionicons name="checkmark-circle" size={18} color={UI.emerald} />
  ) : null}
</View>
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4, fontSize: 11 }}>
                        Lengo kuu
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setExpensePurpose("OPERATIONAL");
                        if (expenseCategory === "GOODS_PURCHASE") setExpenseCategory("TRANSPORT");
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor:
                          expensePurpose === "OPERATIONAL"
                            ? "rgba(16,185,129,0.34)"
                            : "rgba(255,255,255,0.10)",
                        backgroundColor:
                          expensePurpose === "OPERATIONAL"
                            ? "rgba(16,185,129,0.12)"
                            : "rgba(255,255,255,0.05)",
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        opacity: pressed ? 0.92 : 1,
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>Operational</Text>
  {expensePurpose === "OPERATIONAL" ? (
    <Ionicons name="checkmark-circle" size={18} color={UI.emerald} />
  ) : null}
</View>
                      <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 4, fontSize: 11 }}>
                        Nauli/chakula
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={{ color: UI.muted, fontWeight: "900" }}>Category</Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      ["GOODS_PURCHASE", "Goods"],
                      ["TRANSPORT", "Transport"],
                      ["FOOD", "Food"],
                      ["COMMUNICATION", "Phone"],
                      ["LODGING", "Lodging"],
                      ["OTHER", "Other"],
                    ].map(([value, label]) => {
                      const active = expenseCategory === value;

                      return (
                        <Pressable
                          key={value}
                          onPress={() => setExpenseCategory(value as any)}
                          style={({ pressed }) => ({
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active
                              ? "rgba(16,185,129,0.34)"
                              : "rgba(255,255,255,0.10)",
                            backgroundColor: active
                              ? "rgba(16,185,129,0.12)"
                              : "rgba(255,255,255,0.05)",
                            paddingVertical: 9,
                            paddingHorizontal: 12,
                            opacity: pressed ? 0.92 : 1,
                          })}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
{expensePurpose === "TARGET" ? (
                    <>
                      <Text style={{ color: UI.muted, fontWeight: "900" }}>Item / Goods</Text>

                      <TextInput
                        value={expenseItemName}
                        onChangeText={setExpenseItemName}
                        placeholder="mfano: Dhahabu / Mahindi / Korosho"
                        placeholderTextColor="rgba(234,242,255,0.35)"
                        style={{
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.10)",
                          backgroundColor: "rgba(241,245,249,0.88)",
                          color: UI.text,
                          borderRadius: 18,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      />

                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
  <Text style={{ color: UI.muted, fontWeight: "900" }}>Unit</Text>

  <Pressable
    onPress={() => setUnitPickerOpen(true)}
    style={({ pressed }) => ({
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(16,185,129,0.28)",
      backgroundColor: "rgba(16,185,129,0.10)",
      paddingVertical: 8,
      paddingHorizontal: 12,
      opacity: pressed ? 0.9 : 1,
    })}
  >
    <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
      Set Unit
    </Text>
  </Pressable>
</View>

<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {FIELD_UNIT_PRESETS.slice(0, 5).map((u) => {
                          const active = expenseUnit === u;

                          return (
                            <Pressable
                              key={u}
                              onPress={async () => {
                                setExpenseUnit(u);
                                setSavedUnit(u);
                                await AsyncStorage.setItem(FIELD_PROCUREMENT_UNIT_KEY, u);
                              }}
                              style={({ pressed }) => ({
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: active ? "rgba(16,185,129,0.34)" : "rgba(255,255,255,0.10)",
                                backgroundColor: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                                paddingVertical: 9,
                                paddingHorizontal: 12,
                                opacity: pressed ? 0.92 : 1,
                              })}
                            >
                              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                                {u}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <TextInput
                        value={expenseQuantity}
                        onChangeText={(t) => setExpenseQuantity(t.replace(/[^0-9.]/g, ""))}
                        placeholder="Quantity mfano: 5"
                        placeholderTextColor="rgba(234,242,255,0.35)"
                        keyboardType="numeric"
                        style={{
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.10)",
                          backgroundColor: "rgba(241,245,249,0.88)",
                          color: UI.text,
                          borderRadius: 18,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      />

                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
  <Text style={{ color: UI.muted, fontWeight: "900" }}>
    Price / {expenseUnit || "unit"}
  </Text>

  <Pressable
    onPress={() => setPricePresetOpen(true)}
    style={({ pressed }) => ({
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(16,185,129,0.28)",
      backgroundColor: "rgba(16,185,129,0.10)",
      paddingVertical: 8,
      paddingHorizontal: 12,
      opacity: pressed ? 0.9 : 1,
    })}
  >
    <Text style={{ color: UI.emerald, fontWeight: "900", fontSize: 12 }}>
      Set Price
    </Text>
  </Pressable>
</View>

<TextInput
  value={expenseActualUnitPrice}
                        onChangeText={(t) => setExpenseActualUnitPrice(t.replace(/[^0-9.]/g, ""))}
                        placeholder="Actual price per unit mfano: 125000"
                        placeholderTextColor="rgba(234,242,255,0.35)"
                        keyboardType="numeric"
                        style={{
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.10)",
                          backgroundColor: "rgba(241,245,249,0.88)",
                          color: UI.text,
                          borderRadius: 18,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      />

                      <Card
                        style={{
                          borderRadius: 18,
                          borderColor: "rgba(16,185,129,0.22)",
                          backgroundColor: "rgba(16,185,129,0.08)",
                          padding: 12,
                        }}
                      >
                        <Text style={{ color: UI.faint, fontWeight: "900", fontSize: 12 }}>
                          AUTO TOTAL
                        </Text>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
                          {fmt(computedTargetAmount)}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                          {expenseQtyValue || 0} {expenseUnit} × {fmt(expenseActualUnitPriceValue)}
                        </Text>
                      </Card>
                    </>
                  ) : null}
                  {expensePurpose === "OPERATIONAL" ? (
                  <TextInput
                    value={expenseAmount}
                    onChangeText={(t) => setExpenseAmount(t.replace(/[^0-9.]/g, ""))}
                    placeholder="mfano: 20000"
                    placeholderTextColor="rgba(234,242,255,0.35)"
                    keyboardType="numeric"
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  />
) : null}
                  <TextInput
                    value={expenseNote}
                    onChangeText={setExpenseNote}
                    placeholder={
                      expensePurpose === "TARGET"
                        ? "Optional note mfano: bei imebadilika sokoni"
                        : "mfano: nauli / chakula / malipo ya mzigo"
                    }
                    placeholderTextColor="rgba(234,242,255,0.35)"
                    multiline
                    style={{
                      minHeight: 84,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(241,245,249,0.88)",
                      color: UI.text,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontWeight: "800",
                      fontSize: 15,
                      textAlignVertical: "top",
                    }}
                  />

                  <Modal visible={unitPickerOpen} transparent animationType="fade" onRequestClose={() => setUnitPickerOpen(false)}>
                    <Pressable
                      onPress={() => setUnitPickerOpen(false)}
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(4,8,15,0.86)",
                        paddingHorizontal: 18,
                        justifyContent: "center",
                      }}
                    >
                      <Pressable
                        onPress={() => {}}
                        style={{
                          borderRadius: 24,
                          borderWidth: 1,
                          borderColor: "rgba(16,185,129,0.24)",
                          backgroundColor: "#11161F",
                          padding: 14,
                          maxHeight: "76%",
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
                          Set Unit
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                          Chagua kipimo kitakachotumika kwenye mzigo huu.
                        </Text>

                        <ScrollView contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 14 }}>
                          {FIELD_UNIT_PRESETS.map((u) => {
                            const active = expenseUnit === u;

                            return (
                              <Pressable
                                key={u}
                                onPress={async () => {
                                  setExpenseUnit(u);
                                  setSavedUnit(u);
                                  await AsyncStorage.setItem(FIELD_PROCUREMENT_UNIT_KEY, u);
                                  setUnitPickerOpen(false);
                                }}
                                style={({ pressed }) => ({
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: active ? "rgba(16,185,129,0.38)" : "rgba(255,255,255,0.10)",
                                  backgroundColor: active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.05)",
                                  paddingVertical: 10,
                                  paddingHorizontal: 14,
                                  opacity: pressed ? 0.9 : 1,
                                })}
                              >
                                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                                  {u}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  <Modal visible={pricePresetOpen} transparent animationType="fade" onRequestClose={() => setPricePresetOpen(false)}>
                    <Pressable
                      onPress={async () => {
                            const nextPrice = clean(expenseActualUnitPrice);
                            setSavedPrice(nextPrice);
                            await AsyncStorage.setItem(FIELD_PROCUREMENT_PRICE_KEY, nextPrice);
                            setPricePresetOpen(false);
                          }}
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(4,8,15,0.86)",
                        paddingHorizontal: 18,
                        justifyContent: "center",
                      }}
                    >
                      <Pressable
                        onPress={() => {}}
                        style={{
                          borderRadius: 24,
                          borderWidth: 1,
                          borderColor: "rgba(16,185,129,0.24)",
                          backgroundColor: "#11161F",
                          padding: 14,
                          gap: 12,
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}>
                          Set Price / {expenseUnit || "unit"}
                        </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                          Weka bei ya kununulia kwa kipimo ulichochagua. Baada ya hapo ukiandika quantity, total itajihesabu.
                        </Text>

                        <TextInput
                          value={expenseActualUnitPrice}
                          onChangeText={(t) => setExpenseActualUnitPrice(t.replace(/[^0-9.]/g, ""))}
                          placeholder="mfano: 750"
                          placeholderTextColor="rgba(234,242,255,0.35)"
                          keyboardType="numeric"
                          style={{
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.10)",
                            backgroundColor: "rgba(241,245,249,0.88)",
                            color: UI.text,
                            borderRadius: 18,
                            paddingHorizontal: 14,
                            paddingVertical: 14,
                            fontWeight: "800",
                            fontSize: 15,
                          }}
                        />

                        <Pressable
                          onPress={() => setPricePresetOpen(false)}
                          disabled={expenseActualUnitPriceValue <= 0}
                          style={({ pressed }) => ({
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: "rgba(16,185,129,0.30)",
                            backgroundColor: "rgba(16,185,129,0.12)",
                            paddingVertical: 14,
                            alignItems: "center",
                            opacity: expenseActualUnitPriceValue <= 0 ? 0.55 : pressed ? 0.92 : 1,
                          })}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            Use This Price
                          </Text>
                        </Pressable>
                      </Pressable>
                    </Pressable>
                  </Modal>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={closeExpenseModal}
                      disabled={savingExpense}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(241,245,249,0.88)",
                        paddingVertical: 14,
                        alignItems: "center",
                        opacity: savingExpense ? 0.55 : pressed ? 0.92 : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      onPress={saveExpense}
                      disabled={
  savingExpense ||
  !expenseMembershipId ||
  finalExpenseAmount <= 0 ||
  (expensePurpose === "TARGET" &&
    (!clean(expenseItemName) ||
      !clean(expenseUnit) ||
      expenseQtyValue <= 0 ||
      expenseActualUnitPriceValue <= 0))
}
                      style={({ pressed }) => ({
                        flex: 1,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.30)",
                        backgroundColor: "rgba(16,185,129,0.12)",
                        paddingVertical: 14,
                        alignItems: "center",
                        opacity:
                          savingExpense || !expenseMembershipId || finalExpenseAmount <= 0
                            ? 0.55
                            : pressed
                            ? 0.92
                            : 1,
                            
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900" }}>
                        {savingExpense ? "Saving..." : "Save Expense"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </StoreGuard>
      </ScrollView>
    </Screen>
  );
}