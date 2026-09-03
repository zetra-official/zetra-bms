// app/office/system-performance.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

type PeriodKey =
  | "TODAY"
  | "7D"
  | "30D"
  | "90D"
  | "CUSTOM";

type DateRange = {
  from: string;
  to: string;
};

type PerformanceRpcResult = {
  period_from?: string | null;
  period_to?: string | null;
  generated_at?: string | null;

  customers?: {
    total?: number | null;
    active?: number | null;
    inactive?: number | null;
    new_in_period?: number | null;
  } | null;

  members?: {
    total?: number | null;
    active?: number | null;
    inactive?: number | null;
  } | null;

  stores?: {
    total?: number | null;
    active?: number | null;
    inactive?: number | null;
    with_activity_in_period?: number | null;
    without_activity_in_period?: number | null;
  } | null;

  subscriptions?: {
    payments_count?: number | null;
    revenue?: number | null;
  } | null;
};

type SystemStats = {
  totalOrganizations: number;
  activeOrganizations: number;
  inactiveOrganizations: number;
  newOrganizations: number;

  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;

  totalStores: number;
  configuredActiveStores: number;
  configuredInactiveStores: number;

  storesWithActivity: number;
  storesWithoutActivity: number;

  subscriptionPaymentsCount: number;
  subscriptionRevenue: number;
};

const EMPTY_STATS: SystemStats = {
  totalOrganizations: 0,
  activeOrganizations: 0,
  inactiveOrganizations: 0,
  newOrganizations: 0,

  totalMembers: 0,
  activeMembers: 0,
  inactiveMembers: 0,

  totalStores: 0,
  configuredActiveStores: 0,
  configuredInactiveStores: 0,

  storesWithActivity: 0,
  storesWithoutActivity: 0,

  subscriptionPaymentsCount: 0,
  subscriptionRevenue: 0,
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtNumber(value: any) {
  return Math.round(toNumber(value)).toLocaleString("en-US");
}

function fmtMoney(value: any) {
  return `TZS ${Math.round(toNumber(value)).toLocaleString("en-US")}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}

function todayString() {
  return toDateString(new Date());
}

function daysAgoString(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateString(d);
}

function isValidDateString(value: string) {
  const raw = clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return false;
  }

  const [yearText, monthText, dayText] = raw.split("-");

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const d = new Date(year, month - 1, day);

  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

function formatRangeDate(value: string) {
  if (!isValidDateString(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function rangeForPeriod(period: PeriodKey): DateRange {
  const today = todayString();

  if (period === "TODAY") {
    return {
      from: today,
      to: today,
    };
  }

  if (period === "7D") {
    return {
      from: daysAgoString(6),
      to: today,
    };
  }

  if (period === "30D") {
    return {
      from: daysAgoString(29),
      to: today,
    };
  }

  if (period === "90D") {
    return {
      from: daysAgoString(89),
      to: today,
    };
  }

  return {
    from: today,
    to: today,
  };
}

function StatCard({
  title,
  value,
  subtitle,
  tone = "normal",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "normal" | "good" | "warning";
}) {
  const borderColor =
    tone === "good"
      ? "rgba(16,185,129,0.28)"
      : tone === "warning"
      ? "rgba(245,158,11,0.30)"
      : "rgba(15,23,42,0.10)";

  const backgroundColor =
    tone === "good"
      ? "rgba(16,185,129,0.06)"
      : tone === "warning"
      ? "rgba(245,158,11,0.06)"
      : "#FFFFFF";

  return (
    <View
      style={{
        minWidth: 145,
        flexGrow: 1,
        flexBasis: 145,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        borderRadius: 18,
        padding: 15,
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontSize: 11,
          fontWeight: "900",
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: theme.colors.text,
          fontSize: 22,
          fontWeight: "900",
          marginTop: 8,
        }}
      >
        {value}
      </Text>

      {subtitle ? (
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 11,
            lineHeight: 17,
            fontWeight: "800",
            marginTop: 5,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function PeriodButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: 15,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: active
          ? "rgba(16,185,129,0.40)"
          : "rgba(15,23,42,0.10)",
        backgroundColor: active
          ? "rgba(16,185,129,0.10)"
          : "#FFFFFF",
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text
        style={{
          color: active
            ? theme.colors.emerald
            : theme.colors.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.10)",
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

export default function SystemPerformanceScreen() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [period, setPeriod] =
    useState<PeriodKey>("30D");

  const [dateRange, setDateRange] =
    useState<DateRange>(() => rangeForPeriod("30D"));

  const [rangeModalOpen, setRangeModalOpen] =
    useState(false);

  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const [errorText, setErrorText] = useState("");

  const [stats, setStats] =
    useState<SystemStats>(EMPTY_STATS);

  const checkAccess = useCallback(async () => {
    setCheckingAccess(true);

    try {
      const { data, error } =
        await supabase.auth.getUser();

      if (error) throw error;

      const email =
        clean(data?.user?.email).toLowerCase();

      const ok =
        email === INTERNAL_BILLING_EMAIL;

      setAllowed(ok);

      if (!ok) {
        Alert.alert(
          "Restricted",
          "Hii ni ZETRA Office System Performance pekee."
        );

        router.replace("/office" as any);
      }
    } catch (e: any) {
      setAllowed(false);

      Alert.alert(
        "Access Error",
        clean(e?.message) ||
          "Imeshindikana kuthibitisha ZETRA Office account."
      );

      router.replace("/login" as any);
    } finally {
      setCheckingAccess(false);
    }
  }, [router]);

  const periodLabel = useMemo(() => {
    if (period === "TODAY") {
      return "Today";
    }

    if (period === "7D") {
      return "Last 7 days";
    }

    if (period === "30D") {
      return "Last 30 days";
    }

    if (period === "90D") {
      return "Last 90 days";
    }

    return `${formatRangeDate(
      dateRange.from
    )} — ${formatRangeDate(dateRange.to)}`;
  }, [dateRange.from, dateRange.to, period]);

  const selectPreset = useCallback(
    (nextPeriod: Exclude<PeriodKey, "CUSTOM">) => {
      setPeriod(nextPeriod);
      setDateRange(rangeForPeriod(nextPeriod));
    },
    []
  );

  const openCustomRange = useCallback(() => {
    setDraftFrom(dateRange.from);
    setDraftTo(dateRange.to);
    setRangeModalOpen(true);
  }, [dateRange.from, dateRange.to]);

  const applyCustomRange = useCallback(() => {
    const from = clean(draftFrom);
    const to = clean(draftTo);

    if (!isValidDateString(from)) {
      Alert.alert(
        "Invalid From Date",
        "Tumia format YYYY-MM-DD. Mfano: 2026-01-01"
      );
      return;
    }

    if (!isValidDateString(to)) {
      Alert.alert(
        "Invalid To Date",
        "Tumia format YYYY-MM-DD. Mfano: 2026-12-31"
      );
      return;
    }

    if (from > to) {
      Alert.alert(
        "Invalid Date Range",
        "From Date haiwezi kuwa baada ya To Date."
      );
      return;
    }

    setDateRange({
      from,
      to,
    });

    setPeriod("CUSTOM");
    setRangeModalOpen(false);
  }, [draftFrom, draftTo]);

  const loadPerformance = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      setErrorText("");

      try {
        if (
          !isValidDateString(dateRange.from) ||
          !isValidDateString(dateRange.to)
        ) {
          throw new Error(
            "Selected date range is invalid."
          );
        }

        const { data, error } =
          await supabase.rpc(
            "get_office_system_performance_v2",
            {
              p_from: dateRange.from,
              p_to: dateRange.to,
            }
          );

        if (error) {
          throw error;
        }

        const row: PerformanceRpcResult | null =
          Array.isArray(data)
            ? ((data?.[0] ?? null) as
                | PerformanceRpcResult
                | null)
            : ((data ?? null) as
                | PerformanceRpcResult
                | null);

        if (!row) {
          throw new Error(
            "System performance RPC returned no data."
          );
        }

        setStats({
          totalOrganizations: toNumber(
            row.customers?.total
          ),

          activeOrganizations: toNumber(
            row.customers?.active
          ),

          inactiveOrganizations: toNumber(
            row.customers?.inactive
          ),

          newOrganizations: toNumber(
            row.customers?.new_in_period
          ),

          totalMembers: toNumber(
            row.members?.total
          ),

          activeMembers: toNumber(
            row.members?.active
          ),

          inactiveMembers: toNumber(
            row.members?.inactive
          ),

          totalStores: toNumber(
            row.stores?.total
          ),

          configuredActiveStores: toNumber(
            row.stores?.active
          ),

          configuredInactiveStores: toNumber(
            row.stores?.inactive
          ),

          storesWithActivity: toNumber(
            row.stores?.with_activity_in_period
          ),

          storesWithoutActivity: toNumber(
            row.stores?.without_activity_in_period
          ),

          subscriptionPaymentsCount: toNumber(
            row.subscriptions?.payments_count
          ),

          subscriptionRevenue: toNumber(
            row.subscriptions?.revenue
          ),
        });
      } catch (e: any) {
        const message =
          clean(e?.message) ||
          "Failed to load system performance.";

        setErrorText(message);
        setStats(EMPTY_STATS);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange.from, dateRange.to]
  );

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    void loadPerformance();
  }, [allowed, loadPerformance]);

  const onRefresh = useCallback(() => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    void loadPerformance(true);
  }, [loadPerformance, refreshing]);

  if (checkingAccess) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor:
            theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <ActivityIndicator />

        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            marginTop: 12,
          }}
        >
          Checking Office access...
        </Text>
      </View>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <>
      <ScrollView
        style={{
          flex: 1,
          backgroundColor:
            theme.colors.background,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 50,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 16,
              borderWidth: 1,
              borderColor:
                "rgba(15,23,42,0.10)",
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={theme.colors.text}
            />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 24,
              }}
            >
              System Performance
            </Text>

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                marginTop: 4,
              }}
            >
              ZETRA customers, usage na
              subscriptions
            </Text>
          </View>

          <Pressable
            onPress={() =>
              void loadPerformance()
            }
            disabled={loading}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 16,
              borderWidth: 1,
              borderColor:
                "rgba(16,185,129,0.25)",
              backgroundColor:
                "rgba(16,185,129,0.08)",
              alignItems: "center",
              justifyContent: "center",
              opacity: loading
                ? 0.5
                : pressed
                ? 0.9
                : 1,
            })}
          >
            <Ionicons
              name="refresh-outline"
              size={21}
              color={theme.colors.emerald}
            />
          </Pressable>
        </View>

        <View
          style={{
            marginTop: 18,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 9,
          }}
        >
          <PeriodButton
            label="TODAY"
            active={period === "TODAY"}
            onPress={() =>
              selectPreset("TODAY")
            }
          />

          <PeriodButton
            label="7 DAYS"
            active={period === "7D"}
            onPress={() =>
              selectPreset("7D")
            }
          />

          <PeriodButton
            label="30 DAYS"
            active={period === "30D"}
            onPress={() =>
              selectPreset("30D")
            }
          />

          <PeriodButton
            label="90 DAYS"
            active={period === "90D"}
            onPress={() =>
              selectPreset("90D")
            }
          />

          <PeriodButton
            label="DATE RANGE"
            active={period === "CUSTOM"}
            onPress={openCustomRange}
          />
        </View>

        <View
          style={{
            marginTop: 11,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={theme.colors.muted}
          />

          <Text
            style={{
              flex: 1,
              color: theme.colors.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Activity period:{" "}
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
              }}
            >
              {periodLabel}
            </Text>
          </Text>
        </View>

        {period === "CUSTOM" ? (
          <Pressable
            onPress={openCustomRange}
            style={({ pressed }) => ({
              marginTop: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor:
                "rgba(16,185,129,0.24)",
              backgroundColor:
                "rgba(16,185,129,0.06)",
              paddingHorizontal: 13,
              paddingVertical: 11,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={theme.colors.emerald}
            />

            <Text
              style={{
                flex: 1,
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 12,
              }}
            >
              {formatRangeDate(
                dateRange.from
              )}{" "}
              →{" "}
              {formatRangeDate(
                dateRange.to
              )}
            </Text>

            <Text
              style={{
                color: theme.colors.emerald,
                fontWeight: "900",
                fontSize: 12,
              }}
            >
              Change
            </Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View
            style={{
              marginTop: 28,
              alignItems: "center",
              paddingVertical: 30,
            }}
          >
            <ActivityIndicator />

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                marginTop: 12,
              }}
            >
              Loading ZETRA performance...
            </Text>
          </View>
        ) : errorText ? (
          <View style={{ marginTop: 18 }}>
            <SectionCard>
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <Ionicons
                  name="warning-outline"
                  size={22}
                  color="#EF4444"
                />

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: "900",
                      fontSize: 15,
                    }}
                  >
                    Performance data
                    unavailable
                  </Text>

                  <Text
                    style={{
                      color:
                        theme.colors.muted,
                      fontWeight: "800",
                      lineHeight: 19,
                      fontSize: 12,
                      marginTop: 7,
                    }}
                  >
                    {errorText}
                  </Text>
                </View>
              </View>
            </SectionCard>
          </View>
        ) : (
          <>
            <View style={{ marginTop: 18 }}>
              <SectionCard>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 17,
                  }}
                >
                  Platform Overview
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    marginTop: 5,
                  }}
                >
                  Muhtasari mkuu wa ZETRA
                  platform.
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 15,
                  }}
                >
                  <StatCard
                    title="ORGANIZATIONS"
                    value={fmtNumber(
                      stats.totalOrganizations
                    )}
                  />

                  <StatCard
                    title="STORES"
                    value={fmtNumber(
                      stats.totalStores
                    )}
                  />

                  <StatCard
                    title="USERS / MEMBERS"
                    value={fmtNumber(
                      stats.totalMembers
                    )}
                  />

                  <StatCard
                    title="NEW ORGANIZATIONS"
                    value={fmtNumber(
                      stats.newOrganizations
                    )}
                    subtitle={periodLabel}
                    tone="good"
                  />
                </View>
              </SectionCard>
            </View>

            <View style={{ marginTop: 14 }}>
              <SectionCard>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 17,
                  }}
                >
                  Customer Status
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    marginTop: 5,
                  }}
                >
                  Organization na member status
                  ndani ya ZETRA.
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  <StatCard
                    title="ACTIVE BUSINESSES"
                    value={fmtNumber(
                      stats.activeOrganizations
                    )}
                    tone="good"
                  />

                  <StatCard
                    title="INACTIVE BUSINESSES"
                    value={fmtNumber(
                      stats.inactiveOrganizations
                    )}
                    tone={
                      stats.inactiveOrganizations >
                      0
                        ? "warning"
                        : "normal"
                    }
                  />

                  <StatCard
                    title="ACTIVE MEMBERS"
                    value={fmtNumber(
                      stats.activeMembers
                    )}
                    tone="good"
                  />

                  <StatCard
                    title="INACTIVE MEMBERS"
                    value={fmtNumber(
                      stats.inactiveMembers
                    )}
                    tone={
                      stats.inactiveMembers > 0
                        ? "warning"
                        : "normal"
                    }
                  />
                </View>
              </SectionCard>
            </View>

            <View style={{ marginTop: 14 }}>
              <SectionCard>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 17,
                  }}
                >
                  Store Usage
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    fontSize: 12,
                    lineHeight: 18,
                    marginTop: 5,
                  }}
                >
                  Store status na matumizi ya
                  ZETRA ndani ya period
                  iliyochaguliwa.
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  <StatCard
                    title="ACTIVE STORES"
                    value={fmtNumber(
                      stats.configuredActiveStores
                    )}
                    subtitle="Configured active"
                    tone="good"
                  />

                  <StatCard
                    title="INACTIVE STORES"
                    value={fmtNumber(
                      stats.configuredInactiveStores
                    )}
                    subtitle="Configured inactive"
                    tone={
                      stats.configuredInactiveStores >
                      0
                        ? "warning"
                        : "normal"
                    }
                  />

                  <StatCard
                    title="STORES IN USE"
                    value={fmtNumber(
                      stats.storesWithActivity
                    )}
                    subtitle={periodLabel}
                    tone="good"
                  />

                  <StatCard
                    title="NO ACTIVITY"
                    value={fmtNumber(
                      stats.storesWithoutActivity
                    )}
                    subtitle={periodLabel}
                    tone={
                      stats.storesWithoutActivity > 0
                        ? "warning"
                        : "normal"
                    }
                  />
                </View>
              </SectionCard>
            </View>

            <View style={{ marginTop: 14 }}>
              <SectionCard>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color:
                          theme.colors.text,
                        fontWeight: "900",
                        fontSize: 17,
                      }}
                    >
                      Subscription Performance
                    </Text>

                    <Text
                      style={{
                        color:
                          theme.colors.muted,
                        fontWeight: "800",
                        fontSize: 12,
                        lineHeight: 18,
                        marginTop: 5,
                      }}
                    >
                      Mapato ya ZETRA kutoka
                      subscription ndani ya period
                      iliyochaguliwa.
                    </Text>
                  </View>

                  <Ionicons
                    name="card-outline"
                    size={22}
                    color={
                      theme.colors.emerald
                    }
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  <StatCard
                    title="APPROVED PAYMENTS"
                    value={fmtNumber(
                      stats.subscriptionPaymentsCount
                    )}
                    subtitle={periodLabel}
                    tone="good"
                  />

                  <StatCard
                    title="SUBSCRIPTION REVENUE"
                    value={fmtMoney(
                      stats.subscriptionRevenue
                    )}
                    subtitle={periodLabel}
                    tone="good"
                  />
                </View>
              </SectionCard>
            </View>

            <View style={{ marginTop: 14 }}>
              <SectionCard>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={22}
                    color={
                      theme.colors.emerald
                    }
                  />

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color:
                          theme.colors.text,
                        fontWeight: "900",
                        fontSize: 15,
                      }}
                    >
                      ZETRA Office metrics only
                    </Text>

                    <Text
                      style={{
                        color:
                          theme.colors.muted,
                        fontWeight: "800",
                        fontSize: 12,
                        lineHeight: 18,
                        marginTop: 5,
                      }}
                    >
                      Dashboard hii inaonyesha
                      customer count, platform usage,
                      store activity na subscription
                      performance ya ZETRA. Thamani
                      za mauzo ya biashara za wateja
                      hazionyeshwi hapa.
                    </Text>
                  </View>
                </View>
              </SectionCard>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={rangeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setRangeModalOpen(false)
        }
      >
        <View
          style={{
            flex: 1,
            backgroundColor:
              "rgba(15,23,42,0.40)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              padding: 18,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor:
                    "rgba(16,185,129,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={21}
                  color={
                    theme.colors.emerald
                  }
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontWeight: "900",
                    fontSize: 18,
                  }}
                >
                  Select Date Range
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors.muted,
                    fontWeight: "800",
                    fontSize: 11,
                    marginTop: 3,
                  }}
                >
                  Chagua tarehe ya kuanzia na
                  tarehe ya mwisho.
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  setRangeModalOpen(false)
                }
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={theme.colors.text}
                />
              </Pressable>
            </View>

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "900",
                fontSize: 11,
                marginTop: 22,
                marginBottom: 7,
              }}
            >
              FROM DATE
            </Text>

            <TextInput
              value={draftFrom}
              onChangeText={setDraftFrom}
              placeholder="2025-01-01"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              style={{
                minHeight: 50,
                borderRadius: 15,
                borderWidth: 1,
                borderColor:
                  "rgba(15,23,42,0.12)",
                backgroundColor:
                  "#FFFFFF",
                paddingHorizontal: 14,
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 15,
              }}
            />

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "900",
                fontSize: 11,
                marginTop: 16,
                marginBottom: 7,
              }}
            >
              TO DATE
            </Text>

            <TextInput
              value={draftTo}
              onChangeText={setDraftTo}
              placeholder="2025-12-31"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              style={{
                minHeight: 50,
                borderRadius: 15,
                borderWidth: 1,
                borderColor:
                  "rgba(15,23,42,0.12)",
                backgroundColor:
                  "#FFFFFF",
                paddingHorizontal: 14,
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 15,
              }}
            />

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                fontSize: 11,
                lineHeight: 17,
                marginTop: 10,
              }}
            >
              Format: YYYY-MM-DD. Mfano mwaka
              mzima: 2025-01-01 mpaka
              2025-12-31.
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 22,
              }}
            >
              <Pressable
                onPress={() =>
                  setRangeModalOpen(false)
                }
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor:
                    "rgba(15,23,42,0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed
                    ? 0.9
                    : 1,
                })}
              >
                <Text
                  style={{
                    color:
                      theme.colors.text,
                    fontWeight: "900",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={applyCustomRange}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 15,
                  backgroundColor:
                    theme.colors.emerald,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed
                    ? 0.9
                    : 1,
                })}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "900",
                  }}
                >
                  Apply Range
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}