import { useOrg } from "@/src/context/OrgContext";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabLabel({ text, color }: { text: string; color: string }) {
  return (
    <Text
      style={{
        color,
        fontWeight: "800",
        fontSize: 14,
      }}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

function WebTabIcon({
  emoji,
  color,
}: {
  emoji: string;
  color: string;
}) {
  return (
    <Text
      style={{
        fontSize: 18,
        color,
        textAlign: "center",
        includeFontPadding: false,
      }}
    >
      {emoji}
    </Text>
  );
}



export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { activeRole } = useOrg();
  const [tabFontsLoaded] = useFonts(Ionicons.font);

  const isCashier = String(activeRole ?? "").trim().toLowerCase() === "cashier";

  if (!tabFontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isWeb ? "left" : "bottom",
        tabBarLabelPosition: isWeb ? "beside-icon" : "below-icon",
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarStyle: isWeb
          ? {
              backgroundColor: theme.colors.tabBarBg,
              borderRightColor: "rgba(255,255,255,0.08)",
              borderRightWidth: 1,
              borderTopWidth: 0,
              width: 252,
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
              paddingHorizontal: 12,
            }
          : {
              backgroundColor: theme.colors.tabBarBg,
              borderTopColor: "rgba(255,255,255,0.08)",
              borderTopWidth: 1,
              height: 56 + insets.bottom,
              paddingBottom: insets.bottom,
              paddingTop: 6,
            },
        tabBarItemStyle: isWeb
          ? {
              minHeight: 56,
              borderRadius: 16,
              marginVertical: 4,
              paddingHorizontal: 10,
            }
          : undefined,
        tabBarLabelStyle: isWeb
          ? {
              marginLeft: 10,
            }
          : undefined,
        tabBarIconStyle: isWeb
          ? {
              marginLeft: 2,
            }
          : undefined,
        tabBarActiveBackgroundColor: isWeb ? "rgba(16,185,129,0.14)" : "transparent",
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: theme.colors.tabBarBg }} />
        ),
        tabBarActiveTintColor: theme.colors.emerald,
        tabBarInactiveTintColor: "rgba(255,255,255,0.72)",
      }}
    >
      
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ color }) => <TabLabel text="Home" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="🏠" color={color} />
            ) : (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Stores" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="🏬" color={color} />
            ) : (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Products" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="🏷️" color={color} />
            ) : (
              <Ionicons name="pricetags-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarLabel: ({ color }) => <TabLabel text="Sales" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="🛒" color={color} />
            ) : (
              <Ionicons name="cart-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="credit"
        options={{
          title: "Credit",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Credit" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="💳" color={color} />
            ) : (
              <Ionicons name="card-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="club"
        options={{
          title: "Club",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Club" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="👥" color={color} />
            ) : (
              <Ionicons name="people-circle-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "More",
          tabBarLabel: ({ color }) => <TabLabel text="More" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="⋯" color={color} />
            ) : (
              <Ionicons
                name="ellipsis-horizontal-circle-outline"
                size={Math.max(size, 24)}
                color={color}
              />
            ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          href: isWeb ? "/notifications" : null,
          title: "Notifications",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Notifications" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="🔔" color={color} />
            ) : (
              <Ionicons name="notifications-outline" size={size} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="stocks/history"
        options={{
          href: isWeb ? "/stocks/history" : null,
          title: "Stock Value",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Stock Value" color={color} />,
          tabBarIcon: ({ size, color }) =>
            isWeb ? (
              <WebTabIcon emoji="📦" color={color} />
            ) : (
              <Ionicons name="cube-outline" size={size} color={color} />
            ),
        }}
      />

      {/* hidden routes */}
      <Tabs.Screen name="staff" options={{ href: null }} />
    </Tabs>
  );
}