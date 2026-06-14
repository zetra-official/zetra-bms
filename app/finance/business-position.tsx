// app/finance/business-position.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import SafeIcon from "@/src/ui/SafeIcon";
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type LoanRow = {
  id: string;
  store_id: string;
  store_name: string;
  borrower_name: string;
  borrower_phone: string | null;
  principal_amount: number;
  repaid_amount: number;
  total_due_amount?: number;
  balance_amount: number;
  interest_enabled?: boolean;
  interest_rate_percent?: number | null;
  accrued_interest_amount?: number | null;
  interest_profit_amount?: number | null;
  purpose: string | null;
  loan_date: string;
  due_date: string | null;
  status: "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";
  is_overdue: boolean;
};

type SummaryRow = {
  total_loans: number;
  total_repaid: number;
  total_balance: number;
  open_count: number;
  partial_count: number;
  paid_count: number;
  overdue_count: number;
};

type BusinessProfitPositionRow = {
  principal_out_total: number;
  repaid_total: number;
  outstanding_total: number;
  interest_profit_total: number;
  accrued_interest_total: number;
  active_loans: number;
};

type TabKey = "OVERVIEW" | "LOANS" | "REPAYMENTS";

type LoanPaymentRow = {
  id: string;
  loan_id: string;
  store_id: string;
  amount: number;
  principal_amount?: number | null;
  interest_amount?: number | null;
  note: string | null;
  payment_date: string;
  created_at: string;
};

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(x: any) {
  const d = new Date(String(x ?? ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function getLoanInterestExpected(x: LoanRow | null) {
  if (!x) return 0;
  return Math.max(0, toNum(x.total_due_amount || x.balance_amount + x.repaid_amount) - toNum(x.principal_amount));
}

function getLoanPrincipalRecovered(x: LoanRow | null) {
  if (!x) return 0;
  return Math.min(toNum(x.repaid_amount), toNum(x.principal_amount));
}

function getLoanInterestRecovered(x: LoanRow | null) {
  if (!x) return 0;
  return Math.max(0, toNum(x.interest_profit_amount) || toNum(x.repaid_amount) - toNum(x.principal_amount));
}

function getLoanInterestRemaining(x: LoanRow | null) {
  if (!x) return 0;
  return Math.max(0, getLoanInterestExpected(x) - getLoanInterestRecovered(x));
}

function getLoanProfitStatus(x: LoanRow | null) {
  if (!x || !x.interest_enabled) return "NO INTEREST";
  const paid = getLoanInterestRecovered(x);
  const expected = getLoanInterestExpected(x);
  if (expected <= 0) return "NO PROFIT YET";
  if (paid <= 0) return "NOT PAID";
  if (paid < expected) return "PARTIAL";
  return "COMPLETED";
}

function getLoanTone(status: string, overdue?: boolean) {
  if (overdue) {
    return {
      label: "OVERDUE",
      border: "rgba(201,74,74,0.38)",
      bg: "rgba(201,74,74,0.10)",
      text: UI.danger,
    };
  }

  const s = String(status ?? "").toUpperCase();

  if (s === "PAID") {
    return {
      label: "PAID",
      border: "rgba(42,168,118,0.38)",
      bg: "rgba(42,168,118,0.10)",
      text: UI.success,
    };
  }

  if (s === "PARTIAL") {
    return {
      label: "PARTIAL",
      border: "rgba(245,158,11,0.38)",
      bg: "rgba(245,158,11,0.10)",
      text: "#B45309",
    };
  }

  if (s === "CANCELLED") {
    return {
      label: "CANCELLED",
      border: "rgba(100,116,139,0.30)",
      bg: "rgba(100,116,139,0.08)",
      text: UI.muted,
    };
  }

  return {
    label: "OPEN",
    border: "rgba(59,130,246,0.32)",
    bg: "rgba(59,130,246,0.10)",
    text: "#2563EB",
  };
}

export default function BusinessPositionScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const isDesktopWeb = Platform.OS === "web" && width >= 900;
  const pageMaxWidth = isDesktopWeb ? 1180 : undefined;
  const pagePaddingX = isDesktopWeb ? 28 : 14;
  const org = useOrg();

  const orgId = String(org.activeOrgId ?? "").trim();
  const storeId = String(org.activeStoreId ?? "").trim();
  const role = String(org.activeRole ?? "").toLowerCase();
  const canWrite = role === "owner" || role === "admin";

  const money = useOrgMoneyPrefs(orgId);
  const fmt = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency: money.currency || "TZS",
        locale: money.locale || "en-TZ",
      }).replace(/\s+/g, " "),
    [money.currency, money.locale]
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow>({
    total_loans: 0,
    total_repaid: 0,
    total_balance: 0,
    open_count: 0,
    partial_count: 0,
    paid_count: 0,
    overdue_count: 0,
  });

  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [borrowerNote, setBorrowerNote] = useState("");
  const [dueDate, setDueDate] = useState("");

const [repayLoanId, setRepayLoanId] = useState("");
const [repayAmount, setRepayAmount] = useState("");

const [interestEnabled, setInterestEnabled] = useState(false);
const [interestRate, setInterestRate] = useState("");

const [tab, setTab] = useState<TabKey>("OVERVIEW");
const [search, setSearch] = useState("");
const [repaymentSearch, setRepaymentSearch] = useState("");
const [statusFilter, setStatusFilter] = useState<"ALL" | LoanRow["status"]>("ALL");
const [repaymentStatusFilter, setRepaymentStatusFilter] = useState<"ALL" | "OPEN" | "PARTIAL">("ALL");

const [loanPayments, setLoanPayments] = useState<LoanPaymentRow[]>([]);
const [paymentsLoading, setPaymentsLoading] = useState(false);

const [exportingPdf, setExportingPdf] = useState(false);

const [profitPosition, setProfitPosition] = useState<BusinessProfitPositionRow>({
  principal_out_total: 0,
  repaid_total: 0,
  outstanding_total: 0,
  interest_profit_total: 0,
  accrued_interest_total: 0,
  active_loans: 0,
});

  const load = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    try {
      const [summaryRes, loansRes, profitPositionRes] = await Promise.all([
        supabase.rpc("get_business_loan_summary", {
          p_organization_id: orgId,
          p_store_id: null,
        } as any),
        supabase.rpc("get_business_loans", {
          p_organization_id: orgId,
          p_store_id: null,
          p_status: null,
        } as any),
        supabase.rpc("get_business_profit_position_v1", {
          p_organization_id: orgId,
          p_store_id: null,
        } as any),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (loansRes.error) throw loansRes.error;

      const s = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;

      setSummary({
        total_loans: toNum(s?.total_loans),
        total_repaid: toNum(s?.total_repaid),
        total_balance: toNum(s?.total_balance),
        open_count: toNum(s?.open_count),
        partial_count: toNum(s?.partial_count),
        paid_count: toNum(s?.paid_count),
        overdue_count: toNum(s?.overdue_count),
      });

      setLoans((Array.isArray(loansRes.data) ? loansRes.data : []) as LoanRow[]);

      if (!profitPositionRes.error) {
        const p = Array.isArray(profitPositionRes.data)
          ? profitPositionRes.data[0]
          : profitPositionRes.data;

        setProfitPosition({
          principal_out_total: toNum(p?.principal_out_total),
          repaid_total: toNum(p?.repaid_total),
          outstanding_total: toNum(p?.outstanding_total),
          interest_profit_total: toNum(p?.interest_profit_total),
          accrued_interest_total: toNum(p?.accrued_interest_total),
          active_loans: toNum(p?.active_loans),
        });
      }
    } catch (e: any) {
      Alert.alert("Business Position", e?.message ?? "Failed to load loans");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

const activeLoans = useMemo(
  () => loans.filter((x) => x.status !== "PAID" && x.status !== "CANCELLED"),
  [loans]
);

const visibleLoans = useMemo(() => {
  const q = search.trim().toLowerCase();
  const base = statusFilter === "ALL" ? loans : loans.filter((x) => x.status === statusFilter);
  if (!q) return base;

  return base.filter((x) => {
    return (
      String(x.borrower_name ?? "").toLowerCase().includes(q) ||
      String(x.borrower_phone ?? "").toLowerCase().includes(q) ||
      String(x.store_name ?? "").toLowerCase().includes(q) ||
      String(x.status ?? "").toLowerCase().includes(q)
    );
  });
}, [loans, search, statusFilter]);

const selectedLoan = useMemo(
  () => loans.find((x) => x.id === repayLoanId) ?? null,
  [loans, repayLoanId]
);

const interestPreview = useMemo(() => {
  const principal = Number(amount);
  const rate = Number(interestRate);

  if (!interestEnabled || !Number.isFinite(principal) || principal <= 0) {
    return { interest: 0, total: principal > 0 ? principal : 0 };
  }

  if (!Number.isFinite(rate) || rate <= 0) {
    return { interest: 0, total: principal };
  }

  const interest = principal * (rate / 100);
  return {
    interest,
    total: principal + interest,
  };
}, [amount, interestEnabled, interestRate]);
const visibleRepaymentLoans = useMemo(() => {
  const q = repaymentSearch.trim().toLowerCase();

  const base =
    repaymentStatusFilter === "ALL"
      ? activeLoans
      : activeLoans.filter((x) => x.status === repaymentStatusFilter);

  if (!q) return base;

  return base.filter((x) => {
    return (
      String(x.borrower_name ?? "").toLowerCase().includes(q) ||
      String(x.borrower_phone ?? "").toLowerCase().includes(q) ||
      String(x.store_name ?? "").toLowerCase().includes(q) ||
      String(x.status ?? "").toLowerCase().includes(q)
    );
  });
}, [activeLoans, repaymentSearch, repaymentStatusFilter]);
const recoveryRate = useMemo(() => {
  if (summary.total_loans <= 0) return 0;
  return Math.min(100, (summary.total_repaid / Math.max(1, summary.total_loans)) * 100);
}, [summary.total_loans, summary.total_repaid]);

const topBorrower = useMemo(() => {
  const rows = [...activeLoans].sort((a, b) => toNum(b.balance_amount) - toNum(a.balance_amount));
  return rows[0] ?? null;
}, [activeLoans]);

const exposureLevel = useMemo(() => {
  if (summary.total_balance <= 0) return "HEALTHY";
  if (summary.overdue_count > 0) return "RISK";
  if (recoveryRate < 25) return "OPEN";
  return "WATCH";
}, [summary.total_balance, summary.overdue_count, recoveryRate]);

const exposureMessage = useMemo(() => {
  if (exposureLevel === "HEALTHY") return "Hakuna loan exposure kubwa kwa sasa.";
  if (exposureLevel === "RISK") return "Kuna mikopo imechelewa kulipwa. Follow-up inahitajika.";
  if (exposureLevel === "WATCH") return "Mikopo ipo active, lakini repayments zimeanza kuingia.";
  return "Fedha ya biashara ipo nje ya store, inahitaji ufuatiliaji wa karibu.";
}, [exposureLevel]);

const loadLoanPayments = useCallback(async (loanId: string) => {
  const id = String(loanId ?? "").trim();
  if (!id) {
    setLoanPayments([]);
    return;
  }

  setPaymentsLoading(true);
  try {
    const { data, error } = await supabase.rpc("get_business_loan_payments", {
      p_loan_id: id,
    } as any);

    if (error) throw error;
    setLoanPayments((Array.isArray(data) ? data : []) as LoanPaymentRow[]);
  } catch {
    setLoanPayments([]);
  } finally {
    setPaymentsLoading(false);
  }
}, []);

const selectLoan = useCallback(
  (loanId: string) => {
    setRepayLoanId(loanId);
    void loadLoanPayments(loanId);
  },
  [loadLoanPayments]
);

  const createLoan = useCallback(async () => {
    if (!canWrite) return;
    if (!orgId || !storeId) {
      Alert.alert("Business Loan", "Hakuna active org/store iliyochaguliwa.");
      return;
    }

    const n = Number(amount);
    if (!borrowerName.trim() || !Number.isFinite(n) || n <= 0) {
      Alert.alert("Business Loan", "Weka jina na kiasi sahihi.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_business_loan", {
        p_organization_id: orgId,
        p_store_id: storeId,
        p_borrower_name: borrowerName.trim(),
        p_principal_amount: n,
        p_purpose: purpose.trim() || null,
        p_borrower_phone: borrowerPhone.trim() || null,
        p_borrower_note: borrowerNote.trim() || null,
        p_due_date: dueDate.trim() || null,
p_interest_enabled: interestEnabled,
p_interest_rate_percent: interestEnabled ? Number(interestRate) || null : null,
      } as any);

      if (error) throw error;

      setBorrowerName("");
      setBorrowerPhone("");
      setAmount("");
      setPurpose("");
   setBorrowerNote("");
setDueDate("");
setInterestEnabled(false);
setInterestRate("");
await load();
      Alert.alert("Success", "Mkopo wa biashara umehifadhiwa.");
    } catch (e: any) {
      Alert.alert("Business Loan", e?.message ?? "Imeshindikana kuhifadhi mkopo.");
    } finally {
      setSaving(false);
    }
  }, [amount, borrowerName, borrowerPhone, borrowerNote, canWrite, dueDate, interestEnabled, interestRate, load, orgId, purpose, storeId]);

  const recordRepayment = useCallback(async () => {
    if (!canWrite) return;
    const n = Number(repayAmount);
    if (!repayLoanId || !Number.isFinite(n) || n <= 0 || !storeId) {
      Alert.alert("Repayment", "Chagua loan na weka kiasi sahihi.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("record_business_loan_payment", {
        p_loan_id: repayLoanId,
        p_store_id: storeId,
        p_amount: n,
        p_note: null,
      } as any);

      if (error) throw error;

   setRepayLoanId("");
setRepayAmount("");
setLoanPayments([]);
await load();
      Alert.alert("Success", "Malipo ya mkopo yamehifadhiwa.");
    } catch (e: any) {
      Alert.alert("Repayment", e?.message ?? "Imeshindikana kuhifadhi malipo.");
    } finally {
      setSaving(false);
    }
  }, [canWrite, load, repayAmount, repayLoanId, storeId]);

  const exportBusinessPositionPdf = useCallback(async () => {
    if (exportingPdf) return;

    setExportingPdf(true);
    try {
      const rows = loans
        .map((l) => {
          return `
            <tr>
              <td>${l.borrower_name}</td>
              <td>${l.store_name}</td>
              <td>${l.status}</td>
              <td>${fmt(toNum(l.principal_amount))}</td>
              <td>${fmt(toNum(l.repaid_amount))}</td>
              <td>${fmt(toNum(l.balance_amount))}</td>
              <td>${l.interest_enabled ? `${toNum(l.interest_rate_percent)}%` : "-"}</td>
              <td>${fmt(getLoanInterestExpected(l))}</td>
              <td>${fmt(getLoanInterestRecovered(l))}</td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
              h1 { margin: 0; font-size: 24px; }
              h2 { margin-top: 24px; font-size: 16px; }
              .muted { color: #64748b; font-size: 12px; }
              .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
              .box { border: 1px solid #dbeafe; border-radius: 12px; padding: 12px; background: #f8fbff; }
              .label { color: #64748b; font-size: 11px; font-weight: bold; }
              .value { font-size: 16px; font-weight: bold; margin-top: 6px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
              th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
              th { background: #f1f5f9; }
            </style>
          </head>
          <body>
            <h1>ZETRA BMS - Business Position Report</h1>
            <div class="muted">Generated: ${new Date().toLocaleString()}</div>

            <div class="grid">
              <div class="box"><div class="label">Given Out</div><div class="value">${fmt(summary.total_loans)}</div></div>
              <div class="box"><div class="label">Repaid</div><div class="value">${fmt(summary.total_repaid)}</div></div>
              <div class="box"><div class="label">Balance</div><div class="value">${fmt(summary.total_balance)}</div></div>
              <div class="box"><div class="label">Interest Profit</div><div class="value">${fmt(profitPosition.interest_profit_total)}</div></div>
              <div class="box"><div class="label">Accrued Interest</div><div class="value">${fmt(profitPosition.accrued_interest_total)}</div></div>
              <div class="box"><div class="label">Overdue</div><div class="value">${summary.overdue_count}</div></div>
            </div>

            <h2>Loans Details</h2>
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>Given</th>
                  <th>Repaid</th>
                  <th>Balance</th>
                  <th>Rate</th>
                  <th>Expected Interest</th>
                  <th>Interest Paid</th>
                </tr>
              </thead>
              <tbody>${rows || "<tr><td colspan='9'>No loans found</td></tr>"}</tbody>
            </table>
          </body>
        </html>
      `;

      const file = await Print.printToFileAsync({ html });

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Business Position PDF",
        });
      } else {
        Alert.alert("PDF Ready", file.uri);
      }
    } catch (e: any) {
      Alert.alert("PDF Report", e?.message ?? "Imeshindikana kutengeneza PDF.");
    } finally {
      setExportingPdf(false);
    }
  }, [exportingPdf, fmt, loans, profitPosition, summary]);

  const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <View
      style={{
        flex: isDesktopWeb ? undefined : 1,
        width: isDesktopWeb ? "15.8%" : undefined,
        minWidth: isDesktopWeb ? 150 : 140,
        borderWidth: 1,
        borderColor: "rgba(96,165,250,0.22)",
        backgroundColor: "#F7FAFF",
        borderRadius: 16,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 11 }}>{label}</Text>
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
        {value}
      </Text>
      {!!hint && <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>{hint}</Text>}
    </View>
  );

  return (
    <Screen
  scroll
  contentStyle={{
    paddingTop: 14,
    paddingHorizontal: pagePaddingX,
    paddingBottom: 320,
    width: "100%",
    maxWidth: pageMaxWidth,
    alignSelf: "center",
  }}
>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SafeIcon name="arrow-back" size={18} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
            Business Position
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800" }}>
            Loans & money given out
          </Text>
        </View>

        <Pressable
          onPress={exportBusinessPositionPdf}
          disabled={exportingPdf}
          style={{
            height: 42,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(59,130,246,0.32)",
            backgroundColor: "rgba(59,130,246,0.12)",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
          }}
        >
          {exportingPdf ? (
            <ActivityIndicator />
          ) : (
            <SafeIcon name="document-text-outline" size={17} color={UI.text} />
          )}
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
            PDF
          </Text>
        </Pressable>

        <Pressable onPress={() => void load()}>
          {loading ? <ActivityIndicator /> : <SafeIcon name="refresh" size={20} color={UI.text} />}
        </Pressable>
      </View>

      <View style={{ height: 14 }} />

      <Card style={{ gap: 12, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Loans Summary</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Given Out" value={fmt(summary.total_loans)} />
          <Stat label="Repaid" value={fmt(summary.total_repaid)} />
          <Stat label="Balance" value={fmt(summary.total_balance)} />
          <Stat label="Interest Profit" value={fmt(profitPosition.interest_profit_total)} />
          <Stat label="Accrued Interest" value={fmt(profitPosition.accrued_interest_total)} />
          <Stat label="Overdue" value={String(summary.overdue_count)} />
        </View>
      </Card>

      <View style={{ height: 12 }} />

      <Card style={{ gap: 10, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
          Business Position Controls
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["OVERVIEW", "LOANS", "REPAYMENTS"] as TabKey[]).map((x) => (
            <Pressable
              key={x}
              onPress={() => setTab(x)}
              style={{
                flex: 1,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: tab === x ? "rgba(42,168,118,0.40)" : "rgba(96,165,250,0.20)",
                backgroundColor: tab === x ? "rgba(42,168,118,0.12)" : "rgba(255,255,255,0.45)",
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{x}</Text>
            </Pressable>
          ))}
        </View>

        {!canWrite ? (
          <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
            Unaweza kuona business position, lakini kurekodi loans na repayments ni Owner/Admin only.
          </Text>
        ) : null}
      </Card>

      

     {tab === "OVERVIEW" ? (
        <>
          <View style={{ height: 12 }} />

          <Card style={{ gap: 12, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              Position Overview
            </Text>

            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor:
                  exposureLevel === "RISK"
                    ? "rgba(201,74,74,0.32)"
                    : exposureLevel === "HEALTHY"
                    ? "rgba(42,168,118,0.32)"
                    : "rgba(245,158,11,0.28)",
                backgroundColor:
                  exposureLevel === "RISK"
                    ? "rgba(201,74,74,0.08)"
                    : exposureLevel === "HEALTHY"
                    ? "rgba(42,168,118,0.08)"
                    : "rgba(245,158,11,0.08)",
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                Exposure Level: {exposureLevel}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 20 }}>
                {exposureMessage}
              </Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Stat label="Open" value={String(summary.open_count)} />
              <Stat label="Partial" value={String(summary.partial_count)} />
              <Stat label="Paid" value={String(summary.paid_count)} />
              <Stat label="Active" value={String(activeLoans.length)} />
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Stat label="Recovery Rate" value={`${recoveryRate.toFixed(1)}%`} />
              <Stat label="Cash Exposure" value={fmt(summary.total_balance)} />
              <Stat
                label="Interest Profit"
                value={fmt(profitPosition.interest_profit_total)}
                hint="faida halisi ya riba iliyolipwa"
              />
              <Stat
                label="Accrued Interest"
                value={fmt(profitPosition.accrued_interest_total)}
                hint="riba iliyoiva lakini haijalipwa"
              />
              <Stat
                label="Top Borrower"
                value={topBorrower ? topBorrower.borrower_name : "—"}
                hint={topBorrower ? fmt(toNum(topBorrower.balance_amount)) : "no active borrower"}
              />
            </View>

            <Text style={{ color: UI.faint, fontWeight: "800", lineHeight: 20 }}>
              Loans zinazorekodiwa hapa ni fedha iliyotoka kwenye biashara. Principal haichanganywi na sales/cashier.
              Faida ya riba iliyolipwa inaonekana kama Interest Profit kwa ajili ya business position.
            </Text>
          </Card>
        </>
      ) : null}

      {tab === "LOANS" ? (
        <>
          {canWrite ? (
            <>
              <View style={{ height: 12 }} />

              <Card style={{ gap: 10, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  Record Loan
                </Text>

                <TextInput
                  value={borrowerName}
                  onChangeText={setBorrowerName}
                  placeholder="Borrower name"
                  placeholderTextColor={UI.faint}
                  style={{
                    color: UI.text,
                    borderWidth: 1,
                    borderColor: "rgba(96,165,250,0.22)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                />

                <TextInput
                  value={borrowerPhone}
                  onChangeText={setBorrowerPhone}
                  placeholder="Phone optional"
                  placeholderTextColor={UI.faint}
                  style={{
                    color: UI.text,
                    borderWidth: 1,
                    borderColor: "rgba(96,165,250,0.22)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                />

                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Amount"
                  keyboardType="numeric"
                  placeholderTextColor={UI.faint}
                  style={{
                    color: UI.text,
                    borderWidth: 1,
                    borderColor: "rgba(96,165,250,0.22)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                />

             <TextInput
  value={dueDate}
  onChangeText={setDueDate}
  placeholder="Due date optional (YYYY-MM-DD)"
  placeholderTextColor={UI.faint}
  style={{
    color: UI.text,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.22)",
    borderRadius: 14,
    padding: 12,
  }}
/>

<Pressable
  onPress={() => setInterestEnabled((v) => !v)}
  style={{
    borderRadius: 14,
    borderWidth: 1,
    borderColor: interestEnabled ? "rgba(42,168,118,0.40)" : "rgba(96,165,250,0.22)",
    backgroundColor: interestEnabled ? "rgba(42,168,118,0.12)" : "rgba(255,255,255,0.45)",
    padding: 12,
  }}
>
  <Text style={{ color: UI.text, fontWeight: "900" }}>
    {interestEnabled ? "Interest Enabled" : "Interest Disabled"}
  </Text>
  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
    Riba ni optional. Ukiwasha, mfumo utaongeza riba ya mwezi kwenye balance iliyobaki.
  </Text>
</Pressable>

{interestEnabled ? (
  <>
    <TextInput
      value={interestRate}
      onChangeText={setInterestRate}
      placeholder="Monthly interest % mfano 10"
      keyboardType="numeric"
      placeholderTextColor={UI.faint}
      style={{
        color: UI.text,
        borderWidth: 1,
        borderColor: "rgba(96,165,250,0.22)",
        borderRadius: 14,
        padding: 12,
      }}
    />

    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(245,158,11,0.28)",
        backgroundColor: "rgba(245,158,11,0.08)",
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: UI.text, fontWeight: "900" }}>
        First Month Preview
      </Text>
      <Text style={{ color: UI.muted, fontWeight: "800" }}>
        Riba ya mwezi wa kwanza: {fmt(toNum(interestPreview.interest))}
      </Text>
      <Text style={{ color: UI.text, fontWeight: "900" }}>
        Jumla anayotarajiwa kulipa: {fmt(toNum(interestPreview.total))}
      </Text>
    </View>
  </>
) : null}

                <TextInput
                  value={borrowerNote}
                  onChangeText={setBorrowerNote}
                  placeholder="Borrower note optional"
                  placeholderTextColor={UI.faint}
                  multiline
                  style={{
                    color: UI.text,
                    borderWidth: 1,
                    borderColor: "rgba(96,165,250,0.22)",
                    borderRadius: 14,
                    padding: 12,
                    minHeight: 76,
                    textAlignVertical: "top",
                  }}
                />

                <Pressable
                  onPress={createLoan}
                  disabled={saving}
                  style={{
                    borderRadius: 16,
                    backgroundColor: "rgba(42,168,118,0.14)",
                    borderWidth: 1,
                    borderColor: "rgba(42,168,118,0.35)",
                    padding: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {saving ? "Saving..." : "Save Business Loan"}
                  </Text>
                </Pressable>
              </Card>
            </>
          ) : null}

          <View style={{ height: 12 }} />

          <Card style={{ gap: 10, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              All Loans
            </Text>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search borrower, phone, store, status"
              placeholderTextColor={UI.faint}
              style={{
                color: UI.text,
                borderWidth: 1,
                borderColor: "rgba(96,165,250,0.22)",
                borderRadius: 14,
                padding: 12,
              }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["ALL", "OPEN", "PARTIAL", "PAID", "CANCELLED"] as const).map((x) => (
                <Pressable
                  key={x}
                  onPress={() => setStatusFilter(x)}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor:
                      statusFilter === x ? "rgba(42,168,118,0.40)" : "rgba(96,165,250,0.20)",
                    backgroundColor:
                      statusFilter === x ? "rgba(42,168,118,0.12)" : "rgba(255,255,255,0.45)",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{x}</Text>
                </Pressable>
              ))}
            </View>

            {visibleLoans.length ? (
              <View
                style={{
                  flexDirection: isDesktopWeb ? "row" : "column",
                  flexWrap: isDesktopWeb ? "wrap" : "nowrap",
                  gap: 12,
                }}
              >
              {visibleLoans.map((l) => (
                <Pressable
                  key={l.id}
                 onPress={() => {
  selectLoan(l.id);
  setTab("REPAYMENTS");
}}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor:
                      repayLoanId === l.id
                        ? "rgba(42,168,118,0.45)"
                        : "rgba(96,165,250,0.18)",
                    backgroundColor:
                      repayLoanId === l.id
                        ? "rgba(42,168,118,0.10)"
                        : "rgba(255,255,255,0.55)",
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>{l.borrower_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
                      {l.store_name} • {fmtDate(l.loan_date)}
                      {l.due_date ? ` • Due ${fmtDate(l.due_date)}` : ""}
                    </Text>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: getLoanTone(l.status, l.is_overdue).border,
                        backgroundColor: getLoanTone(l.status, l.is_overdue).bg,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{
                          color: getLoanTone(l.status, l.is_overdue).text,
                          fontWeight: "900",
                          fontSize: 11,
                        }}
                      >
                        {getLoanTone(l.status, l.is_overdue).label}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    Balance: {fmt(toNum(l.balance_amount))}
                  </Text>
                  <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
                    Given: {fmt(toNum(l.principal_amount))} • Repaid:{" "}
                    {fmt(toNum(l.repaid_amount))}
                  </Text>

                  {l.interest_enabled ? (
                    <Text style={{ color: "#B45309", fontWeight: "900", fontSize: 12 }}>
                      Riba: {toNum(l.interest_rate_percent)}% • Expected Interest:{" "}
                      {fmt(getLoanInterestExpected(l))}
                    </Text>
                  ) : null}
                  {!!l.purpose && (
                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Purpose: {l.purpose}
                    </Text>
                  )}
                </Pressable>
              ))}
              </View>
            ) : (
              <Text style={{ color: UI.muted, fontWeight: "800" }}>No loans found.</Text>
            )}
          </Card>
        </>
      ) : null}

      {tab === "REPAYMENTS" ? (
        <>
          <View style={{ height: 12 }} />

          <Card style={{ gap: 10, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              Select Loan for Repayment
            </Text>

            <TextInput
              value={repaymentSearch}
              onChangeText={setRepaymentSearch}
              placeholder="Search active borrower, phone, store, status"
              placeholderTextColor={UI.faint}
              style={{
                color: UI.text,
                borderWidth: 1,
                borderColor: "rgba(96,165,250,0.22)",
                borderRadius: 14,
                padding: 12,
              }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["ALL", "OPEN", "PARTIAL"] as const).map((x) => (
                <Pressable
                  key={x}
                  onPress={() => setRepaymentStatusFilter(x)}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor:
                      repaymentStatusFilter === x
                        ? "rgba(42,168,118,0.40)"
                        : "rgba(96,165,250,0.20)",
                    backgroundColor:
                      repaymentStatusFilter === x
                        ? "rgba(42,168,118,0.12)"
                        : "rgba(255,255,255,0.45)",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>{x}</Text>
                </Pressable>
              ))}
            </View>

            {visibleRepaymentLoans.length ? (
              <View
                style={{
                  flexDirection: isDesktopWeb ? "row" : "column",
                  flexWrap: isDesktopWeb ? "wrap" : "nowrap",
                  gap: 12,
                }}
              >
              {visibleRepaymentLoans.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => selectLoan(l.id)}
                  style={{
                    width: isDesktopWeb ? "49%" : "100%",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor:
                      repayLoanId === l.id
                        ? "rgba(42,168,118,0.45)"
                        : "rgba(96,165,250,0.18)",
                    backgroundColor:
                      repayLoanId === l.id
                        ? "rgba(42,168,118,0.10)"
                        : "rgba(255,255,255,0.55)",
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>{l.borrower_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: UI.muted, fontWeight: "800", flex: 1 }}>
                      {l.store_name} • {fmtDate(l.loan_date)}
                      {l.due_date ? ` • Due ${fmtDate(l.due_date)}` : ""}
                    </Text>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: getLoanTone(l.status, l.is_overdue).border,
                        backgroundColor: getLoanTone(l.status, l.is_overdue).bg,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{
                          color: getLoanTone(l.status, l.is_overdue).text,
                          fontWeight: "900",
                          fontSize: 11,
                        }}
                      >
                        {getLoanTone(l.status, l.is_overdue).label}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    Balance: {fmt(toNum(l.balance_amount))}
                  </Text>
                </Pressable>
              ))}
              </View>
            ) : (
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                No active loans match this filter.
              </Text>
            )}
          </Card>

          {canWrite ? (
            <>
              <View style={{ height: 12 }} />

              <Card style={{ gap: 10, borderRadius: 22, backgroundColor: "#F7FAFF" }}>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  Record Repayment
                </Text>

                {selectedLoan ? (
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(42,168,118,0.28)",
                      backgroundColor: "rgba(42,168,118,0.08)",
                      padding: 12,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      {selectedLoan.borrower_name}
                    </Text>
                    <Text style={{ color: UI.muted, fontWeight: "800" }}>
                      Balance: {fmt(toNum(selectedLoan.balance_amount))}
                    </Text>

                    <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12 }}>
                      Given: {fmt(toNum(selectedLoan.principal_amount))} • Repaid:{" "}
                      {fmt(toNum(selectedLoan.repaid_amount))}
                    </Text>

                    {!!selectedLoan.borrower_phone && (
                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Phone: {selectedLoan.borrower_phone}
                      </Text>
                    )}

                    {!!selectedLoan.due_date && (
                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Due Date: {fmtDate(selectedLoan.due_date)}
                      </Text>
                    )}

                    {!!selectedLoan.purpose && (
                      <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                        Purpose: {selectedLoan.purpose}
                      </Text>
                    )}

                 {selectedLoan.interest_enabled ? (
  <View style={{ gap: 3 }}>
    <Text style={{ color: "#B45309", fontWeight: "900", fontSize: 12 }}>
      Riba: {toNum(selectedLoan.interest_rate_percent)}% • Expected Interest:{" "}
      {fmt(getLoanInterestExpected(selectedLoan))}
    </Text>
    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
      Interest Paid: {fmt(getLoanInterestRecovered(selectedLoan))} • Remaining:{" "}
      {fmt(getLoanInterestRemaining(selectedLoan))}
    </Text>
    <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>
      Profit Status: {getLoanProfitStatus(selectedLoan)}
    </Text>
  </View>
) : null}
                  </View>
                ) : (
                  <Text style={{ color: UI.muted, fontWeight: "800" }}>
                    Chagua active loan hapo juu, kisha weka kiasi cha repayment.
                  </Text>
                )}

                {selectedLoan ? (
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(96,165,250,0.18)",
                      backgroundColor: "rgba(255,255,255,0.45)",
                      padding: 12,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>
                      Repayment History
                    </Text>

                    {paymentsLoading ? (
                      <ActivityIndicator />
                    ) : loanPayments.length ? (
                      loanPayments.map((p) => (
                        <View
                          key={p.id}
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: "rgba(96,165,250,0.14)",
                            paddingTop: 8,
                            gap: 3,
                          }}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900" }}>
                            {fmt(toNum(p.amount))}
                          </Text>
                        <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
  Principal: {fmt(toNum(p.principal_amount))} • Interest: {fmt(toNum(p.interest_amount))}
</Text>
<Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
  {fmtDate(p.payment_date || p.created_at)}
  {p.note ? ` • ${p.note}` : ""}
</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: UI.muted, fontWeight: "800" }}>
                        No repayments recorded yet.
                      </Text>
                    )}
                  </View>
                ) : null}

                <TextInput
                  value={repayAmount}
                  onChangeText={setRepayAmount}
                  placeholder="Repayment amount"
                  keyboardType="numeric"
                  placeholderTextColor={UI.faint}
                  style={{
                    color: UI.text,
                    borderWidth: 1,
                    borderColor: "rgba(96,165,250,0.22)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                />

                <Pressable
                  onPress={recordRepayment}
                  disabled={saving || !repayLoanId}
                  style={{
                    width: isDesktopWeb ? "49%" : "100%",
                    borderRadius: 16,
                    backgroundColor: "rgba(59,130,246,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(59,130,246,0.32)",
                    padding: 14,
                    alignItems: "center",
                    opacity: !repayLoanId ? 0.55 : 1,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900" }}>
                    {saving ? "Saving..." : "Save Repayment"}
                  </Text>
                </Pressable>
              </Card>
            </>
          ) : null}
        </>
      ) : null}
      <View style={{ height: 160 }} />
      </Screen>
  );
}