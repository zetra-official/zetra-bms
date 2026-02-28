// app/(tabs)/_layout.tsx
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabLabel({ text, color }: { text: string; color: string }) {
  return <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{text}</Text>;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBarBg,
          borderTopColor: "rgba(255,255,255,0.08)",
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: theme.colors.tabBarBg }} />
        ),
        tabBarActiveTintColor: theme.colors.emerald,
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ color }) => <TabLabel text="Home" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarLabel: ({ color }) => <TabLabel text="Stores" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          tabBarLabel: ({ color }) => <TabLabel text="Products" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="pricetags-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarLabel: ({ color }) => <TabLabel text="Sales" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="club"
        options={{
          title: "Club",
          tabBarLabel: ({ color }) => <TabLabel text="Club" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="people-circle-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ✅ KEEP Credit ON TAB BAR */}
      <Tabs.Screen
        name="credit"
        options={{
          title: "Credit",
          tabBarLabel: ({ color }) => <TabLabel text="Credit" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />

      /**
       * ✅ MORE tab (REAL route is settings/index.tsx)
       * - This removes the "No route named settings" warning
       * - Forces the bottom label to be exactly "More"
       * - Premium icon: ellipsis circle (matches global apps)
       */
      <Tabs.Screen
        name="settings/index"
        options={{
          title: "More",
          tabBarLabel: ({ color }) => <TabLabel text="More" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons
              name="ellipsis-horizontal-circle-outline"
              size={Math.max(size, 24)}
              color={color}
            />
          ),
        }}
      />

      {/* ✅ Staff is NOT a tab; it lives inside More */}
      <Tabs.Screen name="staff" options={{ href: null }} />

      {/* ✅ Hide nested settings pages from tab bar */}
      <Tabs.Screen name="settings/organization" options={{ href: null }} />
      <Tabs.Screen name="settings/regional" options={{ href: null }} />

      {/* ✅ Hide notifications (if exists) */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}