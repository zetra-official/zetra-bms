import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  spent_at: string | null;
  category: string | null;
  note: string | null;
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
  const v = r.category ?? r.expense_category ?? r.type ?? null;
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
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({
    cash_total: 0,
    mobile_total: 0,
    bank_total: 0,
    credit_collected_total: 0,
    grand_paid_total: 0,
    total_sales: 0,
    total_balance: 0,
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
        if (!canView) throw new Error("Business Statement ni kwa owner/admin tu.");
        if (!activeStoreId) throw new Error("No active store selected.");

        const finalRange = overrideRange ?? resolvedRange;
        if (!finalRange) throw new Error("Invalid date range.");

        const access = await supabase.rpc("ensure_my_store_access", {
          p_store_id: activeStoreId,
        });
        if (access.error) throw access.error;

        const [salesRes, payRes, expensesRes] = await Promise.all([
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
          supabase
            .from("expenses")
            .select("*")
            .eq("store_id", activeStoreId)
            .gte("spent_at", finalRange.from)
            .lte("spent_at", finalRange.to)
            .order("spent_at", { ascending: false }),
        ]);

        if (salesRes.error) throw salesRes.error;
        if (payRes.error) throw payRes.error;

        let rawExpenses: AnyRow[] = [];
        if (expensesRes.error) {
          const fallback = await supabase
            .from("expenses")
            .select("*")
            .eq("store_id", activeStoreId)
            .gte("created_at", finalRange.from)
            .lte("created_at", finalRange.to)
            .order("created_at", { ascending: false });

          if (fallback.error) throw fallback.error;
          rawExpenses = (fallback.data ?? []) as AnyRow[];
        } else {
          rawExpenses = (expensesRes.data ?? []) as AnyRow[];
        }

        const sales = ((salesRes.data ?? []) as AnyRow[]).map(normalizeSaleRow);
        sales.sort((a, b) => {
          const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
          const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
          return tb - ta;
        });

        const payRow = Array.isArray(payRes.data) ? (payRes.data[0] ?? null) : payRes.data;

        const expenses: ExpenseRow[] = rawExpenses.map((r) => ({
          id: String(r.id ?? ""),
          title: pickExpenseTitle(r),
          amount: toNum(r.amount ?? 0),
          spent_at: pickExpenseWhen(r),
          category: pickExpenseCategory(r),
          note: pickExpenseNote(r),
        }));

        setSalesRows(sales);
        setExpenseRows(expenses);
        setPaymentSummary({
          cash_total: toNum(payRow?.v_cash_total ?? payRow?.cash_total ?? 0),
          mobile_total: toNum(payRow?.v_mobile_total ?? payRow?.mobile_total ?? 0),
          bank_total: toNum(payRow?.v_bank_total ?? payRow?.bank_total ?? 0),
          credit_collected_total: toNum(
            payRow?.v_credit_collected_total ?? payRow?.credit_collected_total ?? 0
          ),
          grand_paid_total: toNum(payRow?.v_grand_paid_total ?? payRow?.grand_paid_total ?? 0),
          total_sales: toNum(payRow?.v_total_sales ?? payRow?.total_sales ?? 0),
          total_balance: toNum(payRow?.v_total_balance ?? payRow?.total_balance ?? 0),
        });
      } catch (e: any) {
        setSalesRows([]);
        setExpenseRows([]);
        setPaymentSummary({
          cash_total: 0,
          mobile_total: 0,
          bank_total: 0,
          credit_collected_total: 0,
          grand_paid_total: 0,
          total_sales: 0,
          total_balance: 0,
        });
        setErr(e?.message ?? "Failed to load business statement");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeStoreId, canView, resolvedRange]
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

  const totalExpenses = useMemo(
    () => expenseRows.reduce((a, r) => a + toNum(r.amount ?? 0), 0),
    [expenseRows]
  );

  const netProfit = useMemo(
    () => paymentSummary.total_sales - totalExpenses,
    [paymentSummary.total_sales, totalExpenses]
  );

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

  const buildStatementHtml = useCallback(() => {
    const salesRowsHtml = salesRows
      .map((item, idx) => {
        const saleId = escapeHtml(String(item.sale_id ?? "").trim());
        const when = escapeHtml(safeWhenLabel(item.sold_at));
        const qty = escapeHtml(String(toNum(item.total_qty ?? 0)));
        const amount = escapeHtml(fmtMoney(toNum(item.total_amount ?? 0)));
        const method = escapeHtml(String(item.payment_method ?? "—").toUpperCase());
        const paidIn = escapeHtml(fmtMoney(toNum(item.paid_amount ?? 0)));
        const balance = escapeHtml(fmtMoney(toNum(item.balance_amount ?? 0)));
        const status = escapeHtml(String(item.status ?? "COMPLETED").toUpperCase());

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${saleId || "—"}</td>
            <td>${when}</td>
            <td>${qty}</td>
            <td>${amount}</td>
            <td>${method}</td>
            <td>${paidIn}</td>
            <td>${balance}</td>
            <td>${status}</td>
          </tr>
        `;
      })
      .join("");

    const expenseRowsHtml = expenseRows
      .map((item, idx) => {
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.category ?? "—")}</td>
            <td>${escapeHtml(safeWhenLabel(item.spent_at))}</td>
            <td>${escapeHtml(fmtMoney(item.amount))}</td>
            <td>${escapeHtml(item.note ?? "—")}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Business Statement</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 4px 0; font-size: 26px; }
            .sub { color: #4b5563; font-size: 12px; margin-bottom: 20px; }
            .section-title { margin-top: 22px; margin-bottom: 10px; font-size: 16px; font-weight: 700; }
            .grid { width: 100%; border-collapse: collapse; margin-top: 8px; }
            .grid td, .grid th { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; vertical-align: top; }
            .grid th { background: #f3f4f6; text-align: left; }
            .metric { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; }
            .two-col { width: 100%; border-collapse: separate; border-spacing: 10px 10px; }
            .metric-title { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
            .metric-value { font-size: 18px; font-weight: 700; color: #111827; }
            .metric-sub { font-size: 11px; color: #6b7280; margin-top: 6px; }
            .footer { margin-top: 22px; font-size: 11px; color: #6b7280; }
            .ref { font-size: 12px; color: #374151; margin-top: 6px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>Business Statement</h1>
          <div class="sub">
            ${escapeHtml(activeOrgName ?? "—")} • ${escapeHtml(activeStoreName ?? "—")} • ${escapeHtml(activeRole ?? "—")}
          </div>
          <div class="ref">Statement Ref: ${escapeHtml(statementRef)}</div>

          <table class="grid">
            <tr><th style="width:180px;">Organization</th><td>${escapeHtml(activeOrgName ?? "—")}</td></tr>
            <tr><th>Store</th><td>${escapeHtml(activeStoreName ?? "—")}</td></tr>
            <tr><th>Statement Reference</th><td>${escapeHtml(statementRef)}</td></tr>
            <tr><th>Range</th><td>${escapeHtml(rangeTextForPdf)}</td></tr>
            <tr><th>Generated At</th><td>${escapeHtml(new Date().toLocaleString())}</td></tr>
          </table>

          <div class="section-title">Statement Summary</div>
          <table class="two-col">
            <tr>
              <td class="metric">
                <div class="metric-title">Total Sales</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.total_sales))}</div>
                <div class="metric-sub">Mauzo yote ndani ya period hii</div>
              </td>
              <td class="metric">
                <div class="metric-title">Total Expenses</div>
                <div class="metric-value">${escapeHtml(fmtMoney(totalExpenses))}</div>
                <div class="metric-sub">Matumizi yote ndani ya period hii</div>
              </td>
            </tr>
            <tr>
              <td class="metric">
                <div class="metric-title">Net Profit</div>
                <div class="metric-value">${escapeHtml(fmtMoney(netProfit))}</div>
                <div class="metric-sub">Sales minus expenses</div>
              </td>
              <td class="metric">
                <div class="metric-title">Outstanding Credit</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.total_balance))}</div>
                <div class="metric-sub">Balance / mikopo ambayo haijalipwa</div>
              </td>
            </tr>
            <tr>
              <td class="metric">
                <div class="metric-title">Sales Count</div>
                <div class="metric-value">${escapeHtml(String(salesCount))}</div>
                <div class="metric-sub">Idadi ya sales</div>
              </td>
              <td class="metric">
                <div class="metric-title">Expense Count</div>
                <div class="metric-value">${escapeHtml(String(expenseCount))}</div>
                <div class="metric-sub">Idadi ya expense entries</div>
              </td>
            </tr>
          </table>

          <div class="section-title">Payment Breakdown</div>
          <table class="two-col">
            <tr>
              <td class="metric"><div class="metric-title">Cash</div><div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.cash_total))}</div></td>
              <td class="metric"><div class="metric-title">Mobile</div><div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.mobile_total))}</div></td>
            </tr>
            <tr>
              <td class="metric"><div class="metric-title">Bank</div><div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.bank_total))}</div></td>
              <td class="metric"><div class="metric-title">Credit Collected</div><div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.credit_collected_total))}</div></td>
            </tr>
            <tr>
              <td class="metric"><div class="metric-title">Grand Paid In</div><div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.grand_paid_total))}</div></td>
              <td class="metric"><div class="metric-title">Total Qty Sold</div><div class="metric-value">${escapeHtml(String(totalQty))}</div></td>
            </tr>
          </table>

          <div class="section-title">Sales Included</div>
          <table class="grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Sale ID</th>
                <th>When</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Paid In</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${salesRowsHtml || `<tr><td colspan="9">No sales found for this range.</td></tr>`}
            </tbody>
          </table>

          <div class="section-title">Expenses Included</div>
          <table class="grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Category</th>
                <th>When</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRowsHtml || `<tr><td colspan="6">No expenses found for this range.</td></tr>`}
            </tbody>
          </table>

          <div class="footer">
            ZETRA Business Statement • Sales + Expenses + Profit + Balance
          </div>
        </body>
      </html>
    `;
  }, [
    activeOrgName,
    activeRole,
    activeStoreName,
    expenseCount,
    expenseRows,
    fmtMoney,
    netProfit,
    paymentSummary.bank_total,
    paymentSummary.cash_total,
    paymentSummary.credit_collected_total,
    paymentSummary.grand_paid_total,
    paymentSummary.mobile_total,
    paymentSummary.total_balance,
    paymentSummary.total_sales,
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

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Unavailable", "Sharing haipatikani kwenye kifaa hiki.");
        return;
      }

      const html = buildStatementHtml();
      const file = await Print.printToFileAsync({ html, base64: false });

      if (!file?.uri) throw new Error("PDF URI not returned");

      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Business Statement PDF",
        UTI: "com.adobe.pdf",
      });
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

          {!canView && (
            <Card style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>
                Business Statement ni kwa owner/admin tu.
              </Text>
            </Card>
          )}

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