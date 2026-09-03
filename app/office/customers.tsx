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

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

type CustomerHealth =
  | "HEALTHY"
  | "EXPIRING"
  | "EXPIRED"
  | "LOW_ACTIVITY"
  | "DORMANT"
  | "ACTIVE_FREE"
  | "INACTIVE"
  | "UNKNOWN";

type OfficeCustomerRow = {
  organization_id: string;
  organization_name: string | null;

  owner_user_id?: string | null;
  owner_email?: string | null;

  subscription_plan_code?: string | null;
  subscription_plan_name?: string | null;
  subscription_status?: string | null;
  subscription_start_at?: string | null;
  subscription_end_at?: string | null;
  days_left?: number | null;

  stores_count?: number | null;
  active_stores_count?: number | null;

  sales_30d?: number | null;
  sales_active_days_30d?: number | null;
  last_sale_at?: string | null;

  expenses_30d?: number | null;
  expense_active_days_30d?: number | null;
  last_expense_at?: string | null;

  last_activity_at?: string | null;

  customer_health?: CustomerHealth | string | null;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function upper(value: any) {
  return clean(value).toUpperCase();
}

function numberValue(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateTime(value: any) {
  const raw = clean(value);

  if (!raw) {
    return "—";
  }

  try {
    const d = new Date(raw);

    if (Number.isNaN(d.getTime())) {
      return raw;
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return raw;
  }
}

function fmtDate(value: any) {
  const raw = clean(value);

  if (!raw) {
    return "—";
  }

  try {
    const d = new Date(raw);

    if (Number.isNaN(d.getTime())) {
      return raw.slice(0, 10);
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch {
    return raw.slice(0, 10);
  }
}

function getHealthTone(health: any) {
  const value = upper(health);

  if (value === "HEALTHY") {
    return {
      label: "HEALTHY",
      borderColor: "rgba(16,185,129,0.38)",
      backgroundColor: "rgba(16,185,129,0.10)",
    };
  }

  if (value === "EXPIRING") {
    return {
      label: "EXPIRING",
      borderColor: "rgba(245,158,11,0.40)",
      backgroundColor: "rgba(245,158,11,0.11)",
    };
  }

  if (value === "EXPIRED") {
    return {
      label: "EXPIRED",
      borderColor: "rgba(239,68,68,0.38)",
      backgroundColor: "rgba(239,68,68,0.10)",
    };
  }

  if (value === "LOW_ACTIVITY") {
    return {
      label: "LOW ACTIVITY",
      borderColor: "rgba(245,158,11,0.35)",
      backgroundColor: "rgba(245,158,11,0.10)",
    };
  }

  if (value === "DORMANT") {
    return {
      label: "DORMANT",
      borderColor: "rgba(239,68,68,0.30)",
      backgroundColor: "rgba(239,68,68,0.08)",
    };
  }

  if (value === "ACTIVE_FREE") {
    return {
      label: "ACTIVE FREE",
      borderColor: "rgba(59,130,246,0.34)",
      backgroundColor: "rgba(59,130,246,0.10)",
    };
  }

  if (value === "INACTIVE") {
    return {
      label: "INACTIVE",
      borderColor: "rgba(100,116,139,0.28)",
      backgroundColor: "rgba(148,163,184,0.08)",
    };
  }

  return {
    label: "UNKNOWN",
    borderColor: "rgba(15,23,42,0.12)",
    backgroundColor: "rgba(148,163,184,0.08)",
  };
}

function getSubscriptionTone(status: any) {
  const value = upper(status);

  if (value === "ACTIVE" || value === "APPROVED") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.10)",
    };
  }

  if (value === "EXPIRED") {
    return {
      borderColor: "rgba(239,68,68,0.35)",
      backgroundColor: "rgba(239,68,68,0.10)",
    };
  }

  return {
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.10)",
  };
}

export default function OfficeCustomersScreen() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [customers, setCustomers] = useState<OfficeCustomerRow[]>([]);
  const [errorText, setErrorText] = useState("");

  const [search, setSearch] = useState("");

  const checkAccess = useCallback(async () => {
    setCheckingAccess(true);

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        throw error;
      }

      const email = clean(data?.user?.email).toLowerCase();
      const ok = email === INTERNAL_BILLING_EMAIL;

      setAllowed(ok);

      if (!ok) {
        Alert.alert(
          "Restricted",
          "Hii ni ZETRA Office Customers Dashboard pekee."
        );

        router.replace("/office" as any);
      }
    } catch (e: any) {
      setAllowed(false);

      Alert.alert(
        "Access Error",
        e?.message ?? "Imeshindikana kuthibitisha Office account."
      );

      router.replace("/login" as any);
    } finally {
      setCheckingAccess(false);
    }
  }, [router]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      const { data, error } = await supabase.rpc(
        "office_list_customers_v1"
      );

      if (error) {
        throw error;
      }

      setCustomers(
        (Array.isArray(data) ? data : []) as OfficeCustomerRow[]
      );
    } catch (e: any) {
      setCustomers([]);

      setErrorText(
        clean(e?.message) ||
          "office_list_customers_v1 RPC bado haijatengenezwa."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCustomers = useCallback(async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);

    try {
      await loadCustomers();
    } finally {
      setRefreshing(false);
    }
  }, [loadCustomers, refreshing]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    void loadCustomers();
  }, [allowed, loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = clean(search).toLowerCase();

    if (!q) {
      return customers;
    }

    return customers.filter((item) => {
   const searchable = [
  item.organization_name,
  item.owner_email,
  item.subscription_plan_code,
  item.subscription_plan_name,
  item.subscription_status,
  item.customer_health,
]
        .map((value) => clean(value).toLowerCase())
        .join(" ");

      return searchable.includes(q);
    });
  }, [customers, search]);

const summary = useMemo(() => {
  let activeSubscriptions = 0;
  let expiredSubscriptions = 0;
  let healthyCustomers = 0;
  let needsAttention = 0;

  customers.forEach((item) => {
    const subscriptionStatus = upper(item.subscription_status);
    const health = upper(item.customer_health);

    if (
      subscriptionStatus === "ACTIVE" ||
      subscriptionStatus === "TRIAL"
    ) {
      activeSubscriptions += 1;
    }

    if (
      subscriptionStatus === "EXPIRED" ||
      health === "EXPIRED"
    ) {
      expiredSubscriptions += 1;
    }

    if (health === "HEALTHY") {
      healthyCustomers += 1;
    }

    if (
      health === "EXPIRING" ||
      health === "LOW_ACTIVITY" ||
      health === "DORMANT"
    ) {
      needsAttention += 1;
    }
  });

  return {
    total: customers.length,
    activeSubscriptions,
    expiredSubscriptions,
    healthyCustomers,
    needsAttention,
  };
}, [customers]);

  if (checkingAccess) {
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
          Checking Office access...
        </Text>
      </View>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
      contentContainerStyle={{
        padding: 18,
        paddingBottom: 50,
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
            width: 44,
            height: 44,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.10)",
            backgroundColor: "#FFFFFF",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 20,
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
              fontSize: 26,
            }}
          >
            Customers
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 3,
            }}
          >
            Performance, activity na customer health
          </Text>
        </View>

        <Pressable
          onPress={() => void refreshCustomers()}
          disabled={refreshing}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.26)",
            backgroundColor: "rgba(16,185,129,0.08)",
            opacity: refreshing ? 0.5 : pressed ? 0.9 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
              fontSize: 18,
            }}
          >
            ↻
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 18,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <SummaryCard
          title="Customers"
          value={summary.total}
        />

        <SummaryCard
          title="Active Subs"
          value={summary.activeSubscriptions}
        />

        <SummaryCard
          title="Expired"
          value={summary.expiredSubscriptions}
        />

 <SummaryCard
  title="Healthy"
  value={summary.healthyCustomers}
/>

<SummaryCard
  title="Needs Attention"
  value={summary.needsAttention}
/>
      </View>

      <View
        style={{
          marginTop: 16,
          borderWidth: 1,
          borderColor: "rgba(15,23,42,0.10)",
          backgroundColor: "#FFFFFF",
          borderRadius: 18,
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
            minHeight: 52,
            color: theme.colors.text,
            fontWeight: "800",
          }}
        />
      </View>

      {!!errorText && (
        <View
          style={{
            marginTop: 16,
            borderWidth: 1,
            borderColor: "rgba(239,68,68,0.28)",
            backgroundColor: "rgba(239,68,68,0.08)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
            }}
          >
            Customers backend not ready
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 6,
              lineHeight: 19,
            }}
          >
            {errorText}
          </Text>
        </View>
      )}

      <View
        style={{
          marginTop: 18,
          gap: 12,
        }}
      >
        {loading ? (
          <View
            style={{
              paddingVertical: 40,
              alignItems: "center",
            }}
          >
            <ActivityIndicator />

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                marginTop: 10,
              }}
            >
              Loading customers...
            </Text>
          </View>
        ) : filteredCustomers.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(15,23,42,0.10)",
              borderRadius: 20,
              backgroundColor: "#FFFFFF",
              padding: 18,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 15,
              }}
            >
              No customers found
            </Text>

            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                marginTop: 6,
              }}
            >
              Hakuna customer anayelingana na filter hii.
            </Text>
          </View>
        ) : (
          filteredCustomers.map((item) => {
            const healthTone = getHealthTone(item.customer_health);

            const subscriptionTone = getSubscriptionTone(
              item.subscription_status
            );

            return (
              <View
                key={item.organization_id}
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(15,23,42,0.10)",
                  backgroundColor: "#FFFFFF",
                  borderRadius: 22,
                  padding: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: "900",
                        fontSize: 17,
                      }}
                    >
                      {clean(item.organization_name) ||
                        "Unnamed Organization"}
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
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: healthTone.borderColor,
                      backgroundColor: healthTone.backgroundColor,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: "900",
                        fontSize: 10,
                      }}
                    >
                      {healthTone.label}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 12,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
               <InfoBox
  label="Stores"
  value={numberValue(item.stores_count)}
/>

<InfoBox
  label="Active Stores"
  value={numberValue(item.active_stores_count)}
/>

<InfoBox
  label="Sales 30D"
  value={numberValue(item.sales_30d)}
/>

<InfoBox
  label="Expenses 30D"
  value={numberValue(item.expenses_30d)}
/>

<InfoBox
  label="Total Activity"
  value={
    numberValue(item.sales_30d) +
    numberValue(item.expenses_30d)
  }
/>

<InfoBox
  label="Active Days"
  value={
    numberValue(item.sales_active_days_30d) +
    numberValue(item.expense_active_days_30d)
  }
/>
                </View>

                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: subscriptionTone.borderColor,
                    backgroundColor: subscriptionTone.backgroundColor,
                    borderRadius: 16,
                    padding: 12,
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontWeight: "800",
                      fontSize: 11,
                    }}
                  >
                    SUBSCRIPTION
                  </Text>

                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: "900",
                      fontSize: 14,
                    }}
                  >
                  {upper(
  item.subscription_plan_code ||
  item.subscription_plan_name
) || "FREE"} •{" "}
{upper(item.subscription_status) || "INACTIVE"}
                  </Text>

                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    Expires:{" "}
                    <Text
                      style={{
                        color: theme.colors.text,
                      }}
                    >
                      {fmtDate(item.subscription_end_at)}
                    </Text>
                  </Text>
                </View>

               <View
  style={{
    marginTop: 12,
    gap: 5,
  }}
>
  <Text
    style={{
      color: theme.colors.muted,
      fontWeight: "800",
      fontSize: 12,
    }}
  >
    Days left:{" "}
    <Text
      style={{
        color: theme.colors.text,
      }}
    >
      {item.days_left === null ||
      item.days_left === undefined
        ? "—"
        : item.days_left}
    </Text>
  </Text>

  <Text
    style={{
      color: theme.colors.muted,
      fontWeight: "800",
      fontSize: 12,
    }}
  >
    Last activity:{" "}
    <Text
      style={{
        color: theme.colors.text,
      }}
    >
      {fmtDateTime(item.last_activity_at)}
    </Text>
  </Text>
</View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <View
      style={{
        minWidth: 135,
        flexGrow: 1,
        flexBasis: 135,
        borderWidth: 1,
        borderColor: "rgba(16,185,129,0.20)",
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 14,
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontWeight: "800",
          fontSize: 11,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 21,
          marginTop: 7,
        }}
      >
        {value.toLocaleString("en-US")}
      </Text>
    </View>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View
      style={{
        minWidth: 105,
        flexGrow: 1,
        flexBasis: 105,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.08)",
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 10,
      }}
    >
      <Text
        style={{
          color: theme.colors.muted,
          fontWeight: "800",
          fontSize: 10,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 15,
          marginTop: 5,
        }}
      >
        {value.toLocaleString("en-US")}
      </Text>
    </View>
  );
}