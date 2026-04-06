import { useOrg } from "@/src/context/OrgContext";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, Text, View, useWindowDimensions } from "react-native";
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
        fontWeight: "800",
        fontSize: mobileWeb ? 11 : 12,
        lineHeight: mobileWeb ? 13 : 14,
        textAlign: "center",
        includeFontPadding: false,
        width: "100%",
      }}
      numberOfLines={1}
      ellipsizeMode="clip"
      adjustsFontSizeToFit={false}
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
        width: mobileWeb ? 26 : 24,
        height: mobileWeb ? 22 : 20,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: mobileWeb ? 20 : 18,
          color,
          textAlign: "center",
          includeFontPadding: false,
          lineHeight: mobileWeb ? 20 : 18,
        }}
      >
        {emoji}
      </Text>
    </View>
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
  const { width } = useWindowDimensions();

  // IMPORTANT:
  // Desktop web ibaki kama ilivyo.
  // Mobile web (iPhone/Android browser) ifanane na app ya simu.
  const isMobileWeb = isWeb && width < 900;
  const useLeftSidebarWeb = isWeb && !isMobileWeb;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: useLeftSidebarWeb ? "left" : "bottom",
        tabBarLabelPosition: useLeftSidebarWeb ? "beside-icon" : "below-icon",
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarStyle: useLeftSidebarWeb
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
              height: isMobileWeb ? 72 + Math.max(insets.bottom, 8) : 56 + insets.bottom,
              paddingBottom: isMobileWeb ? Math.max(insets.bottom, 8) : insets.bottom,
              paddingTop: isMobileWeb ? 4 : 6,
              paddingHorizontal: isMobileWeb ? 4 : 0,
            },
        tabBarItemStyle: useLeftSidebarWeb
          ? {
              minHeight: 56,
              borderRadius: 16,
              marginVertical: 4,
              paddingHorizontal: 10,
            }
          : isMobileWeb
          ? {
              minHeight: 56,
              paddingTop: 2,
              paddingBottom: 4,
              paddingHorizontal: 0,
              marginHorizontal: 0,
              alignItems: "center",
              justifyContent: "center",
            }
          : undefined,
        tabBarLabelStyle: useLeftSidebarWeb
          ? {
              marginLeft: 10,
            }
          : isMobileWeb
          ? {
              fontSize: 11,
              fontWeight: "800",
              lineHeight: 13,
              marginTop: 0,
              marginBottom: 0,
              paddingBottom: 0,
              textAlign: "center",
              alignSelf: "center",
            }
          : undefined,
        tabBarIconStyle: useLeftSidebarWeb
          ? {
              marginLeft: 2,
            }
          : isMobileWeb
          ? {
              marginTop: 0,
              marginBottom: 0,
              alignSelf: "center",
            }
          : undefined,
        tabBarActiveBackgroundColor: useLeftSidebarWeb ? "rgba(16,185,129,0.14)" : "transparent",
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
          tabBarLabel: ({ color }) => <TabLabel text="Home" color={color} mobileWeb={isMobileWeb} />,
         tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="🏠" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Stores" color={color} />,
       tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="🏬" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      <Tabs.Screen
        name="products"
        options={{
          title: "Products",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Products" color={color} />,
  tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="🏷️" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarLabel: ({ color }) => <TabLabel text="Sales" color={color} />,
   tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="🛒" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      <Tabs.Screen
        name="credit"
        options={{
          title: "Credit",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Credit" color={color} />,
          tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="💳" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      <Tabs.Screen
        name="club"
        options={{
          title: "Club",
          tabBarItemStyle: isCashier ? { display: "none" } : undefined,
          tabBarLabel: ({ color }) => <TabLabel text="Club" color={color} />,
          tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="👥" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "More",
          tabBarLabel: ({ color }) => <TabLabel text="More" color={color} />,
         tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="⋯" color={color} mobileWeb={isMobileWeb} />
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
          tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="🔔" color={color} mobileWeb={isMobileWeb} />
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
          tabBarIcon: ({ color }) => (
  <WebTabIcon emoji="📦" color={color} mobileWeb={isMobileWeb} />
),
        }}
      />

      {/* hidden routes */}
      <Tabs.Screen name="staff" options={{ href: null }} />
    </Tabs>
  );
}