import { useOrg } from "@/src/context/OrgContext";
import { theme } from "@/src/ui/theme";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabLabel({ text, color, mobileWeb = false }: { text: string; color: string; mobileWeb?: boolean }) {
  return (
    <Text style={{ color, fontWeight: "700", fontSize: mobileWeb ? 9.5 : 11, lineHeight: mobileWeb ? 10 : 13, textAlign: "center", includeFontPadding: false, width: "100%" }} numberOfLines={1}>
      {text}
    </Text>
  );
}

function WebTabIcon({ emoji, color, mobileWeb = false }: { emoji: string; color: string; mobileWeb?: boolean }) {
  return (
    <View style={{ width: mobileWeb ? 26 : 28, height: mobileWeb ? 22 : 28, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: mobileWeb ? 20 : 18, color, textAlign: "center", includeFontPadding: false }}>{emoji}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { activeRole, activeStoreId, stores } = useOrg();

  const role = String(activeRole ?? "").trim().toLowerCase();
  const isCashier = role === "cashier";

  const activeStoreType = React.useMemo(() => {
    const row = (stores ?? []).find((s: any) => String(s?.store_id ?? "") === String(activeStoreId ?? ""));
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
  const isMobileWeb = isWeb && width < 900;
  const useLeftSidebarWeb = isWeb && !isMobileWeb;

  const hidden = { display: "none" as const };

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
              width: 238,
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
              paddingHorizontal: 10,
              shadowOpacity: 0,
              elevation: 0,
            }
          : {
              backgroundColor: theme.colors.tabBarBg,
              borderTopColor: "rgba(255,255,255,0.12)",
              borderTopWidth: 1,
              height: isMobileWeb ? 68 + Math.max(insets.bottom, 8) : 58 + insets.bottom,
              paddingBottom: isMobileWeb ? Math.max(insets.bottom, 8) : insets.bottom,
              paddingTop: isMobileWeb ? 2 : 6,
              paddingHorizontal: isMobileWeb ? 2 : 4,
              shadowOpacity: 0,
              elevation: 0,
            },

        tabBarItemStyle: useLeftSidebarWeb
          ? { minHeight: 52, borderRadius: theme.radius.md, marginVertical: 3, paddingHorizontal: 8 }
          : isMobileWeb
          ? { minHeight: 52, paddingTop: 0, paddingBottom: 2, paddingHorizontal: 0, marginHorizontal: 0, borderRadius: theme.radius.md }
          : { borderRadius: theme.radius.md },

        tabBarActiveBackgroundColor: useLeftSidebarWeb ? "rgba(255,255,255,0.12)" : "transparent",

        tabBarBackground: () => <View style={{ flex: 1, backgroundColor: theme.colors.tabBarBg }} />,

        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.68)",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarLabel: ({ color }) => <TabLabel text="Home" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="🏠" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="stores" options={{ title: "Stores", tabBarItemStyle: isCashier ? hidden : undefined, tabBarLabel: ({ color }) => <TabLabel text="Stores" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="🏬" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="products" options={{ title: "Products", tabBarItemStyle: isCashier || isSpecialStore ? hidden : undefined, href: isSpecialStore ? null : undefined, tabBarLabel: ({ color }) => <TabLabel text="Product" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="🏷️" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="sales" options={{ title: "Sales", tabBarItemStyle: isSpecialStore ? hidden : undefined, href: isSpecialStore ? null : undefined, tabBarLabel: ({ color }) => <TabLabel text="Sales" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="🛒" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="credit" options={{ title: "Credit", tabBarItemStyle: isCashier || isSpecialStore ? hidden : undefined, href: isSpecialStore ? null : undefined, tabBarLabel: ({ color }) => <TabLabel text="Credit" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="💳" color={color} mobileWeb={isMobileWeb} /> }} />

      <Tabs.Screen name="capital-recovery/workspace" options={{ title: "Recovery", href: isCapitalRecoveryStore && !isCashier ? "/capital-recovery/workspace" : null, tabBarItemStyle: !isCapitalRecoveryStore || isCashier ? hidden : undefined, tabBarLabel: ({ color }) => <TabLabel text="Recovery" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="💼" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="field-procurement/workspace" options={{ title: "Field", href: isFieldProcurementStore && !isCashier ? "/field-procurement/workspace" : null, tabBarItemStyle: !isFieldProcurementStore || isCashier ? hidden : undefined, tabBarLabel: ({ color }) => <TabLabel text="Field" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="🧭" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="field-procurement/history" options={{ title: "History", href: isFieldProcurementStore && !isCashier ? "/field-procurement/history" : null, tabBarItemStyle: !isFieldProcurementStore || isCashier ? hidden : undefined, tabBarLabel: ({ color }) => <TabLabel text="History" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="📜" color={color} mobileWeb={isMobileWeb} /> }} />

      <Tabs.Screen name="club" options={{ title: "Club", tabBarItemStyle: isCashier ? hidden : undefined, href: undefined, tabBarLabel: ({ color }) => <TabLabel text="Club" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="👥" color={color} mobileWeb={isMobileWeb} /> }} />
      <Tabs.Screen name="settings" options={{ title: "More", tabBarLabel: ({ color }) => <TabLabel text="More" color={color} mobileWeb={isMobileWeb} />, tabBarIcon: ({ color }) => <WebTabIcon emoji="⚙️" color={color} mobileWeb={isMobileWeb} /> }} />

      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="customers/index" options={{ href: null }} />
      <Tabs.Screen name="customers/[id]" options={{ href: null }} />
      <Tabs.Screen name="customers/insights" options={{ href: null }} />
      <Tabs.Screen name="staff" options={{ href: null }} />
      <Tabs.Screen name="capital-recovery/history" options={{ href: null }} />
    </Tabs>
  );
}