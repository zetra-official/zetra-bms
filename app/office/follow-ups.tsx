// app/office/follow-ups.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { supabase } from "@/src/supabase/supabaseClient";

type FollowUpFilter = "ALL" | "EXPIRING" | "EXPIRED";

type SubscriptionRequestRow = {
  id: string;
  organization_id: string;
  plan_code: string;
  duration_months: number;
  payer_name: string | null;
  payer_phone: string | null;
  status: string;
  approved_at: string | null;
  submitted_at: string;
};

type FollowUpRow = {
  id: string;
  organizationId: string;
  customerName: string;
  phone: string;
  planCode: string;
  durationMonths: number;
  approvedAt: string;
  expiresAt: string;
  daysRemaining: number;
  status: "EXPIRING" | "EXPIRED";
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function upper(v: any) {
  return clean(v).toUpperCase();
}

function normalizePhone(v: any) {
  return clean(v).replace(/[^\d+]/g, "");
}

function addMonths(dateValue: string, months: number) {
  const d = new Date(dateValue);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  const next = new Date(d);
  next.setMonth(next.getMonth() + Math.max(1, Number(months || 1)));

  return next;
}

function differenceInDays(target: Date, now: Date) {
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fmtDate(v: any) {
  const s = clean(v);
  if (!s) return "—";

  const d = new Date(s);

  if (Number.isNaN(d.getTime())) {
    return s;
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

function followUpTone(status: FollowUpRow["status"]) {
  if (status === "EXPIRED") {
    return {
      borderColor: "rgba(239,68,68,0.24)",
      backgroundColor: "rgba(239,68,68,0.07)",
      label: "EXPIRED",
    };
  }

  return {
    borderColor: "rgba(245,158,11,0.28)",
    backgroundColor: "rgba(245,158,11,0.08)",
    label: "EXPIRING SOON",
  };
}

function FilterPill({
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
      style={({ pressed }) => [
        {
          minHeight: 42,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active
            ? UI.emeraldBorder
            : "rgba(255,255,255,0.10)",
          backgroundColor: active
            ? "rgba(16,185,129,0.12)"
            : "rgba(255,255,255,0.04)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 46,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: UI.emeraldBorder,
          backgroundColor: "rgba(16,185,129,0.08)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={17} color={UI.text} />

      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function OfficeFollowUpsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<FollowUpRow[]>([]);
  const [errorText, setErrorText] = useState("");

  const [filter, setFilter] = useState<FollowUpFilter>("ALL");
  const [searchText, setSearchText] = useState("");

  const loadFollowUps = useCallback(async (silent?: boolean) => {
    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorText("");

    try {
      const { data, error } = await supabase
        .from("subscription_payment_requests")
        .select(
          `
            id,
            organization_id,
            plan_code,
            duration_months,
            payer_name,
            payer_phone,
            status,
            approved_at,
            submitted_at
          `
        )
        .eq("status", "APPROVED")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false });

      if (error) throw error;

      const sourceRows = (data ?? []) as SubscriptionRequestRow[];

      /*
       * Tunachukua subscription ya mwisho ya kila organization.
       * Hii inazuia customer mmoja kuonekana mara nyingi kwa payments zake za zamani.
       */
      const latestByOrganization = new Map<
        string,
        SubscriptionRequestRow
      >();

      for (const row of sourceRows) {
        const organizationId = clean(row.organization_id);

        if (!organizationId) continue;

        if (!latestByOrganization.has(organizationId)) {
          latestByOrganization.set(organizationId, row);
        }
      }

      const now = new Date();

      const followUps: FollowUpRow[] = [];

      latestByOrganization.forEach((row) => {
        const approvedAt = clean(row.approved_at);

        if (!approvedAt) return;

        const expiryDate = addMonths(
          approvedAt,
          Number(row.duration_months ?? 1)
        );

        if (!expiryDate) return;

        const daysRemaining = differenceInDays(expiryDate, now);

        /*
         * Follow-up queue:
         * - expired
         * - au subscription yenye siku 30 au chini kabla ya ku-expire.
         */
        if (daysRemaining > 30) {
          return;
        }

        followUps.push({
          id: row.id,
          organizationId: clean(row.organization_id),
          customerName:
            clean(row.payer_name) || "Customer",
          phone: clean(row.payer_phone),
          planCode: upper(row.plan_code) || "PLAN",
          durationMonths: Number(row.duration_months ?? 1),
          approvedAt,
          expiresAt: expiryDate.toISOString(),
          daysRemaining,
          status: daysRemaining < 0 ? "EXPIRED" : "EXPIRING",
        });
      });

      followUps.sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "EXPIRED" ? -1 : 1;
        }

        return a.daysRemaining - b.daysRemaining;
      });

      setRows(followUps);
    } catch (e: any) {
      setRows([]);
      setErrorText(
        clean(e?.message) || "Failed to load follow-ups."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps]);

  const summary = useMemo(() => {
    const expiring = rows.filter(
      (row) => row.status === "EXPIRING"
    ).length;

    const expired = rows.filter(
      (row) => row.status === "EXPIRED"
    ).length;

    return {
      total: rows.length,
      expiring,
      expired,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = clean(searchText).toLowerCase();

    return rows.filter((row) => {
      if (
        filter !== "ALL" &&
        row.status !== filter
      ) {
        return false;
      }

      if (!q) return true;

      return (
        clean(row.customerName).toLowerCase().includes(q) ||
        clean(row.phone).toLowerCase().includes(q) ||
        clean(row.planCode).toLowerCase().includes(q) ||
        clean(row.organizationId).toLowerCase().includes(q)
      );
    });
  }, [filter, rows, searchText]);

  const callCustomer = useCallback(async (phoneRaw: string) => {
    const phone = normalizePhone(phoneRaw);

    if (!phone) {
      Alert.alert(
        "Phone unavailable",
        "Customer huyu hana namba ya simu iliyohifadhiwa."
      );
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert(
        "Call failed",
        "Imeshindikana kufungua phone dialer."
      );
    }
  }, []);

  const openWhatsApp = useCallback(async (phoneRaw: string) => {
    let phone = normalizePhone(phoneRaw).replace("+", "");

    if (!phone) {
      Alert.alert(
        "Phone unavailable",
        "Customer huyu hana namba ya simu iliyohifadhiwa."
      );
      return;
    }

    if (phone.startsWith("0")) {
      phone = `255${phone.slice(1)}`;
    }

    const message =
      "Habari, tunakukumbusha kuhusu subscription yako ya ZETRA. Tafadhali wasiliana nasi kwa ajili ya renewal au msaada zaidi.";

    try {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(
        message
      )}`;

      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert(
          "WhatsApp unavailable",
          "WhatsApp link haikuweza kufunguliwa kwenye kifaa hiki."
        );
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "WhatsApp failed",
        "Imeshindikana kufungua WhatsApp."
      );
    }
  }, []);

  return (
    <Screen scroll>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 2,
        }}
      >
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
          <Ionicons
            name="chevron-back"
            size={20}
            color={UI.text}
          />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 20,
            }}
          >
            Follow-ups
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 4,
            }}
          >
            Subscription renewals & customer follow-up
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (refreshing) return;
            void loadFollowUps(true);
          }}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: "rgba(16,185,129,0.08)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" />
          ) : (
            <Ionicons
              name="refresh-outline"
              size={19}
              color={UI.text}
            />
          )}
        </Pressable>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card>
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 15,
            }}
          >
            Follow-up Overview
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
              lineHeight: 18,
              marginTop: 6,
            }}
          >
            Customers wenye subscription iliyo-expire au
            inayokaribia ku-expire ndani ya siku 30.
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 14,
            }}
          >
            <View
              style={{
                flex: 1,
                minWidth: "30%",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                padding: 12,
              }}
            >
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 11,
                }}
              >
                All
              </Text>

              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 22,
                  marginTop: 6,
                }}
              >
                {summary.total}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                minWidth: "30%",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.24)",
                backgroundColor: "rgba(245,158,11,0.07)",
                padding: 12,
              }}
            >
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 11,
                }}
              >
                Expiring
              </Text>

              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 22,
                  marginTop: 6,
                }}
              >
                {summary.expiring}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                minWidth: "30%",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.22)",
                backgroundColor: "rgba(239,68,68,0.06)",
                padding: 12,
              }}
            >
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 11,
                }}
              >
                Expired
              </Text>

              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 22,
                  marginTop: 6,
                }}
              >
                {summary.expired}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 15,
            }}
          >
            Customer Queue
          </Text>

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search name, phone or plan"
            placeholderTextColor="rgba(255,255,255,0.40)"
            style={{
              marginTop: 12,
              minHeight: 50,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.05)",
              color: UI.text,
              paddingHorizontal: 14,
              fontWeight: "800",
            }}
          />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            <FilterPill
              label="ALL"
              active={filter === "ALL"}
              onPress={() => setFilter("ALL")}
            />

            <FilterPill
              label="EXPIRING"
              active={filter === "EXPIRING"}
              onPress={() => setFilter("EXPIRING")}
            />

            <FilterPill
              label="EXPIRED"
              active={filter === "EXPIRED"}
              onPress={() => setFilter("EXPIRED")}
            />
          </View>

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
                  color: UI.muted,
                  fontWeight: "800",
                  marginTop: 10,
                }}
              >
                Loading follow-ups…
              </Text>
            </View>
          ) : errorText ? (
            <View
              style={{
                marginTop: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.22)",
                backgroundColor: "rgba(239,68,68,0.06)",
                padding: 14,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 13,
                }}
              >
                Unable to load follow-ups
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 6,
                }}
              >
                {errorText}
              </Text>
            </View>
          ) : visibleRows.length === 0 ? (
            <View
              style={{
                paddingVertical: 34,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={32}
                color={UI.muted}
              />

              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 14,
                  marginTop: 10,
                }}
              >
                No follow-ups right now
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  marginTop: 5,
                  textAlign: "center",
                }}
              >
                Hakuna customer kwenye filter hii kwa sasa.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 14, gap: 12 }}>
              {visibleRows.map((item) => {
                const tone = followUpTone(item.status);

                return (
                  <View
                    key={item.id}
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: tone.borderColor,
                      backgroundColor: tone.backgroundColor,
                      padding: 14,
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
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: UI.text,
                            fontWeight: "900",
                            fontSize: 15,
                          }}
                        >
                          {item.customerName}
                        </Text>

                        <Text
                          style={{
                            color: UI.muted,
                            fontWeight: "800",
                            fontSize: 12,
                            marginTop: 5,
                          }}
                        >
                          {item.phone || "No phone"}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 9,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: tone.borderColor,
                          backgroundColor: tone.backgroundColor,
                        }}
                      >
                        <Text
                          style={{
                            color: UI.text,
                            fontWeight: "900",
                            fontSize: 10,
                          }}
                        >
                          {tone.label}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        marginTop: 12,
                        gap: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: UI.muted,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        Plan:{" "}
                        <Text style={{ color: UI.text }}>
                          {item.planCode}
                        </Text>
                      </Text>

                      <Text
                        style={{
                          color: UI.muted,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        Duration:{" "}
                        <Text style={{ color: UI.text }}>
                          {item.durationMonths} month
                          {item.durationMonths === 1 ? "" : "s"}
                        </Text>
                      </Text>

                      <Text
                        style={{
                          color: UI.muted,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        Expiry date:{" "}
                        <Text style={{ color: UI.text }}>
                          {fmtDate(item.expiresAt)}
                        </Text>
                      </Text>

                      <Text
                        style={{
                          color: UI.muted,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        Follow-up:{" "}
                        <Text style={{ color: UI.text }}>
                          {item.status === "EXPIRED"
                            ? `${Math.abs(
                                item.daysRemaining
                              )} day${
                                Math.abs(item.daysRemaining) === 1
                                  ? ""
                                  : "s"
                              } expired`
                            : item.daysRemaining === 0
                            ? "Expires today"
                            : `${item.daysRemaining} day${
                                item.daysRemaining === 1 ? "" : "s"
                              } remaining`}
                        </Text>
                      </Text>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 14,
                      }}
                    >
                      <ActionButton
                        label="WHATSAPP"
                        icon="logo-whatsapp"
                        onPress={() =>
                          void openWhatsApp(item.phone)
                        }
                      />

                      <ActionButton
                        label="CALL"
                        icon="call-outline"
                        onPress={() =>
                          void callCustomer(item.phone)
                        }
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </View>

      <View
        style={{
          height: 24 + Math.max(insets.bottom, 0),
        }}
      />
    </Screen>
  );
}