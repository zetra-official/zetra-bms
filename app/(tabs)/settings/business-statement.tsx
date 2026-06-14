import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
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
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { theme } from "@/src/ui/theme";

type RangeKey = "month" | "year" | "custom";

type PaymentSummary = {
  cash_total: number;
  mobile_total: number;
  bank_total: number;
  credit_collected_total: number;
  grand_paid_total: number;
  total_sales: number;
  total_balance: number;
};

type ProfitSummary = {
  net: number;
  sales: number | null;
  expenses: number | null;
};

type CollectionBreakdown = {
  cash: number;
  bank: number;
  mobile: number;
  other: number;
  total: number;
  payments: number;
};

type StatementRow = {
  sale_id?: string;
  sold_at?: string;
  total_qty?: number | null;
  total_amount?: number | null;
  payment_method?: string | null;
  paid_amount?: number | null;
  balance_amount?: number | null;
  status?: string | null;
};
type SaleItemLine = {
  sale_id: string;
  product_name: string;
  qty: number;
  total: number;
};
type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  spent_at: string | null;
  category: string | null;
  note: string | null;
};

type CapitalRecoveryRow = {
  id: string;
  entry_type: "ASSET" | "COST" | "INCOME";
  amount: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
  created_role?: string | null;
  created_by_name?: string | null;
};

type AnyRow = Record<string, any>;

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonthLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setDate(1);
  return x;
}

function startOfYearLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setMonth(0, 1);
  return x;
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputStart(input: string) {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;

  const out = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isFinite(out.getTime()) ? out : null;
}

function parseDateInputEnd(input: string) {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;

  const out = new Date(y, m - 1, d, 23, 59, 59, 999);
  return Number.isFinite(out.getTime()) ? out : null;
}

function safeWhenLabel(iso?: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function labelForRange(r: RangeKey) {
  if (r === "month") return "This Month";
  if (r === "year") return "This Year";
  return "Custom Range";
}

function summaryLabelForRange(
  range: RangeKey,
  resolvedRange?: { from: string; to: string } | null
) {
  if (range === "month") return "This Month";
  if (range === "year") return "This Year";
  if (!resolvedRange) return "Custom Range";

  const from = resolvedRange.from ? resolvedRange.from.slice(0, 10) : "—";
  const to = resolvedRange.to ? resolvedRange.to.slice(0, 10) : "—";
  return `Custom (${from} → ${to})`;
}

function escapeHtml(input: any) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="rgba(255,255,255,0.35)"
      autoCapitalize="none"
      autoCorrect={false}
      style={{
        color: theme.colors.text,
        fontWeight: "800",
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    />
  );
}

function MetricCard({
  title,
  amount,
  subtitle,
}: {
  title: string;
  amount: string;
  subtitle?: string;
}) {
  return (
    <Card style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
        {amount}
      </Text>
      {!!subtitle && (
        <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
          {subtitle}
        </Text>
      )}
    </Card>
  );
}

function normalizeSaleRow(r: AnyRow): StatementRow {
  return {
    sale_id:
      r.sale_id != null
        ? String(r.sale_id)
        : r.id != null
        ? String(r.id)
        : undefined,
    sold_at:
      r.sold_at != null
        ? String(r.sold_at)
        : r.created_at != null
        ? String(r.created_at)
        : undefined,
    total_qty: r.total_qty == null ? null : toNum(r.total_qty),
    total_amount:
      r.total_amount == null
        ? r.amount == null
          ? null
          : toNum(r.amount)
        : toNum(r.total_amount),
    payment_method: r.payment_method != null ? String(r.payment_method) : null,
    paid_amount: r.paid_amount == null ? null : toNum(r.paid_amount),
    balance_amount: r.balance_amount == null ? null : toNum(r.balance_amount),
    status: r.status != null ? String(r.status) : null,
  };
}

function pickExpenseTitle(r: AnyRow) {
  return String(
    r.title ??
      r.name ??
      r.expense_title ??
      r.expense_name ??
      r.description ??
      r.note ??
      "Expense"
  );
}

function pickExpenseCategory(r: AnyRow) {
  const v =
    r.category ??
    r.category_name ??
    r.expense_category ??
    r.expense_category_name ??
    r.type ??
    r.expense_type ??
    r.category_title ??
    r.category_label ??
    null;

  return v != null ? String(v) : null;
}

function pickExpenseWhen(r: AnyRow) {
  const v = r.spent_at ?? r.created_at ?? r.date ?? r.expense_date ?? null;
  return v != null ? String(v) : null;
}

function pickExpenseNote(r: AnyRow) {
  const v = r.note ?? r.description ?? r.details ?? null;
  return v != null ? String(v) : null;
}

async function getCreditCollectionsSummary(
  orgId: string,
  storeId: string,
  fromISO: string,
  toISO: string
): Promise<CollectionBreakdown> {
  if (!orgId || !storeId) {
    return {
      cash: 0,
      bank: 0,
      mobile: 0,
      other: 0,
      total: 0,
      payments: 0,
    };
  }

  const fnCandidates = [
    "get_credit_collections_summary_v2",
    "get_credit_collections_channel_summary_v2",
    "get_credit_collections_channel_summary_v1",
    "get_credit_collections_channel_summary",
    "get_credit_payments_channel_summary_v1",
    "get_credit_payments_channel_summary",
  ];

  let lastErr: any = null;

  for (const fn of fnCandidates) {
    const { data, error } = await supabase.rpc(fn, {
      p_org_id: orgId,
      p_from: fromISO,
      p_to: toISO,
      p_store_id: storeId,
    } as any);

    if (error) {
      lastErr = error;
      continue;
    }

    const rows = (Array.isArray(data) ? data : []) as any[];

    const out: CollectionBreakdown = {
      cash: 0,
      bank: 0,
      mobile: 0,
      other: 0,
      total: 0,
      payments: 0,
    };

    for (const r of rows) {
      const ch = String(
        r?.channel ?? r?.payment_method ?? r?.method ?? ""
      )
        .trim()
        .toUpperCase();

      const amt = toNum(r?.amount ?? r?.revenue ?? r?.total ?? 0);
      const cnt = toNum(r?.payments ?? r?.count ?? 0);

      out.payments += cnt;

      if (ch === "CASH") out.cash += amt;
      else if (ch === "BANK") out.bank += amt;
      else if (ch === "MOBILE") out.mobile += amt;
      else out.other += amt;
    }

    out.total = out.cash + out.bank + out.mobile;
    return out;
  }

  const _ignored = lastErr;
  return {
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    payments: 0,
  };
}

function buildStatementRef(
  orgName?: string | null,
  storeName?: string | null,
  range?: RangeKey,
  fromIso?: string | null,
  toIso?: string | null
) {
  const org = String(orgName ?? "ORG")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
  const store = String(storeName ?? "STORE")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
  const rangeCode = String(range ?? "CUSTOM").toUpperCase();
  const from = fromIso ? fromIso.slice(0, 10).replace(/-/g, "") : "FROM";
  const to = toIso ? toIso.slice(0, 10).replace(/-/g, "") : "TO";
  return `BST-${org}-${store}-${rangeCode}-${from}-${to}`;
}
function printHtmlPdfOnWeb(html: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "0";
  iframe.style.top = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1500);
  }, 500);

  return true;
}
async function loadSaleItemsMap(
  saleIds: string[],
  storeId: string
): Promise<Record<string, SaleItemLine[]>> {
  const ids = saleIds.map((x) => String(x || "").trim()).filter(Boolean);
  const sidStore = String(storeId || "").trim();
  if (ids.length === 0) return {};

  const tableCandidates = ["sale_items", "sales_items"];

  for (const table of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .in("sale_id", ids);

      if (error) throw error;

      const rows = (data ?? []) as any[];

      const productIds = Array.from(
        new Set(
          rows
            .map((r) => String(r.product_id ?? r.item_id ?? r.productId ?? "").trim())
            .filter(Boolean)
        )
      );

      const productNameById: Record<string, string> = {};

      if (sidStore) {
        const { data: invData } = await supabase.rpc("get_store_inventory_v2", {
          p_store_id: sidStore,
        });

        for (const p of (Array.isArray(invData) ? invData : []) as any[]) {
          const pid = String(p.product_id ?? p.id ?? "").trim();
          const pname = String(
            p.product_name ??
              p.name ??
              p.item_name ??
              p.title ??
              ""
          ).trim();

          if (pid && pname) productNameById[pid] = pname;
        }
      }

      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from("products")
          .select("*")
          .in("id", productIds);

        for (const p of (productsData ?? []) as any[]) {
          const pid = String(p.id ?? p.product_id ?? "").trim();
          const pname = String(
            p.product_name ??
              p.name ??
              p.item_name ??
              p.title ??
              p.product_title ??
              ""
          ).trim();

          if (pid && pname) productNameById[pid] = pname;
        }
      }

      const map: Record<string, SaleItemLine[]> = {};

      for (const r of rows) {
        const saleId = String(r.sale_id ?? "").trim();
        if (!saleId) continue;

        const productId = String(r.product_id ?? r.item_id ?? r.productId ?? "").trim();

        const productName = String(
          r.product_name ??
            r.productName ??
            r.product_title ??
            r.item_name ??
            r.itemName ??
            r.name ??
            r.title ??
            r.product?.name ??
            r.products?.name ??
            r.products?.product_name ??
            productNameById[productId] ??
            ""
        ).trim();

        const qty = toNum(r.qty ?? r.quantity ?? r.total_qty ?? 1);
        const total = toNum(r.total_amount ?? r.line_total ?? r.amount ?? r.subtotal ?? 0);

        if (!map[saleId]) map[saleId] = [];

        map[saleId].push({
          sale_id: saleId,
          product_name: productName || "Product name missing",
          qty,
          total,
        });
      }

      return map;
    } catch {
      // try next table
    }
  }

  return {};
}
export default function BusinessStatementScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeStoreId, activeStoreName, activeRole } =
    useOrg() as any;

  const money = useOrgMoneyPrefs(activeOrgId);
  const fmtMoney = useCallback((n: number) => money.fmt(Number(n || 0)), [money]);

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const now = useMemo(() => new Date(), []);
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState(() =>
    toDateInputValue(startOfMonthLocal(now))
  );
  const [customTo, setCustomTo] = useState(() =>
    toDateInputValue(endOfDayLocal(now))
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [salesRows, setSalesRows] = useState<StatementRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
const [capitalRows, setCapitalRows] = useState<CapitalRecoveryRow[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({
    cash_total: 0,
    mobile_total: 0,
    bank_total: 0,
    credit_collected_total: 0,
    grand_paid_total: 0,
    total_sales: 0,
    total_balance: 0,
  });
const [saleItemsBySaleId, setSaleItemsBySaleId] = useState<Record<string, SaleItemLine[]>>({});
  const [profitSummary, setProfitSummary] = useState<ProfitSummary>({
    net: 0,
    sales: null,
    expenses: null,
  });

  const [creditCollections, setCreditCollections] = useState<CollectionBreakdown>({
    cash: 0,
    bank: 0,
    mobile: 0,
    other: 0,
    total: 0,
    payments: 0,
  });

 const canView = useMemo(() => {
    const r = String(activeRole ?? "").toLowerCase();
    return r === "owner" || r === "admin";
  }, [activeRole]);

  const resolvedRange = useMemo(() => {
    if (range === "month") {
      return {
        from: startOfMonthLocal(new Date()).toISOString(),
        to: endOfDayLocal(new Date()).toISOString(),
      };
    }

    if (range === "year") {
      return {
        from: startOfYearLocal(new Date()).toISOString(),
        to: endOfDayLocal(new Date()).toISOString(),
      };
    }

    const fromDate = parseDateInputStart(customFrom);
    const toDate = parseDateInputEnd(customTo);

    if (!fromDate || !toDate) return null;
    if (fromDate.getTime() > toDate.getTime()) return null;

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }, [customFrom, customTo, range]);

  const customRangeError = useMemo(() => {
    if (range !== "custom") return null;

    const fromDate = parseDateInputStart(customFrom);
    const toDate = parseDateInputEnd(customTo);

    if (!fromDate || !toDate) return "Tumia format ya tarehe: YYYY-MM-DD";
    if (fromDate.getTime() > toDate.getTime()) {
      return "From Date haiwezi kuwa kubwa kuliko To Date";
    }
    return null;
  }, [customFrom, customTo, range]);

  const summaryLabel = useMemo(() => {
    return summaryLabelForRange(range, resolvedRange);
  }, [range, resolvedRange]);

  const load = useCallback(
    async (mode: "boot" | "refresh", overrideRange?: { from: string; to: string } | null) => {
      setErr(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        if (!canView) throw new Error("Business Statement ni kwa owner tu.");
        if (!activeStoreId) throw new Error("No active store selected.");

        const finalRange = overrideRange ?? resolvedRange;
        if (!finalRange) throw new Error("Invalid date range.");

        const access = await supabase.rpc("ensure_my_store_access", {
          p_store_id: activeStoreId,
        });
        if (access.error) throw access.error;

        const [salesRes, payRes, profitRes, creditCollectionsRes, expensesRes, capitalRes] =
          await Promise.all([
            supabase.rpc("get_sales_v2", {
              p_store_id: activeStoreId,
              p_from: finalRange.from,
              p_to: finalRange.to,
            } as any),
            supabase.rpc("get_sales_payment_summary_v1", {
              p_store_id: activeStoreId,
              p_from: finalRange.from,
              p_to: finalRange.to,
            } as any),
            supabase.rpc("get_store_net_profit_v2", {
              p_store_id: activeStoreId,
              p_from: finalRange.from,
              p_to: finalRange.to,
            } as any),
            getCreditCollectionsSummary(
              String(activeOrgId ?? "").trim(),
              String(activeStoreId ?? "").trim(),
              finalRange.from,
              finalRange.to
            ),
            supabase
              .from("expenses")
              .select("*")
              .eq("store_id", activeStoreId)
              .gte("spent_at", finalRange.from)
              .lte("spent_at", finalRange.to)
              .order("spent_at", { ascending: false }),

            supabase.rpc("get_capital_recovery_history_v2", {
              p_store_id: activeStoreId,
              p_limit: 500,
            }),
          ]);

        if (salesRes.error) throw salesRes.error;
        if (payRes.error) throw payRes.error;
        if (profitRes.error) throw profitRes.error;

        let rawExpenses: AnyRow[] = [];
        if (expensesRes.error) {
          const fallbackByExpenseDate = await supabase
            .from("expenses")
            .select("*")
            .eq("store_id", activeStoreId)
            .gte("expense_date", finalRange.from.slice(0, 10))
            .lte("expense_date", finalRange.to.slice(0, 10))
            .order("expense_date", { ascending: false });

          if (!fallbackByExpenseDate.error) {
            rawExpenses = (fallbackByExpenseDate.data ?? []) as AnyRow[];
          } else {
            const fallbackByCreatedAt = await supabase
              .from("expenses")
              .select("*")
              .eq("store_id", activeStoreId)
              .gte("created_at", finalRange.from)
              .lte("created_at", finalRange.to)
              .order("created_at", { ascending: false });

            if (fallbackByCreatedAt.error) throw fallbackByCreatedAt.error;
            rawExpenses = (fallbackByCreatedAt.data ?? []) as AnyRow[];
          }
        } else {
          rawExpenses = (expensesRes.data ?? []) as AnyRow[];
        }

        const sales = ((salesRes.data ?? []) as AnyRow[]).map(normalizeSaleRow);

const saleIds = sales
  .map((s) => String(s.sale_id ?? "").trim())
  .filter(Boolean);

const saleItemsMap = await loadSaleItemsMap(
  saleIds,
  String(activeStoreId ?? "").trim()
);

sales.sort((a, b) => {
          const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
          const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
          return tb - ta;
        });

        const payRow = Array.isArray(payRes.data) ? (payRes.data[0] ?? null) : payRes.data;
        const profitRow = Array.isArray(profitRes.data)
          ? (profitRes.data[0] ?? null)
          : profitRes.data;

        const expenses: ExpenseRow[] = rawExpenses.map((r) => ({
          id: String(r.id ?? ""),
          title: pickExpenseTitle(r),
          amount: toNum(r.amount ?? 0),
          spent_at: pickExpenseWhen(r),
          category: (pickExpenseCategory(r) ?? "—").trim() || "—",
          note: pickExpenseNote(r),
        }));

        const rawCapital = capitalRes.error ? [] : Array.isArray(capitalRes.data) ? capitalRes.data : [];

        const capital: CapitalRecoveryRow[] = rawCapital
          .map((r: any) => ({
            id: String(r?.id ?? ""),
            entry_type: String(r?.entry_type ?? "").toUpperCase() as "ASSET" | "COST" | "INCOME",
            amount: toNum(r?.amount),
            note: String(r?.note ?? "").trim() || null,
            created_at: String(r?.created_at ?? ""),
            created_by: String(r?.created_by ?? "").trim() || null,
            created_role: String(r?.created_role ?? "").trim() || null,
            created_by_name: String(r?.created_by_name ?? "").trim() || null,
          }))
          .filter((r) => {
            const t = Date.parse(r.created_at);
            if (!Number.isFinite(t)) return false;
            return t >= Date.parse(finalRange.from) && t <= Date.parse(finalRange.to);
          })
          .filter((r) => r.entry_type === "ASSET" || r.entry_type === "COST" || r.entry_type === "INCOME")
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

        const mergedCash = toNum(payRow?.v_cash_total ?? payRow?.cash_total ?? 0);
        const mergedMobile = toNum(payRow?.v_mobile_total ?? payRow?.mobile_total ?? 0);
        const mergedBank = toNum(payRow?.v_bank_total ?? payRow?.bank_total ?? 0);
        const mergedCreditCollected = toNum(
          creditCollectionsRes?.total ??
            payRow?.v_credit_collected_total ??
            payRow?.credit_collected_total ??
            0
        );

       setSalesRows(sales);
setSaleItemsBySaleId(saleItemsMap);
setExpenseRows(expenses);
        setCapitalRows(capital);
        setCreditCollections(creditCollectionsRes);
        setProfitSummary({
          net: toNum(profitRow?.net_profit ?? profitRow?.net ?? 0),
          sales:
            profitRow?.sales_total != null ? toNum(profitRow.sales_total) : null,
          expenses:
            profitRow?.expenses_total != null ? toNum(profitRow.expenses_total) : null,
        });
        setPaymentSummary({
          cash_total: mergedCash,
          mobile_total: mergedMobile,
          bank_total: mergedBank,
          credit_collected_total: mergedCreditCollected,
          grand_paid_total: toNum(
            payRow?.v_grand_paid_total ??
              payRow?.grand_paid_total ??
              mergedCash + mergedMobile + mergedBank
          ),
          total_sales: toNum(payRow?.v_total_sales ?? payRow?.total_sales ?? 0),
          total_balance: toNum(payRow?.v_total_balance ?? payRow?.total_balance ?? 0),
        });
      } catch (e: any) {
        setSalesRows([]);
        setSaleItemsBySaleId({});
        setExpenseRows([]);
        setCapitalRows([]);
        setPaymentSummary({
          cash_total: 0,
          mobile_total: 0,
          bank_total: 0,
          credit_collected_total: 0,
          grand_paid_total: 0,
          total_sales: 0,
          total_balance: 0,
        });
        setProfitSummary({
          net: 0,
          sales: null,
          expenses: null,
        });
        setCreditCollections({
          cash: 0,
          bank: 0,
          mobile: 0,
          other: 0,
          total: 0,
          payments: 0,
        });
        setErr(e?.message ?? "Failed to load business statement");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeOrgId, activeStoreId, canView, resolvedRange]
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

  useEffect(() => {
    if (range === "month" || range === "year") {
      void load("refresh");
    }
  }, [range, load]);

  const applyCustomRange = useCallback(() => {
    const fromDate = parseDateInputStart(customFrom);
    const toDate = parseDateInputEnd(customTo);

    if (!fromDate || !toDate) {
      setErr("Tumia format ya tarehe: YYYY-MM-DD");
      return;
    }

    if (fromDate.getTime() > toDate.getTime()) {
      setErr("From Date haiwezi kuwa kubwa kuliko To Date");
      return;
    }

    const nextRange = {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };

    setRange("custom");
    void load("refresh", nextRange);
  }, [customFrom, customTo, load]);

  const salesCount = salesRows.length;

  const totalQty = useMemo(
    () => salesRows.reduce((a, r) => a + toNum(r.total_qty ?? 0), 0),
    [salesRows]
  );

  const expenseCount = expenseRows.length;

  const totalExpenses = useMemo(() => {
    if (profitSummary.expenses != null) {
      return toNum(profitSummary.expenses);
    }
    return expenseRows.reduce((a, r) => a + toNum(r.amount ?? 0), 0);
  }, [expenseRows, profitSummary.expenses]);

  const netProfit = useMemo(() => {
    if (profitSummary.net != null) {
      return toNum(profitSummary.net);
    }
    return toNum(paymentSummary.total_sales) - toNum(totalExpenses);
  }, [paymentSummary.total_sales, profitSummary.net, totalExpenses]);

  const capitalSummary = useMemo(() => {
    const asset = capitalRows
      .filter((r) => r.entry_type === "ASSET")
      .reduce((a, r) => a + toNum(r.amount), 0);

    const cost = capitalRows
      .filter((r) => r.entry_type === "COST")
      .reduce((a, r) => a + toNum(r.amount), 0);

    const income = capitalRows
      .filter((r) => r.entry_type === "INCOME")
      .reduce((a, r) => a + toNum(r.amount), 0);

    return {
      asset,
      cost,
      income,
      net: income - cost,
      count: capitalRows.length,
    };
  }, [capitalRows]);

  const rangeTextForPdf = useMemo(() => {
    if (!resolvedRange) return labelForRange(range);
    return `${labelForRange(range)} (${safeWhenLabel(resolvedRange.from)} → ${safeWhenLabel(
      resolvedRange.to
    )})`;
  }, [range, resolvedRange]);

  const statementRef = useMemo(() => {
    return buildStatementRef(
      activeOrgName,
      activeStoreName,
      range,
      resolvedRange?.from ?? null,
      resolvedRange?.to ?? null
    );
  }, [activeOrgName, activeStoreName, range, resolvedRange?.from, resolvedRange?.to]);

  const getSaleItemsText = useCallback(
    (saleId?: string | null) => {
      const sid = String(saleId ?? "").trim();
      const items = saleItemsBySaleId[sid] ?? [];

      if (items.length === 0) return "Items not loaded";

      return items.map((x) => `${x.product_name} x${x.qty}`).join(", ");
    },
    [saleItemsBySaleId]
  );

  const buildStatementHtml = useCallback(() => {
   

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Business Statement ${escapeHtml(statementRef)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 10mm; }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.32;
    }

    .page { width: 100%; background: #ffffff; }

    .header {
      display: table;
      width: 100%;
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .brand, .meta {
      display: table-cell;
      vertical-align: top;
    }

    .brand-title {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.2px;
    }

    .brand-sub {
      margin-top: 3px;
      font-size: 10px;
      font-weight: 800;
      color: #475569;
    }

    .meta {
      text-align: right;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.45;
      width: 42%;
    }

    .badge {
      display: inline-block;
      border: 1px solid #10b981;
      background: #ecfdf5;
      color: #047857;
      border-radius: 999px;
      padding: 4px 8px;
      font-weight: 900;
      margin-top: 4px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 13px 0 6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }

    .info-table, .data-table, .summary-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 8px;
    }

    .info-table td,
    .summary-table td {
      border: 1px solid #cbd5e1;
      padding: 7px;
      vertical-align: top;
      word-break: break-word;
    }

    .data-table th,
    .data-table td {
      border: 1px solid #cbd5e1;
      padding: 5px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }

    .data-table th {
      background: #f1f5f9;
      font-size: 8.5px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .data-table td { font-size: 9px; }

    .grid {
      display: table;
      width: 100%;
      table-layout: fixed;
      border-spacing: 6px;
      margin-top: 8px;
    }

    .box {
      display: table-cell;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      padding: 8px;
      vertical-align: top;
    }

    .label {
      color: #64748b;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .value {
      color: #111827;
      font-size: 13px;
      font-weight: 900;
      margin-top: 3px;
      word-break: break-word;
    }

    .right { text-align: right; white-space: nowrap; }
    .muted { color: #64748b; font-weight: 700; }

    .profit {
      border: 1.5px solid #10b981;
      background: #ecfdf5;
      padding: 10px;
      margin-top: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .profit-label {
      color: #047857;
      font-weight: 900;
      font-size: 10px;
      text-transform: uppercase;
    }

    .profit-value {
      font-size: 20px;
      font-weight: 900;
      margin-top: 3px;
    }

    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      color: #64748b;
      text-align: center;
      font-size: 9px;
      font-weight: 800;
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="brand-title">Business Statement</div>
        <div class="brand-sub">Statement Ref: ${escapeHtml(statementRef)}</div>
      </div>

      <div class="meta">
        <b>Business:</b> ${escapeHtml(activeOrgName ?? "—")}<br/>
        <b>Store:</b> ${escapeHtml(activeStoreName ?? "—")}<br/>
        <b>Generated:</b> ${escapeHtml(new Date().toLocaleString())}<br/>
        <span class="badge">${escapeHtml(labelForRange(range))}</span>
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td><b>Organization</b><br/>${escapeHtml(activeOrgName ?? "—")}</td>
        <td><b>Store</b><br/>${escapeHtml(activeStoreName ?? "—")}</td>
        <td><b>Role</b><br/>${escapeHtml(activeRole ?? "—")}</td>
      </tr>
      <tr>
        <td><b>Period</b><br/>${escapeHtml(rangeTextForPdf)}</td>
        <td><b>Sales Count</b><br/>${escapeHtml(String(salesCount))}</td>
        <td><b>Total Qty Sold</b><br/>${escapeHtml(String(totalQty))}</td>
      </tr>
    </table>

    <div class="section-title">Statement Summary</div>
    <div class="grid">
      <div class="box"><div class="label">Total Sales</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.total_sales))}</div></div>
      <div class="box"><div class="label">Total Expenses</div><div class="value">${escapeHtml(fmtMoney(totalExpenses))}</div></div>
      <div class="box"><div class="label">Outstanding</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.total_balance))}</div></div>
    </div>

    <div class="profit">
      <div class="profit-label">Net Profit</div>
      <div class="profit-value">${escapeHtml(fmtMoney(netProfit))}</div>
    </div>

    <div class="section-title">Payment Breakdown</div>
    <div class="grid">
      <div class="box"><div class="label">Cash</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.cash_total))}</div></div>
      <div class="box"><div class="label">Mobile</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.mobile_total))}</div></div>
      <div class="box"><div class="label">Bank</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.bank_total))}</div></div>
    </div>

    <div class="grid">
      <div class="box"><div class="label">Credit Collected</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.credit_collected_total))}</div></div>
      <div class="box"><div class="label">Grand Paid In</div><div class="value">${escapeHtml(fmtMoney(paymentSummary.grand_paid_total))}</div></div>
      <div class="box"><div class="label">Expense Count</div><div class="value">${escapeHtml(String(expenseCount))}</div></div>
    </div>

    <div class="section-title">Capital Recovery</div>
    <div class="grid">
      <div class="box"><div class="label">Income</div><div class="value">${escapeHtml(fmtMoney(capitalSummary.income))}</div></div>
      <div class="box"><div class="label">Cost</div><div class="value">${escapeHtml(fmtMoney(capitalSummary.cost))}</div></div>
      <div class="box"><div class="label">Net Position</div><div class="value">${escapeHtml(fmtMoney(capitalSummary.net))}</div></div>
    </div>

    <div class="section-title">Sales Included</div>
    <table class="data-table">
      <thead>
        <tr>
    <th style="width:4%">#</th>
<th style="width:28%">Products / Items</th>
<th style="width:10%">Sale Ref</th>
<th style="width:20%">When</th>
<th style="width:6%" class="right">Qty</th>
<th style="width:14%" class="right">Amount</th>
<th style="width:8%">Method</th>
<th style="width:10%" class="right">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${
          salesRows
            .map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
              <td>${escapeHtml(getSaleItemsText(item.sale_id))}</td>
<td>${escapeHtml(String(item.sale_id ?? "—").slice(0, 8))}</td>
<td>${escapeHtml(safeWhenLabel(item.sold_at))}</td>
                <td class="right">${escapeHtml(String(toNum(item.total_qty ?? 0)))}</td>
                <td class="right">${escapeHtml(fmtMoney(toNum(item.total_amount ?? 0)))}</td>
                <td>${escapeHtml(String(item.payment_method ?? "—").toUpperCase())}</td>
                <td class="right">${escapeHtml(fmtMoney(toNum(item.balance_amount ?? 0)))}</td>
              </tr>
            `)
            .join("") || `<tr><td colspan="8">No sales found for this range.</td></tr>`
        }
      </tbody>
    </table>

    <div class="section-title">Expenses Included</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:25%">Title</th>
          <th style="width:18%">Category</th>
          <th style="width:25%">When</th>
          <th style="width:17%" class="right">Amount</th>
          <th style="width:10%">Note</th>
        </tr>
      </thead>
      <tbody>
        ${
          expenseRows
            .map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.category ?? "—")}</td>
                <td>${escapeHtml(safeWhenLabel(item.spent_at))}</td>
                <td class="right">${escapeHtml(fmtMoney(item.amount))}</td>
                <td>${escapeHtml(item.note ?? "—")}</td>
              </tr>
            `)
            .join("") || `<tr><td colspan="6">No expenses found for this range.</td></tr>`
        }
      </tbody>
    </table>

    <div class="footer">
      Generated by ZETRA BMS • Business Statement • Sales + Expenses + Profit + Balance
    </div>
  </div>
</body>
</html>
    `;
  }, [
    activeOrgName,
    activeRole,
    activeStoreName,
    capitalSummary.cost,
    capitalSummary.income,
    capitalSummary.net,
    expenseCount,
   expenseRows,
fmtMoney,
getSaleItemsText,
netProfit,
    paymentSummary.bank_total,
    paymentSummary.cash_total,
    paymentSummary.credit_collected_total,
    paymentSummary.grand_paid_total,
    paymentSummary.mobile_total,
    paymentSummary.total_balance,
    paymentSummary.total_sales,
    range,
    rangeTextForPdf,
    salesCount,
    salesRows,
    statementRef,
    totalExpenses,
    totalQty,
  ]);

  const handleSharePdf = useCallback(async () => {
    if (sharingBusy) return;

    try {
      setSharingBusy(true);

      const html = buildStatementHtml();

      if (printHtmlPdfOnWeb(html)) return;

      const file = await Print.printToFileAsync({ html, base64: false });
      if (!file?.uri) throw new Error("PDF URI not returned");

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Business Statement PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Print.printAsync({ uri: file.uri });
      }
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? "Imeshindikana kutengeneza au kushare PDF.");
    } finally {
      setSharingBusy(false);
    }
  }, [buildStatementHtml, sharingBusy]);

  const SegButton = useCallback(
    ({ k, label }: { k: RangeKey; label: string }) => {
      const active = range === k;
      return (
        <Pressable
          onPress={() => setRange(k)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      );
    },
    [range]
  );

  if (!canView) {
    return (
      <Screen scroll={false}>
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
                Business Statement
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} • {activeRole ?? "—"}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                {isOffline ? "OFFLINE" : "ONLINE"}
              </Text>
            </View>
          </View>

          <Card
            style={{
              gap: 10,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: "900", fontSize: 16 }}>
              Access Denied
            </Text>

            <Text style={{ color: theme.colors.text, fontWeight: "800", lineHeight: 22 }}>
              Business Statement ni eneo nyeti la kifedha. Kwa sasa inaruhusiwa kwa owner tu.
            </Text>

            <Button title="Go Back" variant="secondary" onPress={() => router.back()} />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
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
                Business Statement
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} • {activeRole ?? "—"}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                {isOffline ? "OFFLINE" : "ONLINE"}
              </Text>
            </View>
          </View>

   
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Range</Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <SegButton k="month" label="Month" />
              <SegButton k="year" label="Year" />
              <SegButton k="custom" label="Custom" />
            </View>

            {range === "custom" && (
              <View style={{ gap: 10 }}>
                <View>
                  <InputLabel>From Date</InputLabel>
                  <InputBox
                    value={customFrom}
                    onChangeText={setCustomFrom}
                    placeholder="YYYY-MM-DD"
                  />
                </View>

                <View>
                  <InputLabel>To Date</InputLabel>
                  <InputBox
                    value={customTo}
                    onChangeText={setCustomTo}
                    placeholder="YYYY-MM-DD"
                  />
                </View>

                {!!customRangeError && (
                  <Text style={{ color: theme.colors.danger, fontWeight: "800" }}>
                    {customRangeError}
                  </Text>
                )}

                <Button
                  title="Apply Custom Range"
                  onPress={applyCustomRange}
                  disabled={!!customRangeError}
                  variant="secondary"
                />
              </View>
            )}

            <Button
              title={refreshing ? "Refreshing..." : "Refresh Statement"}
              onPress={() => load("refresh")}
              disabled={refreshing || (range === "custom" && !!customRangeError)}
              variant="primary"
            />

            {!!err && (
              <Text style={{ color: theme.colors.danger, fontWeight: "800" }}>{err}</Text>
            )}
          </Card>

          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
            Statement Summary ({summaryLabel})
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
            Period: {rangeTextForPdf}
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard title="TOTAL SALES" amount={fmtMoney(paymentSummary.total_sales)} />
            <MetricCard title="TOTAL EXPENSES" amount={fmtMoney(totalExpenses)} />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard
              title="NET PROFIT"
              amount={fmtMoney(netProfit)}
              subtitle="Sales - Expenses"
            />
            <MetricCard
              title="OUTSTANDING"
              amount={fmtMoney(paymentSummary.total_balance)}
              subtitle="Balance / mikopo"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard title="SALES COUNT" amount={String(salesCount)} />
            <MetricCard title="EXPENSE COUNT" amount={String(expenseCount)} />
          </View>

          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
            Capital Recovery Statement
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard title="INCOME" amount={fmtMoney(capitalSummary.income)} />
            <MetricCard title="COST" amount={fmtMoney(capitalSummary.cost)} />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {String(activeRole ?? "").toLowerCase() === "owner" ? (
              <MetricCard title="ASSET" amount={fmtMoney(capitalSummary.asset)} />
            ) : null}
            <MetricCard
              title="NET POSITION"
              amount={`${capitalSummary.net >= 0 ? "+" : "-"} ${fmtMoney(Math.abs(capitalSummary.net))}`}
              subtitle="Income - Cost"
            />
          </View>

          <MetricCard title="RECOVERY RECORDS" amount={String(capitalSummary.count)} />

          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
            Payment Breakdown
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard title="Cash" amount={fmtMoney(paymentSummary.cash_total)} />
            <MetricCard title="Mobile" amount={fmtMoney(paymentSummary.mobile_total)} />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard title="Bank" amount={fmtMoney(paymentSummary.bank_total)} />
            <MetricCard
              title="Credit Collected"
              amount={fmtMoney(paymentSummary.credit_collected_total)}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard title="Grand Paid In" amount={fmtMoney(paymentSummary.grand_paid_total)} />
            <MetricCard title="Total Qty Sold" amount={String(totalQty)} />
          </View>

          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              Statement Actions
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
              Statement Ref: {statementRef}
            </Text>

            <Button
              title={sharingBusy ? "Preparing PDF..." : "Share Statement PDF"}
              onPress={() => {
                void handleSharePdf();
              }}
              disabled={sharingBusy || loading || !canView}
              variant="primary"
            />

            <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
              Hii statement inatoa sales, expenses, net profit, payment breakdown, na outstanding
              balances kwa period uliyochagua.
            </Text>
          </Card>

          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
            Capital Recovery Records
          </Text>

          {capitalRows.length === 0 ? (
            <View style={{ paddingTop: 4, alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                No capital recovery records found.
              </Text>
            </View>
          ) : (
            capitalRows.slice(0, 10).map((item) => {
              const isCost = item.entry_type === "COST";
              const isIncome = item.entry_type === "INCOME";

              return (
                <Card key={item.id} style={{ marginBottom: 12, gap: 8 }}>
                  <Text
                    style={{
                      color: isCost
                        ? theme.colors.danger
                        : isIncome
                        ? theme.colors.emerald
                        : theme.colors.text,
                      fontWeight: "900",
                      fontSize: 16,
                    }}
                  >
                    {item.entry_type} — {fmtMoney(item.amount)}
                  </Text>

                  {!!item.note && (
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                      {item.note}
                    </Text>
                  )}

                  <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                    {safeWhenLabel(item.created_at)}
                  </Text>

                  <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
                    Recorded by: {item.created_by_name || item.created_by || "Unknown"}
                  </Text>
                </Card>
              );
            })
          )}

          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
            Recent Sales In Statement
          </Text>

          {loading ? (
            <View style={{ paddingTop: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Loading statement data...
              </Text>
            </View>
          ) : salesRows.length === 0 ? (
            <View style={{ paddingTop: 4, alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                No sales found.
              </Text>
            </View>
          ) : (
            salesRows.slice(0, 8).map((item, idx) => {
              const saleId = String(item.sale_id ?? "").trim();
              return (
                <Card key={`${saleId}-${idx}`} style={{ marginBottom: 12, gap: 10 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    Sale {saleId ? saleId.slice(0, 8) : "—"}
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    When:{" "}
                    <Text style={{ color: theme.colors.text }}>
                      {safeWhenLabel(item.sold_at)}
                    </Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Qty: <Text style={{ color: theme.colors.text }}>{toNum(item.total_qty ?? 0)}</Text>
                    {"   "}•{"   "}
                    Amount:{" "}
                    <Text style={{ color: theme.colors.text }}>
                      {fmtMoney(toNum(item.total_amount ?? 0))}
                    </Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Method:{" "}
                    <Text style={{ color: theme.colors.text }}>
                      {String(item.payment_method ?? "—").toUpperCase()}
                    </Text>
                  </Text>
                </Card>
              );
            })
          )}

          <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
            Recent Expenses In Statement
          </Text>

          {loading ? null : expenseRows.length === 0 ? (
            <View style={{ paddingTop: 4, alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                No expenses found.
              </Text>
            </View>
          ) : (
            expenseRows.slice(0, 8).map((item) => (
              <Card key={item.id} style={{ marginBottom: 12, gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  {item.title}
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Category: <Text style={{ color: theme.colors.text }}>{item.category ?? "—"}</Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  When: <Text style={{ color: theme.colors.text }}>{safeWhenLabel(item.spent_at)}</Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Amount: <Text style={{ color: theme.colors.text }}>{fmtMoney(item.amount)}</Text>
                </Text>

                {!!String(item.note ?? "").trim() && (
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    Note: <Text style={{ color: theme.colors.text }}>{String(item.note ?? "").trim()}</Text>
                  </Text>
                )}
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}