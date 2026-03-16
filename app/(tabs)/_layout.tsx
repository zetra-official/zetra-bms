import { useOrg } from "@/src/context/OrgContext";
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
  const { activeRole } = useOrg();

  const isCashier = activeRole === "cashier";

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
          href: isCashier ? null : undefined,
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
          href: isCashier ? null : undefined,
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
        name="credit"
        options={{
          title: "Credit",
          href: isCashier ? null : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Credit" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="card-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="club"
        options={{
          title: "Club",
          href: isCashier ? null : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Club" color={color} />,
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="people-circle-outline" size={size} color={color} />
          ),
        }}
      />

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

      {/* hidden routes */}
      <Tabs.Screen name="staff" options={{ href: null }} />
      <Tabs.Screen name="settings/organization" options={{ href: null }} />
      <Tabs.Screen name="settings/regional" options={{ href: null }} />
      <Tabs.Screen name="settings/subscription" options={{ href: null }} />
      <Tabs.Screen name="settings/cashier-closing" options={{ href: null }} />
      <Tabs.Screen name="settings/business-statement" options={{ href: null }} />

      {/* Meeting Room Flow */}
      <Tabs.Screen name="settings/meeting-room" options={{ href: null }} />
      <Tabs.Screen name="settings/meeting-room-create" options={{ href: null }} />
      <Tabs.Screen name="settings/meeting-room-list" options={{ href: null }} />
      <Tabs.Screen name="settings/meeting-room-detail" options={{ href: null }} />
      <Tabs.Screen name="settings/meeting-room-invites" options={{ href: null }} />
    </Tabs>
  );
}