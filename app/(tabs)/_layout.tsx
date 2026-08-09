import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import { Tabs, useFocusEffect, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabLabel({
  text,
  color,
  mobileWeb = false,
}: {
  text: string;
  color: string;
  mobileWeb?: boolean;
}) {
  return (
    <Text
      style={{
        color,
        fontWeight: "900",
        fontSize: mobileWeb ? 9.8 : 11.8,
lineHeight: mobileWeb ? 12 : 14,
        textAlign: mobileWeb ? "center" : "left",
        includeFontPadding: false,
        width: mobileWeb ? "100%" : undefined,
flexShrink: 1,
        letterSpacing: mobileWeb ? -0.45 : 0,
      }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.78}
      allowFontScaling={false}
    >
      {text}
    </Text>
  );
}

function WebTabIcon({
  emoji,
  color,
  mobileWeb = false,
}: {
  emoji: string;
  color: string;
  mobileWeb?: boolean;
}) {
  return (
    <View
      style={{
      width: mobileWeb ? 27 : 22,
height: mobileWeb ? 22 : 22,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: mobileWeb ? 20 : 17,
          color,
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {emoji}
      </Text>
    </View>
  );
}

function MoreGridIcon({
  color,
  mobileWeb = false,
}: {
  color: string;
  mobileWeb?: boolean;
}) {
  const box = mobileWeb ? 5 : 5.6;
  const gap = mobileWeb ? 1.8 : 2.2;

  return (
    <View
      style={{
        width: mobileWeb ? 28 : 22,
        height: mobileWeb ? 28 : 22,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: mobileWeb ? 23 : 26,
          height: mobileWeb ? 23 : 26,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.20)",
          backgroundColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ flexDirection: "row", gap }}>
          {[0, 1, 2].map((col) => (
            <View key={col} style={{ gap }}>
              {[0, 1, 2].map((row) => (
                <View
                  key={`${col}-${row}`}
                  style={{
                    width: box,
                    height: box,
                    borderRadius: 1.8,
                    backgroundColor: color,
                    opacity: 0.9,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
type SidebarSubscriptionRow = {
  plan_code?: string | null;
  plan_name?: string | null;
  status?: string | null;
  expires_at?: string | null;
  end_at?: string | null;
  [k: string]: any;
};

function cleanSubscriptionValue(v: any) {
  return String(v ?? "").trim();
}

function parseSidebarSubscriptionDate(value: any): Date | null {
  const raw = cleanSubscriptionValue(value);

  if (!raw) return null;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const d = new Date(year, month - 1, day);

    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}

function getSidebarSubscriptionDaysLeft(value: any): number | null {
  const expiry = parseSidebarSubscriptionDate(value);

  if (!expiry) return null;

  const today = new Date();

  const todayUTC = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const expiryUTC = Date.UTC(
    expiry.getFullYear(),
    expiry.getMonth(),
    expiry.getDate()
  );

  return Math.round(
    (expiryUTC - todayUTC) / (24 * 60 * 60 * 1000)
  );
}

function formatSidebarSubscriptionDate(value: any) {
  const d = parseSidebarSubscriptionDate(value);

  if (!d) return "—";

  try {
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return cleanSubscriptionValue(value).slice(0, 10) || "—";
  }
}

function DesktopSidebarSubscriptionCard({
  orgId,
  role,
}: {
  orgId?: string | null;
  role?: string | null;
}) {
  const router = useRouter();

  const cleanOrgId = cleanSubscriptionValue(orgId);
  const roleLower = cleanSubscriptionValue(role).toLowerCase();

  const canManageSubscription =
    roleLower === "owner" || roleLower === "admin";

  const [loading, setLoading] = useState(false);

  const [subscription, setSubscription] =
    useState<SidebarSubscriptionRow | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);

  const requestRef = useRef(0);

  const loadSubscription = useCallback(async () => {
    if (!cleanOrgId || !canManageSubscription) {
      setSubscription(null);
      setLoadFailed(false);
      return;
    }

    const requestId = ++requestRef.current;

    setLoading(true);
    setLoadFailed(false);

    try {
      const { data, error } = await supabase.rpc(
        "get_my_subscription",
        {
          p_org_id: cleanOrgId,
        } as any
      );

      if (error) {
        throw error;
      }

      if (requestId !== requestRef.current) {
        return;
      }

      const row = Array.isArray(data)
        ? data[0] ?? null
        : data ?? null;

      setSubscription(
        row
          ? (row as SidebarSubscriptionRow)
          : null
      );

      setLoadFailed(false);
    } catch (e) {
      if (requestId !== requestRef.current) {
        return;
      }

      /*
       * MUHIMU:
       * Tusifiche component ikiwa RPC imefail.
       * Tutaonyesha status fallback.
       */
      setSubscription(null);
      setLoadFailed(true);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [cleanOrgId, canManageSubscription]);

  /*
   * Layout ni persistent.
   * useEffect inahakikisha subscription
   * inapakiwa mara activeOrgId/role inapobadilika,
   * hata kama layout yenyewe haijapata focus event mpya.
   */
  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useFocusEffect(
    useCallback(() => {
      void loadSubscription();
    }, [loadSubscription])
  );

  const planCode = useMemo(() => {
    return cleanSubscriptionValue(
      subscription?.plan_code ??
        subscription?.plan_name ??
        subscription?.plan ??
        subscription?.code ??
        ""
    ).toUpperCase();
  }, [subscription]);

  const status = useMemo(() => {
    return cleanSubscriptionValue(
      subscription?.status ??
        subscription?.subscription_status ??
        ""
    ).toUpperCase();
  }, [subscription]);

  const expiryRaw = useMemo(() => {
    return (
      subscription?.expires_at ??
      subscription?.end_at ??
      subscription?.subscription_end ??
      subscription?.expiry_date ??
      ""
    );
  }, [subscription]);

  const daysLeft = useMemo(
    () => getSidebarSubscriptionDaysLeft(expiryRaw),
    [expiryRaw]
  );

  const expiryLabel = useMemo(
    () => formatSidebarSubscriptionDate(expiryRaw),
    [expiryRaw]
  );

  if (!cleanOrgId || !canManageSubscription) {
    return null;
  }

  const normalizedPlan =
    planCode ||
    (
      subscription
        ? "SUBSCRIPTION"
        : loadFailed
          ? "ACCOUNT"
          : "FREE"
    );

  const normalizedStatus =
    status ||
    (
      loadFailed
        ? "CHECK BILLING"
        : subscription
          ? "ACTIVE"
          : "FREE"
    );

  const isFree =
    normalizedPlan === "FREE" ||
    normalizedStatus === "FREE";

  const isExpired =
    normalizedStatus === "EXPIRED" ||
    (
      !isFree &&
      daysLeft !== null &&
      daysLeft < 0
    );

  const expiresToday =
    !isFree &&
    !isExpired &&
    daysLeft === 0;

  const critical =
    !isFree &&
    !isExpired &&
    daysLeft !== null &&
    daysLeft >= 1 &&
    daysLeft <= 7;

  const warning =
    !isFree &&
    !isExpired &&
    daysLeft !== null &&
    daysLeft >= 8 &&
    daysLeft <= 14;

  const colors = isExpired
    ? {
        strong: "#FCA5A5",
        muted: "#FECACA",
        badgeBg: "#B91C1C",
        line: "rgba(248,113,113,0.30)",
      }
    : expiresToday || critical
      ? {
          strong: "#FCA5A5",
          muted: "#FECACA",
          badgeBg: "#DC2626",
          line: "rgba(248,113,113,0.28)",
        }
      : warning
        ? {
            strong: "#FDA4AF",
            muted: "#FECDD3",
            badgeBg: "#EF4444",
            line: "rgba(251,113,133,0.26)",
          }
        : isFree
          ? {
              strong: "#BFDBFE",
              muted: "#DBEAFE",
              badgeBg: "#2563EB",
              line: "rgba(96,165,250,0.25)",
            }
          : {
              strong: "#A7F3D0",
              muted: "#D1FAE5",
              badgeBg: "#059669",
              line: "rgba(52,211,153,0.24)",
            };

  const remainingLabel = loading
    ? "..."
    : loadFailed
      ? "BILLING"
      : isFree
        ? "FREE"
        : isExpired
          ? "EXPIRED"
          : expiresToday
            ? "TODAY"
            : daysLeft === 1
              ? "1 DAY"
              : daysLeft !== null
                ? `${daysLeft} DAYS`
                : normalizedStatus || "ACTIVE";

  const subtitle = loading
    ? "Checking subscription..."
    : loadFailed
      ? "Tap to check Subscription & Billing"
      : isFree
        ? "Free plan • Upgrade available"
        : isExpired
          ? expiryRaw
            ? `Expired ${expiryLabel}`
            : "Subscription expired"
          : expiresToday
            ? `Expires today • ${expiryLabel}`
            : daysLeft !== null
              ? critical || warning
                ? `Renew before ${expiryLabel}`
                : `Expires ${expiryLabel}`
              : normalizedStatus || "Subscription active";

  const openSubscription = () => {
    router.push(
      "/(tabs)/settings/subscription" as any
    );
  };

  return (
    <Pressable
      pointerEvents="auto"
      onPress={openSubscription}
      style={({ pressed }) => ({
        marginTop: 6,
        paddingTop: 7,
        paddingBottom: 1,

        borderTopWidth: 1,
        borderTopColor: colors.line,

        opacity: pressed ? 0.82 : 1,

        gap: 4,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <Text
            style={{
              color: colors.strong,
              fontWeight: "900",
              fontSize: 9.5,
            }}
            numberOfLines={1}
          >
            {normalizedPlan}
            {normalizedStatus &&
            normalizedStatus !== normalizedPlan
              ? ` • ${normalizedStatus}`
              : ""}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 7,
            paddingVertical: 3,

            borderRadius: 999,

            backgroundColor: colors.badgeBg,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "900",
              fontSize: 7.5,
            }}
            numberOfLines={1}
          >
            {remainingLabel}
          </Text>
        </View>
      </View>

      <Text
        style={{
          color: colors.muted,
          fontWeight: "800",
          fontSize: 8.5,
        }}
        numberOfLines={1}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}
export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeRole, activeOrgId, activeOrgName, activeStoreId, activeStoreName, stores } = useOrg();

  const role = String(activeRole ?? "").trim().toLowerCase();
  const isCashier = role === "cashier";

  const activeStoreType = React.useMemo(() => {
    const row = (stores ?? []).find(
      (s: any) => String(s?.store_id ?? "") === String(activeStoreId ?? "")
    );
    const t = String((row as any)?.store_type ?? "STANDARD").trim().toUpperCase();

    if (t === "CAPITAL_RECOVERY") return "CAPITAL_RECOVERY";
    if (t === "FIELD_PROCUREMENT") return "FIELD_PROCUREMENT";
    return "STANDARD";
  }, [stores, activeStoreId]);

  const isCapitalRecoveryStore = activeStoreType === "CAPITAL_RECOVERY";
  const isFieldProcurementStore = activeStoreType === "FIELD_PROCUREMENT";
  const isSpecialStore = isCapitalRecoveryStore || isFieldProcurementStore;

  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const rawMobileWeb = isWeb && width < 900;
  const useLeftSidebarWeb = isWeb && !rawMobileWeb;
  const isMobileWeb = !useLeftSidebarWeb;

  const hidden = { display: "none" as const };

  const sidebarTitle = String(activeOrgName ?? "ZETRA BMS").trim() || "ZETRA BMS";
  const sidebarStore = String(activeStoreName ?? "No active store").trim() || "No active store";
  const sidebarRole = role ? role.toUpperCase() : "USER";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: useLeftSidebarWeb ? "left" : "bottom",
        tabBarLabelPosition: useLeftSidebarWeb ? "beside-icon" : "below-icon",
        sceneStyle: { backgroundColor: theme.colors.background },

        tabBarStyle: useLeftSidebarWeb
          ? {
              backgroundColor: theme.colors.tabBarBg,
              borderRightColor: "rgba(255,255,255,0.12)",
              borderRightWidth: 1,
              borderTopWidth: 0,
             width: 172,
paddingTop: Math.max(insets.top + 226, 242),
paddingBottom: Math.max(insets.bottom + 12, 16),
paddingHorizontal: 8,
              shadowOpacity: 0,
              elevation: 0,
            }
          : {
              backgroundColor: theme.colors.tabBarBg,
              borderTopColor: "rgba(255,255,255,0.12)",
              borderTopWidth: 1,
              height: 56 + Math.max(insets.bottom, 2),
              paddingBottom: Math.max(insets.bottom, 2),
              paddingTop: 1,
              paddingHorizontal: 2,
              shadowOpacity: 0,
              elevation: 0,
            },

      tabBarItemStyle: useLeftSidebarWeb
  ? {
      width: "100%",
      alignSelf: "stretch",
      minHeight: 44,
      borderRadius: 13,
      marginVertical: 2,
      paddingHorizontal: 10,
      justifyContent: "flex-start",
      alignItems: "center",
      flexDirection: "row",
    }
          : {
              minHeight: 50,
              paddingTop: 0,
              paddingBottom: 0,
              paddingHorizontal: 0,
              marginHorizontal: 0,
              borderRadius: theme.radius.md,
            },

        tabBarActiveBackgroundColor: useLeftSidebarWeb ? "rgba(59,130,246,0.22)" : "transparent",
tabBarIconStyle: useLeftSidebarWeb
  ? {
      width: 28,
      minWidth: 28,
      marginRight: 8,
      alignItems: "center",
      justifyContent: "center",
    }
  : undefined,

        tabBarLabelStyle: useLeftSidebarWeb
          ? {
              fontWeight: "900",
              fontSize: 12,
              textAlign: "left",
            }
          : undefined,
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: theme.colors.tabBarBg }}>
            {useLeftSidebarWeb ? (
              <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  top: Math.max(insets.top + 14, 22),
left: 8,
right: 8,
gap: 5,
                }}
              >
                <Text
                  style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}
                  numberOfLines={1}
                >
                  ZETRA BMS
                </Text>

                <Text
                  style={{
                    color: "rgba(255,255,255,0.70)",
                    fontWeight: "800",
                    fontSize: 11,
                  }}
                  numberOfLines={1}
                >
                  Business Command Center
                </Text>

                <View
                  style={{
                  marginTop: 8,
borderRadius: 15,
borderWidth: 1,
borderColor: "rgba(255,255,255,0.10)",
backgroundColor: "rgba(255,255,255,0.06)",
paddingVertical: 9,
paddingHorizontal: 9,
gap: 5,
overflow: "hidden",
                  }}
                >
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                     top: -18,
right: -18,
width: 70,
height: 70,
                      borderRadius: 999,
                      backgroundColor: "rgba(59,130,246,0.14)",
                    }}
                  />

                  <Text
                    style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}
                    numberOfLines={1}
                  >
                    {sidebarTitle}
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.78)",
                        fontWeight: "800",
                        fontSize: 10,
                        flex: 1,
                        minWidth: 0,
                      }}
                      numberOfLines={1}
                    >
                      {sidebarStore}
                    </Text>

                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: "rgba(59,130,246,0.18)",
                        borderWidth: 1,
                        borderColor: "rgba(59,130,246,0.28)",
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontWeight: "900",
                          fontSize: 8,
                        }}
                        numberOfLines={1}
                      >
                        {sidebarRole}
                      </Text>
                    </View>
                  </View>

                  <DesktopSidebarSubscriptionCard
                    orgId={activeOrgId}
                    role={activeRole}
                  />
                </View>

       {activeOrgId && activeStoreId ? (
  <Pressable
    pointerEvents="auto"
    onPress={() =>
      router.push("/stores/items-overview" as any)
    }
    style={({ pressed }) => ({
      marginTop: 8,

      width: "100%",
      minHeight: 44,

      flexDirection: "row",
      alignItems: "center",

      paddingHorizontal: 10,

      borderRadius: 13,

      backgroundColor: pressed
        ? "rgba(59,130,246,0.22)"
        : "transparent",

      opacity: pressed ? 0.94 : 1,
    })}
  >
    <View
      style={{
        width: 28,
        minWidth: 28,
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: 17,
          includeFontPadding: false,
        }}
      >
        📦
      </Text>
    </View>

    <Text
      style={{
        color: "rgba(255,255,255,0.68)",
        fontWeight: "900",
        fontSize: 12,
        lineHeight: 14,
        textAlign: "left",
        flexShrink: 1,
      }}
      numberOfLines={1}
    >
      Items Overview
    </Text>
  </Pressable>
) : null}
               
              </View>
            ) : null}
          </View>
        ),

        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.68)",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: useLeftSidebarWeb ? "Dashboard" : "Home",
          tabBarLabel: ({ color }) => (
            <TabLabel text={useLeftSidebarWeb ? "Dashboard" : "Home"} color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="📊" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen
        name="sales"
        listeners={{
          tabPress: (e) => {
            if (isSpecialStore) return;
            e.preventDefault();
            router.replace("/(tabs)/sales" as any);
          },
        }}
        options={{
          title: useLeftSidebarWeb ? "Point of Sale" : "Sales",
          href: isSpecialStore ? null : undefined,
          tabBarItemStyle: isSpecialStore ? hidden : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text={useLeftSidebarWeb ? "POS" : "Sales"} color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="🛒" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen
        name="expenses"
        options={{
          title: "Expenses",
          href: isCashier || isSpecialStore ? null : "/(tabs)/expenses",
          tabBarItemStyle: isCashier || isSpecialStore ? hidden : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text="Expenses" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="💸" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

     <Tabs.Screen
  name="stores"
  options={{
    title: "Stores",
    href: isCashier ? null : undefined,
    tabBarItemStyle: isCashier ? hidden : undefined,
    tabBarLabel: ({ color }) => (
      <TabLabel text="Stores" color={color} mobileWeb={isMobileWeb} />
    ),
    tabBarIcon: ({ color }) => (
      <WebTabIcon emoji="🏬" color={color} mobileWeb={isMobileWeb} />
    ),
  }}
/>

      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          tabBarItemStyle: isCashier || isFieldProcurementStore ? hidden : undefined,
          href: isFieldProcurementStore ? null : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text="Product" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="🏷️" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen
        name="credit"
        options={{
          title: "Credit",
          tabBarItemStyle: isCashier || isSpecialStore ? hidden : undefined,
          href: isSpecialStore ? null : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text="Credit" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="💳" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen
        name="capital-recovery/workspace"
        options={{
          title: "Recovery",
          href: isCapitalRecoveryStore && !isCashier ? "/capital-recovery/workspace" : null,
          tabBarItemStyle: !isCapitalRecoveryStore || isCashier ? hidden : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text="Recovery" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="💼" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen
        name="field-procurement/workspace"
        options={{
          title: "Field",
          href: isFieldProcurementStore && !isCashier ? "/field-procurement/workspace" : null,
          tabBarItemStyle: !isFieldProcurementStore || isCashier ? hidden : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text="Field" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="🧭" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen
        name="field-procurement/history"
        options={{
          title: "History",
          href: isFieldProcurementStore && !isCashier ? "/field-procurement/history" : null,
          tabBarItemStyle: !isFieldProcurementStore || isCashier ? hidden : undefined,
          tabBarLabel: ({ color }) => (
            <TabLabel text="History" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <WebTabIcon emoji="📜" color={color} mobileWeb={isMobileWeb} />
          ),
        }}
      />

      <Tabs.Screen name="club" options={{ href: null, tabBarItemStyle: hidden }} />

  <Tabs.Screen
  name="settings"
  listeners={{
    tabPress: (e) => {
      e.preventDefault();

      // More lazima kila mara ifungue More Home,
      // hata kama user yupo ndani ya:
      // settings/subscription
      // settings/regional
      // settings/account-privacy
      // settings/organization
      // n.k.
      router.replace("/(tabs)/settings" as any);
    },
  }}
  options={{
    title: "More",
    tabBarLabel: ({ color }) => (
      <TabLabel
        text="More"
        color={color}
        mobileWeb={isMobileWeb}
      />
    ),
    tabBarIcon: ({ color }) => (
      <MoreGridIcon
        color={color}
        mobileWeb={isMobileWeb}
      />
    ),
  }}
/>

      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="customers/index" options={{ href: null }} />
      <Tabs.Screen name="customers/[id]" options={{ href: null }} />
      <Tabs.Screen name="customers/insights" options={{ href: null }} />
      <Tabs.Screen name="staff" options={{ href: null }} />
      <Tabs.Screen name="sales/history" options={{ href: null }} />
      <Tabs.Screen name="sales/profit" options={{ href: null }} />
      <Tabs.Screen name="capital-recovery/history" options={{ href: null }} />
    </Tabs>
  );
}