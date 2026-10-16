import {useCommonText} from "@/src/i18n/useCommonText";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { StoreGuard } from "../../../src/ui/StoreGuard";
import { formatMoney } from "../../../src/ui/money";

type Purpose = "TARGET" | "OPERATIONAL";
type FilterKey = "TODAY" | "OPEN" | "CLOSED" | "ALL";

type CycleRow = {
  _uiMissingTitle?: boolean;
  cycle_id: string;
  title: string;
  status: string;
  target_amount: number;
  total_allocated: number;
  total_target_spent: number;
  total_operational_spent: number;
  total_spent: number;
  field_remaining: number;
  agent_wallet_balance: number;
  opened_at: string;
  closed_at: string | null;
  note: string | null;
};

type TxnRow = {
  id: string;
  field_cycle_id: string | null;
  type: string;
  amount: number;
  purpose: Purpose;
  category: string;
  note: string | null;
  agent_email: string;
  created_at: string;
  item_name: string | null;
  unit: string | null;
  quantity: number;
  actual_unit_price: number;
};

type StockRow = {
  item_name: string;
  unit: string;
  total_quantity: number;
  total_amount: number;
  avg_unit_price: number;
  records_count: number;
};

const FP = {
  bg: "#EEF4F8",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#475569",
  faint: "#64748B",
  emerald: "#059669",
  warning: "#D97706",
  danger: "#DC2626",
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clean(v: any) {
  return String(v ?? "").trim();
}

function normalizePurpose(v: any): Purpose {
  return clean(v).toUpperCase() === "TARGET" ? "TARGET" : "OPERATIONAL";
}

function fmt(n: number) {
  return formatMoney(toNum(n), { currency: "TZS", locale: "en-TZ" }).replace(/\s+/g, " ");
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function isSameLocalDay(a?: string | null, b = new Date()) {
  if (!a) return false;
  const d = new Date(a);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}

function StatBox({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: FP.faint, fontWeight: "900", fontSize: 10 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: FP.text, fontWeight: "900", fontSize: 17, marginTop: 5 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {value}
      </Text>
      <Text style={{ color: FP.muted, fontWeight: "800", fontSize: 11, marginTop: 3 }} numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
}

function TxnCard({ r }: { r: TxnRow }) {
 const uiText = useCommonText();
  const type = clean(r.type).toUpperCase();
  const isAllocate = type === "ALLOCATE";
  const isTarget = r.purpose === "TARGET";

  return (
    <Card
      style={{
        marginTop: 10,
        borderRadius: 20,
        borderColor: isAllocate
          ? "rgba(59,130,246,0.24)"
          : isTarget
          ? "rgba(16,185,129,0.22)"
          : "rgba(245,158,11,0.22)",
        backgroundColor: "rgba(255,255,255,0.04)",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: FP.text, fontWeight: "900", fontSize: 16 }}>{fmt(r.amount)}</Text>
          <Text style={{ color: FP.faint, marginTop: 6, fontWeight: "800" }}>
            {r.category || uiText("GENERAL")}
          </Text>
        </View>

        <Text style={{ color: isAllocate ? FP.text : isTarget ? FP.emerald : FP.warning, fontWeight: "900" }}>
          {isAllocate ? uiText("ALLOCATE") : isTarget ? uiText("TARGET") : uiText("OPERATIONAL")}
        </Text>
      </View>

      <Text style={{ color: FP.faint, marginTop: 8, fontWeight: "800" }}>
        {uiText("Agent:")}{r.agent_email || "—"}
      </Text>

      {!!r.item_name && (
        <Text style={{ color: FP.text, marginTop: 8, fontWeight: "900", lineHeight: 20 }}>
          {uiText("Item:")}{r.item_name}
          {r.quantity > 0 && r.unit ? ` • ${r.quantity} ${r.unit}` : ""}
          {r.actual_unit_price > 0 ? ` • ${fmt(r.actual_unit_price)} / ${r.unit || "unit"}` : ""}
        </Text>
      )}

      {!!r.note && (
        <Text style={{ color: FP.text, marginTop: 8, fontWeight: "800", lineHeight: 20 }}>
          {r.note}
        </Text>
      )}

      <Text style={{ color: FP.faint, marginTop: 8, fontSize: 12, fontWeight: "800" }}>
        {fmtDate(r.created_at)}
      </Text>
    </Card>
  );
}

export default function FieldHistoryScreen() {
 const uiText = useCommonText();
  const { activeStoreId } = useOrg();

  const [loading, setLoading] = useState(false);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [reportOpen, setReportOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("TODAY");
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    const storeId = clean(activeStoreId);
    if (!storeId) return;

    setLoading(true);
    setErrorText(null);

    try {
      const { data: cycleData, error: cycleError } = await supabase.rpc("get_field_cycles_history_v1", {
        p_store_id: storeId,
      });

      if (cycleError) throw cycleError;

      const nextCycles: CycleRow[] = (Array.isArray(cycleData) ? cycleData : [])
        .map((c: any) => ({
          cycle_id: clean(c?.cycle_id ?? c?.id),
          title: clean(c?.title) || "Field Cycle",
          _uiMissingTitle: !clean(c?.title),
          status: clean(c?.status) || "OPEN",
          target_amount: toNum(c?.target_amount),
          total_allocated: toNum(c?.total_allocated),
          total_target_spent: toNum(c?.total_target_spent ?? c?.target_spent),
          total_operational_spent: toNum(c?.total_operational_spent ?? c?.operational_spent),
          total_spent: toNum(c?.total_spent),
          field_remaining: toNum(c?.field_remaining),
          agent_wallet_balance: toNum(c?.agent_wallet_balance),
          opened_at: clean(c?.opened_at),
          closed_at: clean(c?.closed_at) || null,
          note: clean(c?.note) || null,
        }))
        .filter((c) => c.cycle_id);

      setCycles(nextCycles);

      const { data: txnData, error: txnError } = await supabase.rpc("get_field_wallet_history_v1", {
        p_store_id: storeId,
      });

      if (txnError) {
        setErrorText(clean(txnError.message) || "Transactions failed to load.");
        setRows([]);
      } else {
        setRows(
          (Array.isArray(txnData) ? txnData : []).map((r: any) => ({
            id: clean(r?.id),
            field_cycle_id: clean(r?.field_cycle_id ?? r?.cycle_id) || null,
            type: clean(r?.type).toUpperCase(),
            amount: toNum(r?.amount),
            purpose: normalizePurpose(r?.purpose),
            category: clean(r?.category) || "GENERAL",
            note: clean(r?.note) || null,
            agent_email: clean(r?.agent_email),
            created_at: clean(r?.created_at),
            item_name: clean(r?.item_name) || null,
            unit: clean(r?.unit) || null,
            quantity: toNum(r?.quantity),
            actual_unit_price: toNum(r?.actual_unit_price),
          }))
        );
      }

      setSelectedCycleId((prev) => {
        if (prev && nextCycles.some((c) => c.cycle_id === prev)) return prev;
        return nextCycles[0]?.cycle_id ?? "";
      });
    } catch (e: any) {
      setCycles([]);
      setRows([]);
      setSelectedCycleId("");
      setErrorText(clean(e?.message) || "Failed to load field history.");
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const displayedCycles = useMemo(() => {
    return cycles.filter((c) => {
      const status = clean(c.status).toUpperCase();
      if (filter === "OPEN") return status === "OPEN";
      if (filter === "CLOSED") return status !== "OPEN";
      if (filter === "TODAY") return isSameLocalDay(c.opened_at) || isSameLocalDay(c.closed_at);
      return true;
    });
  }, [cycles, filter]);

  const selectedCycle = useMemo(
    () => cycles.find((c) => c.cycle_id === selectedCycleId) ?? null,
    [cycles, selectedCycleId]
  );

  const cycleRows = useMemo(() => {
    if (!selectedCycleId) return [];
    return rows.filter((r) => r.field_cycle_id === selectedCycleId);
  }, [rows, selectedCycleId]);

  const allocationRows = useMemo(
    () => cycleRows.filter((r) => clean(r.type).toUpperCase() === "ALLOCATE"),
    [cycleRows]
  );

  const targetRows = useMemo(
    () => cycleRows.filter((r) => clean(r.type).toUpperCase() === "EXPENSE" && r.purpose === "TARGET"),
    [cycleRows]
  );

  const operationalRows = useMemo(
    () => cycleRows.filter((r) => clean(r.type).toUpperCase() === "EXPENSE" && r.purpose === "OPERATIONAL"),
    [cycleRows]
  );

  const cycleStockRows = useMemo(() => {
    const map = new Map<string, StockRow>();

    targetRows.forEach((r) => {
      if (!r.item_name || !r.unit || r.quantity <= 0) return;

      const key = `${r.item_name.toUpperCase()}__${r.unit.toUpperCase()}`;
      const prev = map.get(key);

      const totalQuantity = (prev?.total_quantity ?? 0) + r.quantity;
      const totalAmount = (prev?.total_amount ?? 0) + r.amount;
      const recordsCount = (prev?.records_count ?? 0) + 1;

      map.set(key, {
        item_name: r.item_name,
        unit: r.unit,
        total_quantity: totalQuantity,
        total_amount: totalAmount,
        avg_unit_price: totalQuantity > 0 ? totalAmount / totalQuantity : 0,
        records_count: recordsCount,
      });
    });

    return Array.from(map.values());
  }, [targetRows]);

  const totalTarget = selectedCycle?.total_target_spent ?? 0;
  const totalOperational = selectedCycle?.total_operational_spent ?? 0;
  const totalSpent = selectedCycle?.total_spent ?? totalTarget + totalOperational;

  const openReport = (cycleId: string) => {
    setSelectedCycleId(cycleId);
    setReportOpen(true);
  };

  const ReportBody = () => {
    if (!selectedCycle) return null;

    return (
      <>
        <Card
          style={{
            borderRadius: 28,
            borderColor: "rgba(16,185,129,0.24)",
            backgroundColor: "rgba(15,18,24,0.98)",
            gap: 14,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: FP.text, fontWeight: "900", fontSize: 24 }} numberOfLines={2}>
                {selectedCycle._uiMissingTitle ? uiText("Field Cycle") : selectedCycle.title}
              </Text>
              <Text style={{ color: FP.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
                {uiText("Opened:")}{fmtDate(selectedCycle.opened_at)}
                {selectedCycle.closed_at ? uiText("\nClosed: {p0}", {p0: (fmtDate(selectedCycle.closed_at))}) : uiText("\nActive now")}
              </Text>
            </View>

            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor:
                  clean(selectedCycle.status).toUpperCase() === "OPEN"
                    ? "rgba(16,185,129,0.34)"
                    : "rgba(255,255,255,0.14)",
                backgroundColor:
                  clean(selectedCycle.status).toUpperCase() === "OPEN"
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(255,255,255,0.06)",
                paddingVertical: 8,
                paddingHorizontal: 12,
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{
                  color: clean(selectedCycle.status).toUpperCase() === "OPEN" ? FP.emerald : FP.faint,
                  fontWeight: "900",
                  fontSize: 12,
                }}
              >
                {clean(selectedCycle.status).toUpperCase() === "OPEN" ? uiText("ACTIVE") : uiText("CLOSED")}
              </Text>
            </View>
          </View>

          {!!selectedCycle.note && (
            <Text style={{ color: FP.faint, fontWeight: "800", lineHeight: 20 }}>
              {selectedCycle.note}
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatBox label={uiText("TARGET FUND")} value={fmt(selectedCycle.target_amount)} hint={uiText("field budget")} />
            <StatBox label={uiText("REMAINING")} value={fmt(selectedCycle.field_remaining)} hint={uiText("not allocated")} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatBox label={uiText("ALLOCATED")} value={fmt(selectedCycle.total_allocated)} hint={uiText("to agents")} />
            <StatBox label={uiText("AGENT BALANCE")} value={fmt(selectedCycle.agent_wallet_balance)} hint={uiText("with agents")} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatBox label={uiText("TARGET USED")} value={fmt(totalTarget)} hint={uiText("main purpose")} />
            <StatBox label={uiText("OPERATIONAL")} value={fmt(totalOperational)} hint={uiText("field costs")} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatBox label={uiText("TOTAL SPENT")} value={fmt(totalSpent)} hint={uiText("all spending")} />
            <StatBox label={uiText("RECORDS")} value={String(cycleRows.length)} hint={uiText("cycle items")} />
          </View>
        </Card>

        <Card style={{ marginTop: 16, borderRadius: 24, borderColor: "rgba(16,185,129,0.22)", backgroundColor: "rgba(16,185,129,0.06)" }}>
          <Text style={{ color: FP.emerald, fontWeight: "900", fontSize: 19 }}>
            {uiText("Field Stock / Mzigo Uliokusanywa")}</Text>
          <Text style={{ color: FP.muted, marginTop: 6, fontWeight: "800", lineHeight: 20 }}>
            {uiText("Mzigo wa cycle hii pekee.")}</Text>

          {cycleStockRows.length === 0 ? (
            <Text style={{ color: FP.faint, marginTop: 12, fontWeight: "800" }}>
              {uiText("Hakuna mzigo uliorekodiwa kwenye field hii.")}</Text>
          ) : (
            cycleStockRows.map((s) => (
              <Card
                key={`${s.item_name}-${s.unit}`}
                style={{
                  marginTop: 10,
                  borderRadius: 18,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                }}
              >
                <Text style={{ color: FP.text, fontWeight: "900", fontSize: 16 }}>{s.item_name}</Text>
                <Text style={{ color: FP.emerald, fontWeight: "900", marginTop: 6 }}>
                  {s.total_quantity} {s.unit}
                </Text>
                <Text style={{ color: FP.muted, fontWeight: "800", marginTop: 6 }}>
                  {uiText("Cost:")}{fmt(s.total_amount)} {uiText("• Avg:")}{fmt(s.avg_unit_price)} / {s.unit}
                </Text>
              </Card>
            ))
          )}
        </Card>

        <Card style={{ marginTop: 16, borderRadius: 24, borderColor: "rgba(59,130,246,0.22)", backgroundColor: "rgba(59,130,246,0.06)" }}>
          <Text style={{ color: FP.text, fontWeight: "900", fontSize: 19 }}>
            {uiText("Money Given to Agents —")}{fmt(selectedCycle.total_allocated)}
          </Text>
          {allocationRows.length === 0 ? (
            <Text style={{ color: FP.faint, marginTop: 12, fontWeight: "800" }}>{uiText("Hakuna allocation.")}</Text>
          ) : (
            allocationRows.map((r) => <TxnCard key={r.id} r={r} />)
          )}
        </Card>

        <Card style={{ marginTop: 16, borderRadius: 24, borderColor: "rgba(16,185,129,0.22)", backgroundColor: "rgba(16,185,129,0.06)" }}>
          <Text style={{ color: FP.emerald, fontWeight: "900", fontSize: 19 }}>
            {uiText("Target Spending —")}{fmt(totalTarget)}
          </Text>
          {targetRows.length === 0 ? (
            <Text style={{ color: FP.faint, marginTop: 12, fontWeight: "800" }}>{uiText("Hakuna target spending.")}</Text>
          ) : (
            targetRows.map((r) => <TxnCard key={r.id} r={r} />)
          )}
        </Card>

        <Card style={{ marginTop: 16, borderRadius: 24, borderColor: "rgba(245,158,11,0.22)", backgroundColor: "rgba(245,158,11,0.06)" }}>
          <Text style={{ color: FP.warning, fontWeight: "900", fontSize: 19 }}>
            {uiText("Operational Spending —")}{fmt(totalOperational)}
          </Text>
          {operationalRows.length === 0 ? (
            <Text style={{ color: FP.faint, marginTop: 12, fontWeight: "800" }}>{uiText("Hakuna operational spending.")}</Text>
          ) : (
            operationalRows.map((r) => <TxnCard key={r.id} r={r} />)
          )}
        </Card>
      </>
    );
  };

  return (
    <Screen
      scroll={false}
      contentStyle={{
        backgroundColor: FP.bg,
        paddingTop: 0,
        paddingHorizontal: 0,
        paddingBottom: 0,
      }}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <StoreGuard>
          <Text style={{ color: FP.text, fontWeight: "900", fontSize: 31 }}>{uiText("Field Reports")}</Text>
          <Text style={{ color: FP.muted, marginTop: 8, fontWeight: "800", lineHeight: 22 }}>
            {uiText("Chagua report kufungua hesabu kamili ya field moja bila kuchanganya taarifa.")}</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {[
              ["TODAY", "Today"],
              ["OPEN", "Active"],
              ["CLOSED", "Closed"],
              ["ALL", "All"],
            ].map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key as FilterKey)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "rgba(16,185,129,0.36)" : "rgba(255,255,255,0.10)",
                    backgroundColor: active ? "rgba(16,185,129,0.13)" : "rgba(255,255,255,0.05)",
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: active ? FP.emerald : FP.text, fontWeight: "900", fontSize: 12 }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!!errorText && (
            <Card style={{ marginTop: 14, borderRadius: 20, borderColor: "rgba(245,158,11,0.24)", backgroundColor: "rgba(245,158,11,0.08)" }}>
              <Text style={{ color: FP.warning, fontWeight: "900" }}>{errorText}</Text>
            </Card>
          )}

          {loading ? (
            <Text style={{ marginTop: 20, color: FP.faint, fontWeight: "800" }}>{uiText("Loading reports...")}</Text>
          ) : displayedCycles.length === 0 ? (
            <Card
              style={{
                marginTop: 20,
                borderRadius: 26,
                borderColor: "#DCE7F3",
                backgroundColor: FP.card,
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}
            >
              <Text style={{ color: FP.text, fontWeight: "900" }}>{uiText("Hakuna report kwenye filter hii.")}</Text>
            </Card>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              {displayedCycles.map((c) => {
                const isOpen = clean(c.status).toUpperCase() === "OPEN";
                const reportRowsCount = rows.filter((r) => r.field_cycle_id === c.cycle_id).length;

                return (
                  <Pressable
                    key={c.cycle_id}
                    onPress={() => openReport(c.cycle_id)}
                    style={({ pressed }) => ({
                      borderRadius: 30,
                      borderWidth: 1,
                      borderColor: isOpen ? "#A7F3D0" : "#DCE7F3",
                      backgroundColor: isOpen ? "#ECFDF5" : FP.card,
                      padding: 18,
                      shadowColor: "#000",
                      shadowOpacity: 0.06,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 4,
                      opacity: pressed ? 0.94 : 1,
                    })}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: FP.text, fontWeight: "900", fontSize: 20 }} numberOfLines={1}>
                          {c._uiMissingTitle ? uiText("Field Cycle") : c.title}
                        </Text>
                        <Text style={{ color: FP.muted, fontWeight: "800", marginTop: 8 }}>
                          {fmtDate(c.opened_at)}
                        </Text>
                      </View>

                      <Text style={{ color: isOpen ? FP.emerald : FP.faint, fontWeight: "900" }}>
                        {isOpen ? uiText("ACTIVE") : uiText("CLOSED")}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
                      <StatBox label={uiText("ALLOCATED")} value={fmt(c.total_allocated)} hint={uiText("given out")} />
                      <StatBox label={uiText("SPENT")} value={fmt(c.total_spent)} hint={uiText("used")} />
                    </View>

                    <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                      <StatBox label={uiText("BALANCE")} value={fmt(c.agent_wallet_balance)} hint={uiText("agents")} />
                      <StatBox label={uiText("RECORDS")} value={String(reportRowsCount)} hint={uiText("tap to view")} />
                    </View>

                    <Text style={{ color: FP.emerald, fontWeight: "900", marginTop: 14 }}>
                      {uiText("Open full report →")}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Modal visible={reportOpen} animationType="slide" onRequestClose={() => setReportOpen(false)}>
            <Screen
              scroll={false}
              contentStyle={{
                backgroundColor: FP.bg,
                paddingTop: 0,
                paddingHorizontal: 0,
                paddingBottom: 0,
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
                <Pressable
                  onPress={() => setReportOpen(false)}
                  style={({ pressed }) => ({
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    marginBottom: 14,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: FP.text, fontWeight: "900" }}>{uiText("← Back to Reports")}</Text>
                </Pressable>

                <ReportBody />
              </ScrollView>
            </Screen>
          </Modal>
        </StoreGuard>
      </ScrollView>
    </Screen>
  );
}