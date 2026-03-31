import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

function clean(s: any) {
  return String(s ?? "").trim();
}
function upper(s: any) {
  return clean(s).toUpperCase();
}

type PlanRow = {
  id?: string;
  code?: string;
  name?: string;
  description?: string;

  monthly_price_tzs?: number;
  price_tzs?: number;
  price_monthly?: number;
  price?: number;
  amount?: number;

  max_organizations?: number;
  max_orgs?: number;

  max_stores?: number;
  maxStores?: number;
  stores_per_org?: number;

  max_staff?: number;
  maxStaff?: number;
  staff_per_org?: number;

  business_club_posts_per_store_month?: number;
  business_club_posts_per_month?: number;
  ai_enabled?: boolean;
  ai_credits_monthly?: number;
  advanced_reports_enabled?: boolean;

  is_public?: boolean;
  is_active?: boolean;

  [k: string]: any;
};

type DurationRow = {
  months: number;
  label?: string;
  discount_percent?: number;
  multiplier?: number;
  [k: string]: any;
};

type MySubRow = {
  plan_code?: string;
  plan_name?: string;
  status?: string;
  expires_at?: string;
  started_at?: string;
  start_at?: string;
  end_at?: string;
  duration_months?: number;
  [k: string]: any;
};

type LatestRequestRow = {
  id: string;
  organization_id: string;
  plan_code: string;
  duration_months: number;
  expected_amount: number;
  submitted_amount: number;
  transaction_reference: string;
  payer_phone: string;
  payer_name: string | null;
  raw_sms?: string | null;
  status: string;
  admin_note: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  approved_at: string | null;
  approved_by: string | null;
  updated_at?: string | null;
};

type ParsedRawSms = {
  reference: string;
  phone: string;
  amount: number | null;
  payerName: string;
};

type ReconcileRow = {
  ok?: boolean | null;
  matched?: boolean | null;
  approved?: boolean | null;
  activated?: boolean | null;
  message?: string | null;
  request_id?: string | null;
  sms_log_id?: string | null;
  match_id?: string | null;
};

function fmtLimit(v: any) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return "—";
  return String(n);
}

function num(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function fmtMoneyTZS(v: any) {
  const n = num(v);
  if (n === null) return "—";
  const s = Math.round(n).toString();
  const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `TZS ${withComma}`;
}

function fmtISODate(v: any) {
  const s = clean(v);
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 10);
  } catch {
    return s;
  }
}

function fmtDateTime(v: any) {
  const s = clean(v);
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return s;
  }
}

function addMonthsISO(source: any, months: number) {
  const s = clean(source);
  const m = Number(months);
  if (!s || !Number.isFinite(m) || m <= 0) return "—";

  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "—";
    const next = new Date(d);
    next.setMonth(next.getMonth() + m);
    return next.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

const FALLBACK_PRICE_TZS: Record<string, number> = {
  FREE: 0,
  LITE: 10000,
  STARTER: 20000,
  PRO: 45000,
  BUSINESS: 100000,
  EXECUTIVE: 150000,
};

const PAY_TO_NAME = "JOFREY JOHN SANGA";
const PAY_TO_NETWORK = "VODACOM (M-PESA)";
const PAY_TO_PHONE = "0758014675";

function getPlanCode(p: any) {
  return upper(p?.code) || upper(p?.id) || upper(p?.name) || "";
}

function getPlanPriceMonthlyTZS(p: any): number | null {
  const code = getPlanCode(p);

  const db =
    num(p?.monthly_price_tzs) ??
    num(p?.price_tzs) ??
    num(p?.price_monthly) ??
    num(p?.price) ??
    num(p?.amount) ??
    null;

  if (db !== null) return db;

  if (code && FALLBACK_PRICE_TZS[code] !== undefined) {
    return FALLBACK_PRICE_TZS[code];
  }

  return null;
}

function getDurationDiscountPercent(d: any): number {
  const raw = num(d?.discount_percent);
  if (raw === null) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

function computeTotalTZS(monthly: number, months: number, discountPercent: number) {
  const base = monthly * months;
  const disc = base * (discountPercent / 100);
  const total = Math.max(0, Math.round(base - disc));
  return total;
}

function getPlanLimits(p: any) {
  const plan = p ?? {};

  const maxOrgs = plan.max_organizations ?? plan.max_orgs ?? null;
  const storesPerOrg = plan.stores_per_org ?? plan.max_stores ?? plan.maxStores ?? null;
  const staffPerOrg = plan.staff_per_org ?? plan.max_staff ?? plan.maxStaff ?? null;
  const postsPerStoreMonth =
    plan.business_club_posts_per_store_month ?? plan.business_club_posts_per_month ?? null;

  const aiEnabled =
    typeof plan.ai_enabled === "boolean" ? plan.ai_enabled : !!plan.ai_enabled;

  const credits = plan.ai_credits_monthly ?? null;
  const adv = !!plan.advanced_reports_enabled;

  return {
    maxOrgs,
    storesPerOrg,
    staffPerOrg,
    postsPerStoreMonth,
    aiEnabled,
    credits,
    adv,
  };
}

function normalizeTxRef(input: any) {
  const t = upper(input);
  const collapsed = t.replace(/\s+/g, " ").trim();

  // IMPORTANT:
  // We now preserve dot (.) because Airtel references come like:
  // MP260320.1512.L37591
  const safe = collapsed.replace(/[^A-Z0-9._-]/g, "");

  return safe;
}

function normalizeRawSms(input: any) {
  return clean(input).replace(/\r/g, "").replace(/[ \t]+/g, " ");
}

function digitsOnly(input: any) {
  return clean(input).replace(/\D+/g, "");
}

function normalizePhone(input: any) {
  const raw = digitsOnly(input);
  if (!raw) return "";

  if (raw.startsWith("255") && raw.length >= 12) {
    return `0${raw.slice(-9)}`;
  }

  if (raw.length === 9) {
    return `0${raw}`;
  }

  if (raw.length >= 10 && raw.startsWith("0")) {
    return raw.slice(0, 10);
  }

  return raw;
}

function buildManualRequestRef(orgId: string) {
  const stamp = Date.now();
  const tail = upper(clean(orgId)).replace(/[^A-Z0-9]/g, "").slice(-6) || "ORG";
  return `MANUAL-${tail}-${stamp}`;
}

function extractSmsReference(text: string) {
  const src = upper(text);
  if (!src) return "";

  // 1) Strong labeled patterns first: TID, TXN, RECEIPT, REFERENCE, etc.
  const strongPatterns = [
    /(?:TID|TRANS(?:ACTION)?(?:\s*(?:ID|NO|NUMBER|#))?|TXN(?:\s*(?:ID|NO|NUMBER|#))?|TX(?:\s*(?:ID|NO|NUMBER|#))?|RECEIPT(?:\s*(?:NO|NUMBER|#))?|REFERENCE(?:\s*(?:NO|NUMBER|#))?|KUMBUKUMBU|MUAMALA(?:\s*(?:NO|NUMBER|#))?)\s*[:#-]?\s*([A-Z0-9]+(?:[._-][A-Z0-9]+)*)/i,
    /(?:CODE|MPESA CODE|M-PESA CODE|TOKEN)\s*[:#-]?\s*([A-Z0-9]+(?:[._-][A-Z0-9]+)*)/i,
  ];

  for (const rx of strongPatterns) {
    const m = src.match(rx);
    const candidate = normalizeTxRef(m?.[1] ?? "");
    const hasLetter = /[A-Z]/.test(candidate);
    const hasDigit = /\d/.test(candidate);

    if (candidate && candidate.length >= 6 && hasLetter && hasDigit) {
      return candidate;
    }
  }

  // 2) Airtel-style exact TID fallback, e.g. MP260320.1512.L37591
  const airtelTid = src.match(/\b([A-Z]{2}\d{6}\.\d{4}\.[A-Z0-9]{4,})\b/i);
  if (airtelTid?.[1]) {
    const candidate = normalizeTxRef(airtelTid[1]);
    if (candidate) return candidate;
  }

  // 3) Generic fallback:
  // capture tokens joined by dot / underscore / hyphen
  const generic =
    src.match(/\b([A-Z0-9]+(?:[._-][A-Z0-9]+)+|[A-Z0-9]{8,}|[A-Z0-9-]{8,})\b/g) ?? [];

  for (const token of generic) {
    const candidate = normalizeTxRef(token);
    const hasLetter = /[A-Z]/.test(candidate);
    const hasDigit = /\d/.test(candidate);

    if (candidate.length >= 8 && hasLetter && hasDigit) {
      return candidate;
    }
  }

  return "";
}

function extractSmsAmount(text: string): number | null {
  const src = upper(text);
  if (!src) return null;

  const patterns = [
    /(?:TZS|TSH|SHS?)\s*([0-9][0-9,\.]*)/i,
    /([0-9][0-9,\.]*)\s*(?:TZS|TSH|SHS?)/i,
    /(?:KIASI|AMOUNT|PAID|UMELIPA|IMELIPWA)\s*[:=]?\s*(?:TZS|TSH|SHS?)?\s*([0-9][0-9,\.]*)/i,
  ];

  for (const rx of patterns) {
    const m = src.match(rx);
    const raw = clean(m?.[1] ?? "").replace(/,/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.round(n);
    }
  }

  return null;
}

function extractSmsPayerName(text: string) {
  const src = clean(text);
  if (!src) return "";

  const patterns = [
    /(?:JINA|NAME|FROM)\s*[:=-]?\s*([A-Z][A-Z .'-]{4,})/i,
    /(?:MTEJA|CUSTOMER)\s*[:=-]?\s*([A-Z][A-Z .'-]{4,})/i,
  ];

  for (const rx of patterns) {
    const m = src.match(rx);
    const candidate = clean(m?.[1] ?? "").replace(/\s{2,}/g, " ");
    if (candidate.length >= 4) return candidate;
  }

  return "";
}

function parseRawSms(text: any): ParsedRawSms {
  const src = normalizeRawSms(text);

  function extractSmsPhone(text: string) {
  const src = upper(text);
  if (!src) return "";

  // Tanzania phone formats
  const patterns = [
    /\b(0\d{9})\b/,                 // 0758014675
    /\b(255\d{9})\b/,               // 255758014675
    /\b(\+255\d{9})\b/,             // +255758014675
  ];

  for (const rx of patterns) {
    const m = src.match(rx);
    if (m?.[1]) {
      return m[1];
    }
  }

  return "";
}

  return {
    reference: extractSmsReference(src),
    phone: extractSmsPhone(src),
    amount: extractSmsAmount(src),
    payerName: extractSmsPayerName(src),
  };
}

function statusTone(status: string) {
  const s = upper(status);
  if (s === "APPROVED" || s === "ACTIVE") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.10)",
      title: "Approved ✅",
    };
  }
  if (s === "REJECTED") {
    return {
      borderColor: "rgba(239,68,68,0.35)",
      backgroundColor: "rgba(239,68,68,0.10)",
      title: "Rejected ❌",
    };
  }
  return {
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.10)",
    title: "Pending ⏳",
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "phone-pad";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.45)"
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={false}
        multiline={!!multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={{
          minHeight: multiline ? 110 : 52,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          color: UI.text,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 12 : 0,
          fontWeight: "900",
        }}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          height: 52,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: disabled ? "rgba(255,255,255,0.10)" : UI.emeraldBorder,
          backgroundColor: disabled ? "rgba(255,255,255,0.04)" : "rgba(16,185,129,0.12)",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.55 : pressed ? 0.95 : 1,
        },
      ]}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const org = useOrg();
  const insets = useSafeAreaInsets();

  const orgId = clean(org.activeOrgId);
  const canManage = org.activeRole === "owner" || org.activeRole === "admin";

  const [sessionEmail, setSessionEmail] = useState("");
  const isInternalBillingUser = useMemo(
    () => clean(sessionEmail).toLowerCase() === INTERNAL_BILLING_EMAIL,
    [sessionEmail]
  );

  const headerSubtitle = useMemo(() => {
    const name = org.activeOrgName ?? "No organization";
    const role = org.activeRole ? upper(org.activeRole) : "—";
    return `${name} • ${role}`;
  }, [org.activeOrgName, org.activeRole]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [mySub, setMySub] = useState<MySubRow | null>(null);
  const [latestRequest, setLatestRequest] = useState<LatestRequestRow | null>(null);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [durations, setDurations] = useState<DurationRow[]>([
    { months: 1, label: "1 month" },
    { months: 3, label: "3 months", discount_percent: 5 },
    { months: 6, label: "6 months", discount_percent: 10 },
    { months: 12, label: "12 months", discount_percent: 20 },
  ]);

  const [selectedPlanCode, setSelectedPlanCode] = useState<string>("");
  const selectedPlanCodeRef = useRef<string>("");

  useEffect(() => {
    selectedPlanCodeRef.current = upper(selectedPlanCode);
  }, [selectedPlanCode]);

  const [selectedMonths, setSelectedMonths] = useState<number>(1);

  const [payerPhone, setPayerPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [txRef, setTxRef] = useState("");
  const [rawSms, setRawSms] = useState("");

  const userTouchedPlanRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const loadAllRef = useRef<() => Promise<void>>(async () => {});

  const safeAlert = (title: string, msg: string) => Alert.alert(title, msg);

  const loadSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const email = clean(data?.user?.email).toLowerCase();
      setSessionEmail(email);
    } catch {
      setSessionEmail("");
    }
  }, []);

  const loadLatestRequest = useCallback(async () => {
    if (!orgId) {
      setLatestRequest(null);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("subscription_payment_requests")
        .select(
          `
            id,
            organization_id,
            plan_code,
            duration_months,
            expected_amount,
            submitted_amount,
            transaction_reference,
            payer_phone,
            payer_name,
            raw_sms,
            status,
            admin_note,
            rejection_reason,
            submitted_at,
            approved_at,
            approved_by,
            updated_at
          `
        )
        .eq("organization_id", orgId)
        .order("submitted_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const row = Array.isArray(data) ? ((data[0] as LatestRequestRow | undefined) ?? null) : null;
      setLatestRequest(row);
      return row;
    } catch {
      setLatestRequest(null);
      return null;
    }
  }, [orgId]);

  const loadAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setMySub(null);
      setLatestRequest(null);
      setPlans([]);
      return;
    }

    if (!isRefreshingRef.current) {
      setLoading(true);
    }

    try {
      const { data: subData, error: subErr } = await supabase.rpc("get_my_subscription", {
        p_org_id: orgId,
      });

      let currentCode = "";
      let currentStatus = "";

      if (!subErr) {
        const row = Array.isArray(subData) ? (subData?.[0] as any) : (subData as any);
        const normalized = (row ?? null) as MySubRow | null;
        setMySub(normalized);

        currentCode = upper(
          normalized?.plan_code || normalized?.code || normalized?.plan_name || ""
        );
        currentStatus = upper(normalized?.status || "");
      } else {
        setMySub(null);
      }

      const latestReq = await loadLatestRequest();
      const latestReqCode = upper(latestReq?.plan_code || "");
      const latestReqStatus = upper(latestReq?.status || "");

      const effectiveCode =
        currentCode && currentCode !== "FREE"
          ? currentCode
          : latestReqStatus === "APPROVED" && latestReqCode
          ? latestReqCode
          : currentCode || latestReqCode || "";

      const shouldAutoAdoptCurrentPlan =
        !!effectiveCode &&
        (
          !userTouchedPlanRef.current ||
          !clean(selectedPlanCodeRef.current) ||
          (upper(selectedPlanCodeRef.current) === "FREE" && effectiveCode !== "FREE") ||
          (
            latestReqStatus === "APPROVED" &&
            upper(selectedPlanCodeRef.current) !== effectiveCode &&
            (currentStatus === "APPROVED" || !currentStatus || currentStatus === "FREE")
          )
        );

      if (shouldAutoAdoptCurrentPlan) {
        setSelectedPlanCode(effectiveCode);
      }

      const { data: planData, error: planErr } = await supabase.rpc("get_public_plans");
      if (planErr) throw planErr;

      const planRows = (planData ?? []) as PlanRow[];
      setPlans(planRows);

      if (!clean(selectedPlanCodeRef.current) && !effectiveCode) {
        const pick = getPlanCode(planRows?.[0]);
        if (pick) setSelectedPlanCode(upper(pick));
      }

      const { data: durData, error: durErr } = await supabase.rpc("get_plan_durations");

      if (!durErr && Array.isArray(durData) && durData.length > 0) {
        const d = (durData ?? []) as DurationRow[];
        const normalized = d
          .map((x) => ({
            ...x,
            months: Number((x as any)?.months ?? (x as any)?.duration_months ?? 0),
          }))
          .filter((x) => Number.isFinite(x.months) && x.months > 0)
          .sort((a, b) => a.months - b.months);

        if (normalized.length > 0) {
          setDurations(normalized);
          if (!normalized.some((x) => x.months === selectedMonths)) {
            setSelectedMonths(normalized[0].months);
          }
        }
      }
    } catch (e: any) {
      safeAlert("Subscription", e?.message ?? "Failed to load subscription data");
    } finally {
      setLoading(false);
    }
  }, [loadLatestRequest, orgId, selectedMonths]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    loadAllRef.current = loadAll;
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!orgId) return;

    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const safeRealtimeRefresh = async () => {
      if (!mounted) return;
      if (isRefreshingRef.current) return;

      isRefreshingRef.current = true;
      try {
        await loadAllRef.current();
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const scheduleRefresh = () => {
      if (!mounted) return;
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        void safeRealtimeRefresh();
      }, 350);
    };

    const requestsChannel = supabase
      .channel(`subscription-requests-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_payment_requests",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();

    const subsChannel = supabase
      .channel(`organization-subscriptions-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organization_subscriptions",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void safeRealtimeRefresh();
      }
    });

    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      appStateSub.remove();
      void supabase.removeChannel(requestsChannel);
      void supabase.removeChannel(subsChannel);
    };
  }, [orgId]);

  const resolvedPlanCode = useMemo(() => {
    const rpcCode = upper(mySub?.plan_code || mySub?.plan_name || "");
    const reqCode = upper(latestRequest?.plan_code || "");
    const reqStatus = upper(latestRequest?.status || "");

    if (reqStatus === "APPROVED" && reqCode) {
      if (!rpcCode || rpcCode === "FREE") return reqCode;
    }

    return rpcCode || reqCode || "";
  }, [latestRequest, mySub]);

  const resolvedStatus = useMemo(() => {
    const rpcStatus = upper(mySub?.status || "");
    const reqStatus = upper(latestRequest?.status || "");

    if (reqStatus === "APPROVED" && resolvedPlanCode && (!rpcStatus || rpcStatus === "FREE")) {
      return "APPROVED";
    }

    return rpcStatus || reqStatus || "";
  }, [latestRequest, mySub, resolvedPlanCode]);

  useEffect(() => {
    const resolved = upper(resolvedPlanCode);
    const currentSel = upper(selectedPlanCode);

    if (!resolved) return;

    const shouldForceSelection =
      !userTouchedPlanRef.current ||
      !currentSel ||
      (currentSel === "FREE" && resolved !== "FREE") ||
      (upper(resolvedStatus) === "APPROVED" && currentSel !== resolved);

    if (shouldForceSelection && currentSel !== resolved) {
      setSelectedPlanCode(resolved);
    }
  }, [resolvedPlanCode, resolvedStatus, selectedPlanCode]);

  const resolvedStartedLabel = useMemo(() => {
    const rpcStart = mySub?.started_at || mySub?.start_at;
    if (clean(rpcStart)) return fmtISODate(rpcStart);

    if (upper(latestRequest?.status || "") === "APPROVED" && clean(latestRequest?.approved_at)) {
      return fmtISODate(latestRequest?.approved_at);
    }

    return "—";
  }, [latestRequest, mySub]);

  const resolvedExpiryLabel = useMemo(() => {
    const rpcEnd = mySub?.expires_at || mySub?.end_at;
    if (clean(rpcEnd)) return fmtISODate(rpcEnd);

    if (upper(latestRequest?.status || "") === "APPROVED" && clean(latestRequest?.approved_at)) {
      return addMonthsISO(
        latestRequest?.approved_at,
        Number(latestRequest?.duration_months ?? 0)
      );
    }

    return "—";
  }, [latestRequest, mySub]);

  const currentPlanLabel = useMemo(() => {
    const plan = resolvedPlanCode || "—";
    const st = resolvedStatus;
    return st ? `${plan} • ${st}` : plan;
  }, [resolvedPlanCode, resolvedStatus]);

  const selectedPlan = useMemo(() => {
    const key = upper(selectedPlanCode);
    if (!key) return null;
    return plans.find((p) => getPlanCode(p) === key) || null;
  }, [plans, selectedPlanCode]);

  const selectedDuration = useMemo(() => {
    return durations.find((x) => Number(x.months) === Number(selectedMonths)) || null;
  }, [durations, selectedMonths]);

  const selectedMonthlyPrice = useMemo(() => {
    if (!selectedPlan) return null;
    return getPlanPriceMonthlyTZS(selectedPlan);
  }, [selectedPlan]);

  const selectedDiscountPercent = useMemo(
    () => getDurationDiscountPercent(selectedDuration),
    [selectedDuration]
  );

  const expectedAmount = useMemo(() => {
    if (selectedMonthlyPrice === null) return null;
    return computeTotalTZS(selectedMonthlyPrice, selectedMonths, selectedDiscountPercent);
  }, [selectedMonthlyPrice, selectedMonths, selectedDiscountPercent]);

  const planFeatures = useMemo(() => {
    const p = selectedPlan as any;
    if (!p) return [];

    const lim = getPlanLimits(p);
    const out: string[] = [];

    out.push(`Organizations: ${fmtLimit(lim.maxOrgs)}`);
    out.push(`Stores per Organization: ${fmtLimit(lim.storesPerOrg)}`);
    out.push(`Staff per Organization: ${fmtLimit(lim.staffPerOrg)}`);
    out.push(`AI: ${lim.aiEnabled ? "Enabled" : "Disabled"}`);
    if (lim.aiEnabled) out.push(`AI Credits/Month: ${fmtLimit(lim.credits)}`);
    if (lim.adv) out.push("Advanced Reports: Enabled");
    if (lim.postsPerStoreMonth != null) {
      out.push(`Business Club Posts/Store/Month: ${fmtLimit(lim.postsPerStoreMonth)}`);
    }

    return out;
  }, [selectedPlan]);

  const latestRequestTone = useMemo(() => {
    return statusTone(latestRequest?.status || "");
  }, [latestRequest]);

  const latestRequestMessage = useMemo(() => {
    const status = upper(latestRequest?.status || "");

    if (!latestRequest) return "";

    if (status === "APPROVED") {
      return "Your payment request was approved successfully. Subscription has been activated.";
    }

    if (status === "REJECTED") {
      return "Your payment request was not approved. Review the reason below and submit again if needed.";
    }

    return "Your payment request was received and is under review by ZETRA office.";
  }, [latestRequest]);

  const parsedRawSms = useMemo(() => parseRawSms(rawSms), [rawSms]);

  const effectivePhonePreview = useMemo(() => {
    return normalizePhone(clean(payerPhone) || parsedRawSms.phone);
  }, [parsedRawSms.phone, payerPhone]);

  const effectiveRefPreview = useMemo(() => {
    return normalizeTxRef(clean(txRef) || parsedRawSms.reference);
  }, [parsedRawSms.reference, txRef]);

  const effectiveNamePreview = useMemo(() => {
    return clean(payerName) || clean(parsedRawSms.payerName);
  }, [parsedRawSms.payerName, payerName]);

  const rawSmsAmountMismatch = useMemo(() => {
    if (parsedRawSms.amount === null || expectedAmount === null) return false;
    return Math.round(parsedRawSms.amount) !== Math.round(expectedAmount);
  }, [expectedAmount, parsedRawSms.amount]);

 const submitPaymentRequest = useCallback(async () => {
  if (!canManage) {
    safeAlert("Not allowed", "Billing ni Owner/Admin tu.");
    return;
  }

  if (!orgId) {
    safeAlert("No org", "Organization haijapatikana.");
    return;
  }

  if (!selectedPlan) {
    safeAlert("Plan", "Chagua plan kwanza.");
    return;
  }

  if (expectedAmount === null) {
    safeAlert("Amount", "Expected amount haijapatikana.");
    return;
  }

  const rawMessage = clean(rawSms);
  const phone = normalizePhone(payerPhone);
  const name = clean(payerName);
  const manualRef = normalizeTxRef(clean(txRef)) || buildManualRequestRef(orgId);

  if (!rawMessage) {
    safeAlert("RAW SMS required", "Bandika SMS nzima ya muamala kama ilivyo.");
    return;
  }

  if (!phone) {
    safeAlert("Phone required", "Weka namba iliyotumika kulipa.");
    return;
  }

  if (!name) {
    safeAlert("Name required", "Weka jina la aliyefanya malipo.");
    return;
  }

  setBusy(true);
  try {
    const payload = {
      p_organization_id: orgId,
      p_plan_code: getPlanCode(selectedPlan),
      p_duration_months: selectedMonths,
      p_expected_amount: expectedAmount,
      p_submitted_amount: expectedAmount,
      p_transaction_reference: manualRef,
      p_payer_phone: phone,
      p_payer_name: name,
      p_raw_sms: rawMessage,
    };

    const { error } = await supabase.rpc("submit_subscription_payment_request", payload);
    if (error) throw error;

    setTxRef("");
    setPayerPhone("");
    setPayerName("");
    setRawSms("");

    safeAlert(
      "Request submitted ✅",
      "Payment request imetumwa successfully.\n\nOffice ita-review SMS uliyobandika pamoja na jina na namba ya simu."
    );

    userTouchedPlanRef.current = false;
    isRefreshingRef.current = true;
    try {
      await loadAll();
    } finally {
      isRefreshingRef.current = false;
    }
  } catch (e: any) {
    safeAlert("Submit request", e?.message ?? "Failed to submit payment request");
  } finally {
    setBusy(false);
  }
}, [
  canManage,
  expectedAmount,
  loadAll,
  orgId,
  payerName,
  payerPhone,
  rawSms,
  selectedMonths,
  selectedPlan,
  txRef,
]);

  const DurationPill = ({
    months,
    label,
    active,
    onPress,
    discountPercent,
  }: {
    months: number;
    label: string;
    active: boolean;
    onPress: () => void;
    discountPercent?: number;
  }) => {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          {
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
            backgroundColor: active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
          {label || `${months} mo`}
          {discountPercent ? ` • -${discountPercent}%` : ""}
        </Text>
      </Pressable>
    );
  };

  const PlanCard = ({ item }: { item: PlanRow }) => {
    const code = getPlanCode(item);
    const active = upper(selectedPlanCode) === code;

    const currentPaidCode = upper(resolvedPlanCode);
    const isCurrentPaid = !!currentPaidCode && currentPaidCode === code;

    const label = clean(item.name) || clean(item.code) || "Plan";

    const priceMonthly = getPlanPriceMonthlyTZS(item);
    const discountPercent = getDurationDiscountPercent(selectedDuration);
    const total =
      priceMonthly !== null
        ? computeTotalTZS(priceMonthly, selectedMonths, discountPercent)
        : null;

    const lim = getPlanLimits(item);

    return (
      <Pressable
        onPress={() => {
          userTouchedPlanRef.current = true;
          setSelectedPlanCode(code);
        }}
        style={({ pressed }) => [
          {
            borderRadius: 22,
            borderWidth: 1,
            borderColor: active
              ? UI.emeraldBorder
              : isCurrentPaid
              ? "rgba(16,185,129,0.28)"
              : "rgba(255,255,255,0.12)",
            backgroundColor: active ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.05)",
            padding: 14,
            opacity: pressed ? 0.95 : 1,
            marginBottom: 12,
          },
        ]}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              {label} {active ? "✅" : ""}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Code: {code || "—"}
              </Text>

              {isCurrentPaid ? (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.35)",
                    backgroundColor: "rgba(16,185,129,0.12)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                    Current
                  </Text>
                </View>
              ) : null}

              {active && !isCurrentPaid ? (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                    Selected
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.12)",
              backgroundColor: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
              {priceMonthly === null ? "—" : `${fmtMoneyTZS(priceMonthly)}/mo`}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Organizations: {fmtLimit(lim.maxOrgs)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Stores/Org: {fmtLimit(lim.storesPerOrg)} • Staff/Org: {fmtLimit(lim.staffPerOrg)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Club Posts/Store/Month: {fmtLimit(lim.postsPerStoreMonth)}
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            AI: {lim.aiEnabled ? "Enabled" : "Disabled"}
            {lim.aiEnabled ? ` • Credits/mo: ${fmtLimit(lim.credits)}` : ""}
          </Text>

          {active && priceMonthly !== null ? (
            <View
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Total for {selectedMonths} month{selectedMonths > 1 ? "s" : ""}
                {discountPercent ? ` (-${discountPercent}%)` : ""}
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, marginTop: 6 }}>
                {total === null ? "—" : fmtMoneyTZS(total)}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const EliteCard = () => {
    return (
      <View style={{ marginTop: 12 }}>
        <Pressable
          onPress={() =>
            Alert.alert(
              "ELITE (Contact Sales)",
              "Hii ni kifurushi cha biashara kubwa.\n\n• Unlimited Organizations\n• Unlimited Stores\n• Unlimited Staff\n• Unlimited Stock/Products\n• Unlimited Club growth\n\n⚠️ Note: AI na Analytics bado vina limit (kwa usalama na gharama za huduma).\n\nBonyeza “Contact Sales” kupata utaratibu na bei."
            )
          }
          style={({ pressed }) => [
            {
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.35)",
              backgroundColor: "rgba(16,185,129,0.08)",
              padding: 14,
              opacity: pressed ? 0.95 : 1,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(16,185,129,0.14)",
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
              }}
            >
              <Ionicons name="sparkles-outline" size={22} color={UI.emerald} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>ELITE</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                Unlimited growth • Contact Sales for setup & pricing
              </Text>
            </View>

            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: "rgba(16,185,129,0.10)",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Contact</Text>
            </View>
          </View>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              • Unlimited Organizations • Stores • Staff • Stock
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              • AI & Analytics zina limit (enterprise policy)
            </Text>
          </View>

          <View style={{ marginTop: 12 }}>
            <PrimaryButton
              label="Contact Sales"
              onPress={() =>
                Alert.alert(
                  "Contact Sales",
                  "Tafadhali wasiliana nasi kupata utaratibu wa ELITE.\n\n(Tutakuja kuweka njia rasmi: WhatsApp / Call / Email ndani ya app.)"
                )
              }
            />
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Subscription & Billing
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            {headerSubtitle}
          </Text>
        </View>

        {isInternalBillingUser ? (
          <Pressable
            onPress={() => router.push("/(tabs)/settings/subscription-requests")}
            style={({ pressed }) => [
              {
                minWidth: 42,
                height: 42,
                paddingHorizontal: 12,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: UI.emeraldBorder,
                backgroundColor: "rgba(16,185,129,0.10)",
                opacity: pressed ? 0.9 : 1,
                marginRight: 8,
              },
            ]}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Office</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => {
            if (isRefreshingRef.current) return;
            userTouchedPlanRef.current = false;
            isRefreshingRef.current = true;
            void loadAll().finally(() => {
              isRefreshingRef.current = false;
            });
          }}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
              marginRight: 4,
            },
          ]}
        >
          <Ionicons name="refresh-outline" size={18} color={UI.text} />
        </Pressable>
      </View>

      {!canManage ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: UI.text, fontWeight: "900" }}>Owner/Admin only</Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8, lineHeight: 18 }}>
              Billing/Subscription management ni kwa Owner/Admin tu. Staff wataendelea kutumia mfumo,
              lakini hawabadilishi plan wala kutuma payment request.
            </Text>
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Current subscription
          </Text>

          {loading ? (
            <View style={{ marginTop: 12 }}>
              <ActivityIndicator />
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                Loading subscription…
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                {currentPlanLabel}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                Starts: {resolvedStartedLabel}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                Server Expires: {resolvedExpiryLabel}
              </Text>

              <View style={{ marginTop: 10 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                    Plan limits are DB-driven ✅
                  </Text>
                  <Text
                    style={{
                      color: UI.muted,
                      fontWeight: "800",
                      fontSize: 12,
                      marginTop: 6,
                    }}
                  >
                    Stores/Staff/AI/Club zina-control kwa org level kupitia public.plans (plan_code).
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Card>
      </View>

      {latestRequest ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
              Latest payment request
            </Text>

            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: latestRequestTone.borderColor,
                backgroundColor: latestRequestTone.backgroundColor,
                borderRadius: 18,
                padding: 14,
                gap: 8,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                {latestRequestTone.title}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
                {latestRequestMessage}
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                Plan: <Text style={{ color: UI.text }}>{upper(latestRequest.plan_code)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Duration:{" "}
                <Text style={{ color: UI.text }}>
                  {latestRequest.duration_months} month{latestRequest.duration_months > 1 ? "s" : ""}
                </Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Amount: <Text style={{ color: UI.text }}>{fmtMoneyTZS(latestRequest.expected_amount)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Reference:{" "}
                <Text style={{ color: UI.text }}>
                  {clean(latestRequest.transaction_reference) || "—"}
                </Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                RAW SMS:{" "}
                <Text style={{ color: UI.text }}>
                  {clean(latestRequest.raw_sms) ? "ATTACHED" : "—"}
                </Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Submitted at: <Text style={{ color: UI.text }}>{fmtDateTime(latestRequest.submitted_at)}</Text>
              </Text>

              {upper(latestRequest.status) === "APPROVED" ? (
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Approved at: <Text style={{ color: UI.text }}>{fmtDateTime(latestRequest.approved_at)}</Text>
                </Text>
              ) : null}

              {clean(latestRequest.admin_note) ? (
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Office note: <Text style={{ color: UI.text }}>{clean(latestRequest.admin_note)}</Text>
                </Text>
              ) : null}

              {upper(latestRequest.status) === "REJECTED" && clean(latestRequest.rejection_reason) ? (
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Rejection reason:{" "}
                  <Text style={{ color: UI.text }}>{clean(latestRequest.rejection_reason)}</Text>
                </Text>
              ) : null}
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Choose billing duration
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            1 • 3 • 6 • 12 months (discounts optional)
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {durations.map((d, idx) => {
              const months = Number(d.months || 0);
              if (!months) return null;

              const label = clean(d.label) || `${months} month${months > 1 ? "s" : ""}`;
              const disc = getDurationDiscountPercent(d) || undefined;

              return (
                <DurationPill
                  key={`${months}-${idx}`}
                  months={months}
                  label={label}
                  active={selectedMonths === months}
                  discountPercent={disc}
                  onPress={() => setSelectedMonths(months)}
                />
              );
            })}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Choose plan
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            Select a plan then submit payment request.
          </Text>

          <View style={{ marginTop: 12 }}>
            {plans.length === 0 && !loading ? (
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                No plans returned. (Check get_public_plans RPC)
              </Text>
            ) : (
              <FlatList
                data={plans}
                keyExtractor={(it, idx) => getPlanCode(it) || String(idx)}
                scrollEnabled={false}
                renderItem={({ item }) => <PlanCard item={item} />}
              />
            )}
          </View>

          <EliteCard />

          <View style={{ marginTop: 12 }}>
            <View
              style={{
                borderWidth: 1.5,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: "rgba(10,12,16,0.90)",
                borderRadius: 22,
                padding: 14,
                shadowColor: "#000",
                shadowOpacity: 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(16,185,129,0.14)",
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.35)",
                  }}
                >
                  <Ionicons name="checkmark-done-outline" size={20} color={UI.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                    Selected features
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.60)",
                      fontWeight: "800",
                      fontSize: 12,
                      marginTop: 3,
                    }}
                  >
                    Summary ya limits za plan uliyochagua (DB-driven)
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 10, gap: 6 }}>
                {planFeatures.length === 0 ? (
                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Select a plan to preview limits.
                  </Text>
                ) : (
                  planFeatures.map((x, i) => (
                    <Text
                      key={`${x}-${i}`}
                      style={{ color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12 }}
                    >
                      • {x}
                    </Text>
                  ))
                )}
              </View>
            </View>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Confirm payment
          </Text>

          <View
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: "rgba(16,185,129,0.10)",
              gap: 8,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>Pay To</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>{PAY_TO_NAME}</Text>

            <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Network</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>{PAY_TO_NETWORK}</Text>

            <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Phone Number</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>{PAY_TO_PHONE}</Text>

            <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 8 }}>
              Baada ya kulipa, bandika SMS nzima ya muamala hapa chini kama ilivyo. Kisha jaza
              namba ya simu iliyotumika kulipa na jina la mlipaji. Office ndiyo itafanya review na
              matching manually.
            </Text>
          </View>

          <View
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              gap: 8,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "900" }}>Plan</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {selectedPlan ? getPlanCode(selectedPlan) : "—"}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Duration</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {selectedMonths} month{selectedMonths > 1 ? "s" : ""}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "900", marginTop: 4 }}>Amount</Text>
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {expectedAmount === null ? "—" : fmtMoneyTZS(expectedAmount)}
            </Text>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
            <Field
              label="RAW SMS"
              value={rawSms}
              onChangeText={setRawSms}
              placeholder="Bandika SMS nzima ya muamala hapa kama ilivyo..."
              multiline
              autoCapitalize="none"
            />

            <Field
              label="Phone Number"
              value={payerPhone}
              onChangeText={setPayerPhone}
              placeholder="Andika namba iliyotumika kulipa hapa"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />

            <Field
              label="Payer Name"
              value={payerName}
              onChangeText={setPayerName}
              placeholder="Andika jina la aliyefanya malipo hapa"
              autoCapitalize="words"
            />

            <Field
              label="Transaction Reference (optional)"
              value={txRef}
              onChangeText={(t) => setTxRef(normalizeTxRef(t))}
              placeholder="Acha wazi kama hutaki kuijaza"
              autoCapitalize="characters"
            />
          </View>

          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              gap: 6,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
              Final submit payload preview
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Phone: <Text style={{ color: UI.text }}>{normalizePhone(payerPhone) || "—"}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Reference:{" "}
              <Text style={{ color: UI.text }}>
                {normalizeTxRef(txRef) || (orgId ? buildManualRequestRef(orgId) : "—")}
              </Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Name: <Text style={{ color: UI.text }}>{clean(payerName) || "—"}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              RAW SMS: <Text style={{ color: UI.text }}>{clean(rawSms) ? "ATTACHED" : "—"}</Text>
            </Text>

            <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 2 }}>
              User ata-submit SMS kama ilivyo. Office ndiyo itafanya review na matching manually.
            </Text>
          </View>

          <View style={{ marginTop: 14 }}>
            <PrimaryButton
              label={busy ? "Submitting..." : "CONFIRM & SEND REQUEST"}
              onPress={() => void submitPaymentRequest()}
              disabled={!canManage || busy || loading || !selectedPlan}
            />
          </View>

          {!canManage ? (
            <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 12, marginTop: 12 }}>
              Billing ni Owner/Admin tu.
            </Text>
          ) : null}

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 12 }}>
            Note: Request ikipelekwa, itabaki kwa manual office review. Office italinganisha SMS
            uliyobandika na muamala ulioingia kwenye simu ya office.
          </Text>
        </Card>
      </View>

      <View style={{ height: 24 + Math.max(insets.bottom, 0) }} />
    </Screen>
  );
}