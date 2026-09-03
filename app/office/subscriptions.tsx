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
import { useRouter } from "expo-router";

import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";

type SubscriptionRow = {
  organization_id: string;
  organization_name: string | null;

  owner_user_id: string | null;
  owner_email: string | null;

  subscription_plan_code: string | null;
  subscription_plan_name: string | null;
  subscription_status: string | null;
  subscription_start_at: string | null;
  subscription_end_at: string | null;
  days_left: number | null;

  stores_count: number;
  active_stores_count: number;

  sales_30d: number;
  sales_active_days_30d: number;
  last_sale_at: string | null;

  expenses_30d: number;
  expense_active_days_30d: number;
  last_expense_at: string | null;

  last_activity_at: string | null;
  customer_health: string | null;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function upper(value: any) {
  return clean(value).toUpperCase();
}

function fmtDate(value: any) {
  const s = clean(value);

  if (!s) return "—";

  try {
    const d = new Date(s);

    if (Number.isNaN(d.getTime())) {
      return s;
    }

    return d.toISOString().slice(0, 10);
  } catch {
    return s;
  }
}

function subscriptionState(row: SubscriptionRow) {
  const status = upper(row.subscription_status);
  const days = Number(row.days_left);

  if (
    status === "EXPIRED" ||
    (Number.isFinite(days) && days < 0)
  ) {
    return "EXPIRED";
  }

  if (
    status === "ACTIVE" &&
    Number.isFinite(days) &&
    days >= 0 &&
    days <= 7
  ) {
    return "EXPIRING";
  }

  if (status === "ACTIVE") {
    return "ACTIVE";
  }

  if (status === "TRIAL") {
    return "TRIAL";
  }

  return "INACTIVE";
}

function statusStyle(status: string) {
  switch (status) {
    case "ACTIVE":
      return {
        borderColor: "rgba(16,185,129,0.35)",
        backgroundColor: "rgba(16,185,129,0.10)",
        textColor: "#047857",
      };

    case "EXPIRING":
      return {
        borderColor: "rgba(245,158,11,0.35)",
        backgroundColor: "rgba(245,158,11,0.10)",
        textColor: "#B45309",
      };

    case "EXPIRED":
      return {
        borderColor: "rgba(239,68,68,0.35)",
        backgroundColor: "rgba(239,68,68,0.10)",
        textColor: "#B91C1C",
      };

    case "TRIAL":
      return {
        borderColor: "rgba(59,130,246,0.35)",
        backgroundColor: "rgba(59,130,246,0.10)",
        textColor: "#1D4ED8",
      };

    default:
      return {
        borderColor: "rgba(100,116,139,0.25)",
        backgroundColor: "rgba(100,116,139,0.08)",
        textColor: "#475569",
      };
  }
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 150,
        minWidth: 145,
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.10)",
        padding: 16,
        minHeight: 120,
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontWeight: "800",
          fontSize: 12,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 30,
          marginTop: 16,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function SubscriptionCard({
  item,
}: {
  item: SubscriptionRow;
}) {
  const state = subscriptionState(item);
  const tone = statusStyle(state);

  const planCode =
    upper(item.subscription_plan_code) || "FREE";

  const planName =
    clean(item.subscription_plan_name) || planCode;

  return (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.10)",
        padding: 16,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 18,
            }}
          >
            {clean(item.organization_name) || "Unnamed Organization"}
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              fontSize: 12,
              marginTop: 5,
            }}
          >
            {clean(item.owner_email) || "No owner email"}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: tone.borderColor,
            backgroundColor: tone.backgroundColor,
          }}
        >
          <Text
            style={{
              color: tone.textColor,
              fontWeight: "900",
              fontSize: 11,
            }}
          >
            {state}
          </Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 14,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tone.borderColor,
          backgroundColor: tone.backgroundColor,
          padding: 14,
        }}
      >
        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "900",
            fontSize: 11,
          }}
        >
          SUBSCRIPTION
        </Text>

        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 16,
            marginTop: 7,
          }}
        >
          {planName} • {upper(item.subscription_status) || "INACTIVE"}
        </Text>

        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            marginTop: 9,
          }}
        >
          Started:{" "}
          <Text style={{ color: theme.colors.text }}>
            {fmtDate(item.subscription_start_at)}
          </Text>
        </Text>

        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            marginTop: 6,
          }}
        >
          Expires:{" "}
          <Text style={{ color: theme.colors.text }}>
            {fmtDate(item.subscription_end_at)}
          </Text>
        </Text>

        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            marginTop: 6,
          }}
        >
          Days left:{" "}
          <Text style={{ color: theme.colors.text }}>
            {item.days_left === null ||
            item.days_left === undefined
              ? "—"
              : String(item.days_left)}
          </Text>
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 12,
        }}
      >
        <View
          style={{
            flexGrow: 1,
            flexBasis: 120,
            minWidth: 120,
            backgroundColor: "#F8FAFC",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.08)",
            padding: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              fontSize: 11,
            }}
          >
            Stores
          </Text>

          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 18,
              marginTop: 5,
            }}
          >
            {Number(item.stores_count || 0)}
          </Text>
        </View>

        <View
          style={{
            flexGrow: 1,
            flexBasis: 120,
            minWidth: 120,
            backgroundColor: "#F8FAFC",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.08)",
            padding: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              fontSize: 11,
            }}
          >
            Active Stores
          </Text>

          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 18,
              marginTop: 5,
            }}
          >
            {Number(item.active_stores_count || 0)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function OfficeSubscriptionsScreen() {
  const router = useRouter();

  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const loadSubscriptions = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc(
        "office_list_customers_v1"
      );

      if (error) {
        throw error;
      }

      setRows(
        Array.isArray(data)
          ? (data as SubscriptionRow[])
          : []
      );
    } catch (e: any) {
      Alert.alert(
        "Subscriptions",
        e?.message ??
          "Imeshindikana kusoma subscriptions."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const summary = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    let trial = 0;
    let inactive = 0;

    for (const row of rows) {
      const state = subscriptionState(row);

      if (state === "ACTIVE") active += 1;
      else if (state === "EXPIRING") expiring += 1;
      else if (state === "EXPIRED") expired += 1;
      else if (state === "TRIAL") trial += 1;
      else inactive += 1;
    }

    return {
      total: rows.length,
      active,
      expiring,
      expired,
      trial,
      inactive,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.organization_name,
        row.owner_email,
        row.subscription_plan_code,
        row.subscription_plan_name,
        row.subscription_status,
        subscriptionState(row),
      ]
        .map((x) => clean(x).toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [rows, search]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
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
          Loading subscriptions...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
      contentContainerStyle={{
        padding: 18,
        paddingBottom: 40,
      }}
      keyboardShouldPersistTaps="handled"
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
            width: 46,
            height: 46,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.10)",
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 22,
            }}
          >
            ←
          </Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 28,
            }}
          >
            Subscriptions
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 3,
            }}
          >
            Active, expiring na expired plans
          </Text>
        </View>

        <Pressable
          disabled={refreshing}
          onPress={() => {
            if (refreshing) return;

            setRefreshing(true);
            void loadSubscriptions();
          }}
          style={({ pressed }) => ({
            width: 46,
            height: 46,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.30)",
            backgroundColor: "rgba(16,185,129,0.08)",
            alignItems: "center",
            justifyContent: "center",
            opacity:
              refreshing || pressed
                ? 0.65
                : 1,
          })}
        >
          {refreshing ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 20,
              }}
            >
              ↻
            </Text>
          )}
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 20,
        }}
      >
        <SummaryCard
          label="All Customers"
          value={summary.total}
        />

        <SummaryCard
          label="Active"
          value={summary.active}
        />

        <SummaryCard
          label="Expiring Soon"
          value={summary.expiring}
        />

        <SummaryCard
          label="Expired"
          value={summary.expired}
        />

        <SummaryCard
          label="Trial"
          value={summary.trial}
        />

        <SummaryCard
          label="Inactive"
          value={summary.inactive}
        />
      </View>

      <View
        style={{
          marginTop: 16,
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(15,23,42,0.10)",
          paddingHorizontal: 14,
        }}
      >
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search organization, email, plan, status..."
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            minHeight: 58,
            color: theme.colors.text,
            fontWeight: "800",
            fontSize: 14,
          }}
        />
      </View>

      <View
        style={{
          marginTop: 18,
        }}
      >
        {filteredRows.length === 0 ? (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(15,23,42,0.10)",
              padding: 20,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
              }}
            >
              No subscriptions found
            </Text>

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                marginTop: 7,
              }}
            >
              Hakuna customer anayelingana na search hiyo.
            </Text>
          </View>
        ) : (
          filteredRows.map((item) => (
            <SubscriptionCard
              key={item.organization_id}
              item={item}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}