// app/(tabs)/_layout.tsx
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const BASE_HEIGHT = 56;

  const tabBarStyle = useMemo(() => {
    return {
      backgroundColor: theme.colors.tabBarBg,
      borderTopColor: "rgba(255,255,255,0.08)",
      borderTopWidth: 1,
      height: BASE_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 6,
      elevation: 0,
    } as const;
  }, [insets.bottom]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: theme.colors.tabBarBg }} />
        ),
        tabBarActiveTintColor: theme.colors.emerald,
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
        tabBarLabelStyle: { fontWeight: "700", fontSize: 12 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="pricetags-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ✅ Sales: always go to /sales root */}
      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace("/(tabs)/sales");
          },
        }}
      />

      {/* ✅ Club: always go to /club root */}
      <Tabs.Screen
        name="club"
        options={{
          title: "Club",
          tabBarIcon: ({ size, color, focused }) => (
            <View
              style={{
                width: 36,
                height: 30,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: focused
                  ? "rgba(52,211,153,0.35)"
                  : "rgba(255,255,255,0.10)",
                backgroundColor: focused
                  ? "rgba(52,211,153,0.14)"
                  : "rgba(255,255,255,0.05)",
              }}
            >
              <Ionicons
                name="people-circle-outline"
                size={size - 2}
                color={color}
              />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace("/(tabs)/club");
          },
        }}
      />

      <Tabs.Screen
        name="staff"
        options={{
          title: "Staff",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="credit"
        options={{
          title: "Credit",
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}