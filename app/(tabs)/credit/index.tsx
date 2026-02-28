import { useOrg } from "@/src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CreditAccountRow = {
  account_id: string;
  customer_name: string | null;
  phone: string | null;
  balance: number | null;
};

type SortKey = "BAL_DESC" | "BAL_ASC" | "NAME_ASC";

/** Borrow Timeline row (from RPC) */
type BorrowRow = {
  borrow_date: string; // YYYY-MM-DD
  account_id: string;
  customer_name: string | null;
  phone: string | null;
  borrowed_amount: number | null;
  balance: number | null;
};

type RangeKey = "TODAY" | "D7" | "D30" | "ALL";

function norm(s: any) {
  return String(s ?? "").toLowerCase().trim();
}

function ymd(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** diff in days: (today - date) */
function daysDiff(todayYmd: string, otherYmd: string) {
  // safest: treat as UTC midnight
  const a = new Date(`${todayYmd}T00:00:00Z`).getTime();
  const b = new Date(`${otherYmd}T00:00:00Z`).getTime();
  return Math.floor((a - b) / (24 * 3600 * 1000));
}

function isClearedBalance(n: number) {
  // allow tiny float error
  return n <= 0.000001;
}

export default function CreditHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeRole, activeStoreId, activeStoreName, activeOrgId } = useOrg();

  // ✅ single source of truth for money formatting
  const money = useOrgMoneyPrefs(String(activeOrgId ?? ""));

  const isOwnerAdmin = useMemo(
    () => activeRole === "owner" || activeRole === "admin",
    [activeRole]
  );

  // ✅ store switch permission for staff
  const [canStaffManage, setCanStaffManage] = useState(false);

  const roleLabel = useMemo(() => {
    if (!activeRole) return "—";
    return String(activeRole).toUpperCase();
  }, [activeRole]);

  const [rows, setRows] = useState<CreditAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("BAL_DESC");

  /* =========================
     Borrow Timeline (CARD + FULLSCREEN MODAL) ✅ (NO TABS)
  ========================= */
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("D30");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineErr, setTimelineErr] = useState<string | null>(null);
  const [timelineRows, setTimelineRows] = useState<BorrowRow[]>([]);

  // ✅ Archive mode toggle (collapsed by default)
  const [clearedOpen, setClearedOpen] = useState(false);

  const todayYmd = useMemo(() => ymd(new Date()), []);

  const p_days = useMemo(() => {
    if (range === "TODAY") return 1;
    if (range === "D7") return 7;
    if (range === "D30") return 30;
    return 3650; // ALL (roughly 10 years)
  }, [range]);

  const loadAccess = useCallback(async () => {
    try {
      if (!activeStoreId) {
        setCanStaffManage(false);
        return;
      }
      if (isOwnerAdmin) {
        setCanStaffManage(true);
        return;
      }

      // staff: ask DB helper (switch aware)
      const { data, error } = await supabase.rpc("can_manage_credit_for_store", {
        p_store_id: activeStoreId,
      } as any);

      if (error) throw error;
      setCanStaffManage(!!data);
    } catch {
      setCanStaffManage(false);
    }
  }, [activeStoreId, isOwnerAdmin]);

  const load = useCallback(async () => {
    try {
      setErrMsg(null);
      setLoading(true);

      if (!activeStoreId) {
        setRows([]);
        setErrMsg("Chagua store kwanza. Credit ni store-scoped.");
        return;
      }

      const { data, error } = await supabase.rpc("get_store_credit_accounts_v2", {
        p_store_id: activeStoreId,
        p_status: "ALL",
      } as any);

      if (error) throw error;

      const mapped: CreditAccountRow[] = ((data ?? []) as any[])
        .map((x) => {
          const id = x.account_id ?? x.credit_account_id ?? x.id;
          return {
            account_id: String(id),
            customer_name: x.customer_name ?? x.full_name ?? x.name ?? null,
            phone: x.phone ?? x.normalized_phone ?? null,
            balance: Number(x.balance ?? x.balance_amount ?? 0),
          };
        })
        .filter((r) => Number(r.balance ?? 0) > 0);

      mapped.sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
      setRows(mapped);
    } catch (e: any) {
      setRows([]);
      setErrMsg(e?.message ?? "Failed to load credit accounts.");
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  const loadTimeline = useCallback(async () => {
    try {
      setTimelineErr(null);
      setTimelineLoading(true);

      if (!activeStoreId) {
        setTimelineRows([]);
        setTimelineErr("Chagua store kwanza.");
        return;
      }

      const { data, error } = await supabase.rpc("get_store_credit_borrow_timeline_v1", {
        p_store_id: activeStoreId,
        p_days,
      } as any);

      if (error) throw error;

      const list: BorrowRow[] = ((data ?? []) as any[]).map((x) => ({
        borrow_date: String(x.borrow_date ?? x.date ?? ""),
        account_id: String(x.account_id ?? x.credit_account_id ?? x.id ?? ""),
        customer_name: x.customer_name ?? x.full_name ?? x.name ?? null,
        phone: x.phone ?? x.normalized_phone ?? null,
        borrowed_amount: Number(x.borrowed_amount ?? x.amount ?? 0),
        balance: Number(x.balance ?? 0),
      }));

      const cleaned = list.filter((r) => r.borrow_date && r.borrow_date.length >= 10);

      cleaned.sort((a, b) => {
        if (a.borrow_date !== b.borrow_date) return a.borrow_date < b.borrow_date ? 1 : -1;
        return Number(b.borrowed_amount ?? 0) - Number(a.borrowed_amount ?? 0);
      });

      setTimelineRows(cleaned);
    } catch (e: any) {
      setTimelineRows([]);
      const msg = e?.message ?? "Failed to load timeline.";
      setTimelineErr(
        msg.includes("does not exist") || msg.includes("42P01") || msg.includes("function")
          ? "Timeline haijawa ready kwenye DB bado. (RPC/Table missing) — tutaiweka salama."
          : msg
      );
    } finally {
      setTimelineLoading(false);
    }
  }, [activeStoreId, p_days]);

  useEffect(() => {
    loadAccess();
    load();
  }, [loadAccess, load]);

  useFocusEffect(
    useCallback(() => {
      loadAccess();
      load();
    }, [loadAccess, load])
  );

  function openAccount(accountId: string) {
    router.push({
      pathname: "/(tabs)/credit/[creditId]",
      params: { creditId: accountId },
    } as any);
  }

  function openCleared() {
    router.push("/(tabs)/credit/cleared" as any);
  }

  const headerSubtitle = useMemo(() => {
    return `Store: ${activeStoreName ?? "No active store"} • Role: ${roleLabel}`;
  }, [activeStoreName, roleLabel]);

  const filtered = useMemo(() => {
    const query = norm(q);
    let list = rows;

    if (query) {
      list = list.filter((r) => {
        const name = norm(r.customer_name);
        const phone = norm(r.phone);
        return name.includes(query) || phone.includes(query);
      });
    }

    const sorted = [...list];
    if (sortKey === "BAL_DESC") {
      sorted.sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
    } else if (sortKey === "BAL_ASC") {
      sorted.sort((a, b) => Number(a.balance ?? 0) - Number(b.balance ?? 0));
    } else if (sortKey === "NAME_ASC") {
      sorted.sort((a, b) =>
        String(a.customer_name ?? "").localeCompare(String(b.customer_name ?? ""))
      );
    }
    return sorted;
  }, [rows, q, sortKey]);

  const Seg = useCallback(
    ({ k, label }: { k: SortKey; label: string }) => {
      const active = sortKey === k;
      return (
        <Pressable
          onPress={() => setSortKey(k)}
          hitSlop={8}
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
    [sortKey]
  );

  const accessText = useMemo(() => {
    if (isOwnerAdmin) return "Owner/Admin wanaweza ku-manage (record sale + record payment).";
    return canStaffManage
      ? "Staff wanaweza kurekodi malipo (store yao tu)."
      : "Staff wanaweza kuona (read-only) taarifa za credit kwenye store yao.";
  }, [isOwnerAdmin, canStaffManage]);

  const openTimeline = useCallback(() => {
    setTimelineOpen(true);
    setClearedOpen(false); // ✅ reset archive collapse each open (clean)
    void loadTimeline();
  }, [loadTimeline]);

  const closeTimeline = useCallback(() => {
    setTimelineOpen(false);
  }, []);

  // reload when range changes and modal is open
  useEffect(() => {
    if (!timelineOpen) return;
    void loadTimeline();
  }, [range, timelineOpen, loadTimeline]);

  // ✅ ARCHIVE MODE SPLIT: active vs cleared
  const activeTimelineRows = useMemo(() => {
    return timelineRows.filter((r) => {
      const bal = Number(r.balance ?? 0);
      return !isClearedBalance(Math.max(0, bal));
    });
  }, [timelineRows]);

  const clearedTimelineRows = useMemo(() => {
    const list = timelineRows.filter((r) => {
      const bal = Number(r.balance ?? 0);
      return isClearedBalance(Math.max(0, bal));
    });

    // keep newest first
    return list.sort((a, b) => {
      if (a.borrow_date !== b.borrow_date) return a.borrow_date < b.borrow_date ? 1 : -1;
      return Number(b.borrowed_amount ?? 0) - Number(a.borrowed_amount ?? 0);
    });
  }, [timelineRows]);

  const groupMap = useMemo(() => {
    const g: Record<string, BorrowRow[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      "This Month": [],
      Older: [],
    };

    for (const r of activeTimelineRows) {
      const diff = daysDiff(todayYmd, r.borrow_date);
      if (diff === 0) g.Today.push(r);
      else if (diff === 1) g.Yesterday.push(r);
      else if (diff <= 7) g["This Week"].push(r);
      else if (diff <= 30) g["This Month"].push(r);
      else g.Older.push(r);
    }
    return g;
  }, [activeTimelineRows, todayYmd]);

  const RangeChip = useCallback(
    ({ k, label }: { k: RangeKey; label: string }) => {
      const active = range === k;
      return (
        <Pressable
          onPress={() => setRange(k)}
          hitSlop={8}
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

  const TimelineSection = useCallback(
    ({ title, list }: { title: string; list: BorrowRow[] }) => {
      if (!list.length) return null;
      const isOlder = title === "Older";

      return (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
                {title}
              </Text>

              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isOlder ? theme.colors.dangerBorder : "rgba(255,255,255,0.12)",
                  backgroundColor: isOlder ? theme.colors.dangerSoft : "rgba(255,255,255,0.04)",
                }}
              >
                <Text
                  style={{
                    color: isOlder ? theme.colors.dangerText : theme.colors.muted,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  {list.length}
                </Text>
              </View>
            </View>

            {isOlder ? (
              <Text style={{ color: theme.colors.dangerText, fontWeight: "900", fontSize: 12 }}>
                Risk
              </Text>
            ) : null}
          </View>

          {list.map((r, idx) => {
            const name = r.customer_name ?? "Customer";
            const phone = r.phone ?? "No phone";
            const borrowed = Number(r.borrowed_amount ?? 0);
            const bal = Number(r.balance ?? 0);

            const borderColor = isOlder ? theme.colors.dangerBorder : "rgba(255,255,255,0.10)";
            const bg = isOlder ? theme.colors.dangerSoft : "rgba(255,255,255,0.04)";

            return (
              <Pressable
                key={`${r.borrow_date}-${r.account_id}-${idx}`}
                onPress={() => openAccount(r.account_id)}
                hitSlop={10}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: bg,
                  borderRadius: theme.radius.xl,
                  padding: 12,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{name}</Text>
                    <Text style={{ color: theme.colors.faint, marginTop: 4, fontWeight: "800" }}>
                      {phone}
                    </Text>

                    <Text style={{ color: theme.colors.muted, marginTop: 6, fontWeight: "900" }}>
                      Date: <Text style={{ color: theme.colors.text }}>{r.borrow_date}</Text>
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Borrowed</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {money.fmt(Math.max(0, borrowed))}
                    </Text>

                    <View style={{ height: 8 }} />
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Balance</Text>
                    <Text
                      style={{
                        color: isOlder ? theme.colors.dangerText : theme.colors.emerald,
                        fontWeight: "900",
                      }}
                    >
                      {money.fmt(Math.max(0, bal))}
                    </Text>
                  </View>
                </View>

                <View style={{ height: 10 }} />
                <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>Open →</Text>
              </Pressable>
            );
          })}
        </View>
      );
    },
    [openAccount, money]
  );

  const ClearedArchive = useCallback(() => {
    const count = clearedTimelineRows.length;

    return (
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={() => setClearedOpen((v) => !v)}
          hitSlop={10}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.03)",
            borderRadius: theme.radius.xl,
            paddingVertical: 12,
            paddingHorizontal: 12,
            opacity: pressed ? 0.95 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="archive-outline" size={18} color={theme.colors.muted} />
              </View>

              <View style={{ gap: 2 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Cleared Archive</Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                  Records za waliomaliza kulipa (hazifutwi)
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
                  {count}
                </Text>
              </View>

              <Ionicons
                name={clearedOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.colors.muted}
              />
            </View>
          </View>
        </Pressable>

        {clearedOpen ? (
          count === 0 ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Hakuna cleared records kwenye range hii.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {clearedTimelineRows.map((r, idx) => {
                const name = r.customer_name ?? "Customer";
                const phone = r.phone ?? "No phone";
                const borrowed = Number(r.borrowed_amount ?? 0);
                const bal = Number(r.balance ?? 0);

                return (
                  <Pressable
                    key={`cleared-${r.borrow_date}-${r.account_id}-${idx}`}
                    onPress={() => openAccount(r.account_id)}
                    hitSlop={10}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      borderRadius: theme.radius.xl,
                      padding: 12,
                      opacity: pressed ? 0.92 : 1,
                    })}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{name}</Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.14)",
                              backgroundColor: "rgba(255,255,255,0.05)",
                            }}
                          >
                            <Ionicons name="checkmark-circle" size={14} color={theme.colors.emerald} />
                            <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
                              CLEARED
                            </Text>
                          </View>
                        </View>

                        <Text style={{ color: theme.colors.faint, marginTop: 4, fontWeight: "800" }}>
                          {phone}
                        </Text>

                        <Text style={{ color: theme.colors.muted, marginTop: 6, fontWeight: "900" }}>
                          Date: <Text style={{ color: theme.colors.text }}>{r.borrow_date}</Text>
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Borrowed</Text>
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                          {money.fmt(Math.max(0, borrowed))}
                        </Text>

                        <View style={{ height: 8 }} />
                        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Balance</Text>
                        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                          {money.fmt(Math.max(0, bal))}
                        </Text>
                      </View>
                    </View>

                    <View style={{ height: 10 }} />
                    <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>Open →</Text>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : null}
      </View>
    );
  }, [clearedTimelineRows, clearedOpen, openAccount, money]);

  return (
    <Screen scroll bottomPad={160}>
      <View style={{ paddingTop: 6, paddingBottom: 10 }}>
        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: "900" }}>Credit</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4, fontWeight: "800" }}>
          Credit v2 – Accounts
        </Text>
      </View>

      <Card style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.emeraldBorder,
              backgroundColor: theme.colors.emeraldSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="card-outline" size={22} color={theme.colors.emerald} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              Credit Accounts (v2)
            </Text>
            <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 4 }}>
              {headerSubtitle}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
            borderRadius: theme.radius.xl,
            padding: 12,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Access</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", lineHeight: 18 }}>
            {accessText}
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Search</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: theme.radius.xl,
              paddingHorizontal: 12,
              height: 48,
            }}
          >
            <Ionicons name="search" size={18} color={theme.colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Tafuta jina au simu..."
              placeholderTextColor={theme.colors.faint}
              style={{ flex: 1, color: theme.colors.text, fontWeight: "800" }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!q ? (
              <Pressable onPress={() => setQ("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={theme.colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Sort</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Seg k="BAL_DESC" label="Top Debt" />
            <Seg k="NAME_ASC" label="Name" />
            <Seg k="BAL_ASC" label="Low Debt" />
          </View>
        </View>

        {/* ✅ TWO CARDS ROW (simple, no tabs) */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={openCleared}
            hitSlop={10}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.borderSoft,
              backgroundColor: "rgba(255,255,255,0.04)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
              View Cleared
            </Text>
          </Pressable>

          <Pressable
            onPress={openTimeline}
            hitSlop={10}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.emeraldBorder,
              backgroundColor: theme.colors.emeraldSoft,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
              Borrow Timeline
            </Text>
          </Pressable>
        </View>

        {errMsg ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.dangerBorder,
              backgroundColor: theme.colors.dangerSoft,
              padding: 12,
              borderRadius: theme.radius.xl,
            }}
          >
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{errMsg}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator />
          </View>
        ) : filtered.length === 0 && activeStoreId ? (
          <View style={{ paddingVertical: 10 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {q ? "No match found." : "No active debtors right now."}
            </Text>
            <Text style={{ color: theme.colors.faint, marginTop: 6 }}>
              (Waliomaliza wapo kwenye View Cleared.)
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.account_id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const name = item.customer_name ?? "Customer";
              const phone = item.phone ?? "No phone";
              const bal = Number(item.balance ?? 0);

              return (
                <Pressable
                  onPress={() => openAccount(item.account_id)}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: theme.radius.xl,
                    padding: 12,
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{name}</Text>
                      <Text style={{ color: theme.colors.faint, marginTop: 4, fontWeight: "800" }}>
                        {phone}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Balance</Text>
                      <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                        {money.fmt(Math.max(0, bal))}
                      </Text>
                    </View>
                  </View>

                  <View style={{ height: 10 }} />
                  <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>Open →</Text>
                </Pressable>
              );
            }}
          />
        )}

        <Pressable
          onPress={() => {
            loadAccess();
            load();
          }}
          hitSlop={10}
          style={({ pressed }) => ({
            height: 48,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.emeraldBorder,
            backgroundColor: theme.colors.emeraldSoft,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.emerald, fontWeight: "900", fontSize: 16 }}>
            Refresh
          </Text>
        </Pressable>
      </Card>

      {/* =========================
          TIMELINE MODAL (FULL SCREEN)
          + ARCHIVE MODE (CLEARED COLLAPSED)
      ========================= */}
      <Modal
        visible={timelineOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={closeTimeline}
      >
        {/* Backdrop (tap to close) */}
        <Pressable
          onPress={closeTimeline}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.78)",
          }}
        />

        {/* Full-screen container */}
        <View
          style={{
            flex: 1,
            paddingTop: Math.max(12, insets.top + 10),
            paddingBottom: Math.max(12, insets.bottom + 10),
            paddingHorizontal: 14,
          }}
        >
          <View style={{ flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" }}>
            <Card
              style={{
                flex: 1,
                gap: 12,
                backgroundColor: "rgba(16,18,24,0.98)",
                borderColor: "rgba(255,255,255,0.10)",
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ gap: 2 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                    Borrow Timeline
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                    Store: {activeStoreName ?? "—"}
                  </Text>
                </View>

                <Pressable onPress={closeTimeline} hitSlop={10}>
                  <Ionicons name="close" size={20} color={theme.colors.muted} />
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <RangeChip k="TODAY" label="Today" />
                <RangeChip k="D7" label="7 Days" />
                <RangeChip k="D30" label="30 Days" />
                <RangeChip k="ALL" label="All" />
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => void loadTimeline()}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: theme.radius.xl,
                    borderWidth: 1,
                    borderColor: theme.colors.emeraldBorder,
                    backgroundColor: theme.colors.emeraldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>Reload</Text>
                </Pressable>

                <Pressable
                  onPress={closeTimeline}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: theme.radius.xl,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Close</Text>
                </Pressable>
              </View>

              {timelineErr ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.dangerBorder,
                    backgroundColor: theme.colors.dangerSoft,
                    padding: 12,
                    borderRadius: theme.radius.xl,
                  }}
                >
                  <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{timelineErr}</Text>
                </View>
              ) : null}

              {timelineLoading ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <ScrollView
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingBottom: Math.max(18, insets.bottom + 12),
                      gap: 16,
                    }}
                  >
                    {!activeTimelineRows.length && !timelineErr ? (
                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        Hakuna active records kwenye range hii.
                      </Text>
                    ) : null}

                    {/* ✅ ACTIVE ONLY */}
                    <TimelineSection title="Today" list={groupMap.Today} />
                    <TimelineSection title="Yesterday" list={groupMap.Yesterday} />
                    <TimelineSection title="This Week" list={groupMap["This Week"]} />
                    <TimelineSection title="This Month" list={groupMap["This Month"]} />
                    <TimelineSection title="Older" list={groupMap.Older} />

                    {/* ✅ ARCHIVE (CLEARED) COLLAPSED */}
                    <ClearedArchive />
                  </ScrollView>
                </View>
              )}
            </Card>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}