import { useOrg } from "@/src/context/OrgContext";
import { theme } from "@/src/ui/theme";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
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
        width: 28,
        height: 28,
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

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeRole, activeOrgName, activeStoreId, activeStoreName, stores } = useOrg();

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
paddingTop: Math.max(insets.top + 132, 146),
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
      minHeight: 44,
      borderRadius: 13,
      marginVertical: 2,
      paddingHorizontal: 10,
      justifyContent: "center",
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
      width: 26,
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
                pointerEvents="none"
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
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.78)",
                        fontWeight: "800",
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    >
                      {sidebarStore}
                    </Text>

                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: "rgba(59,130,246,0.18)",
                        borderWidth: 1,
                        borderColor: "rgba(59,130,246,0.28)",
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 9 }}>
                        {sidebarRole}
                      </Text>
                    </View>
                  </View>
                </View>
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
        options={{
          title: "More",
          tabBarLabel: ({ color }) => (
            <TabLabel text="More" color={color} mobileWeb={isMobileWeb} />
          ),
          tabBarIcon: ({ color }) => (
            <MoreGridIcon color={color} mobileWeb={isMobileWeb} />
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