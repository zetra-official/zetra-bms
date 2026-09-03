import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

export default function OfficeScreen() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [sessionEmail, setSessionEmail] = useState("");

  const checkAccess = useCallback(async () => {
    setCheckingAccess(true);

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      const email = String(data?.user?.email ?? "")
        .trim()
        .toLowerCase();

      setSessionEmail(email);

      const ok = email === INTERNAL_BILLING_EMAIL;

      setAllowed(ok);

      if (!ok) {
        Alert.alert(
          "Restricted",
          "Hii ni ZETRA Office Dashboard pekee."
        );

        router.replace("/(tabs)" as any);
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

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/login" as any);
    } catch (e: any) {
      Alert.alert(
        "Sign out failed",
        e?.message ?? "Imeshindikana kutoka."
      );
    }
  }, [router]);

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
          Checking ZETRA Office access...
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
        paddingBottom: 40,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 28,
              fontWeight: "900",
            }}
          >
            ZETRA Office
          </Text>

          <Text
            style={{
              color: theme.colors.muted,
              fontWeight: "800",
              marginTop: 4,
            }}
          >
            Customer & Subscription Command Center
          </Text>
        </View>

        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            minHeight: 42,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(239,68,68,0.30)",
            backgroundColor: "rgba(239,68,68,0.08)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "900",
            }}
          >
            Sign Out
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 18,
          borderWidth: 1,
          borderColor: "rgba(16,185,129,0.28)",
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          padding: 16,
        }}
      >
        <Text
          style={{
            color: theme.colors.muted,
            fontWeight: "800",
            fontSize: 12,
          }}
        >
          OFFICE ACCOUNT
        </Text>

        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 15,
            marginTop: 6,
          }}
        >
          {sessionEmail}
        </Text>
      </View>

      <View
        style={{
          marginTop: 16,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
     <OfficeCard
  title="Customers"
  subtitle="Performance, activity na customer health"
  onPress={() =>
    router.push("/office/customers" as any)
  }
/>

   <OfficeCard
  title="Subscriptions"
  subtitle="Active, expiring na expired plans"
  onPress={() =>
    router.push("/office/subscriptions" as any)
  }
/>

     <OfficeCard
  title="Payment Requests"
  subtitle="Review subscription payment requests"
  onPress={() =>
    router.push("/office/payment-requests" as any)
  }
/>

   <OfficeCard
  title="Growth Partners"
  subtitle="Partners, referrals na commissions"
  onPress={() =>
    router.push({
      pathname: "/office/growth-partners",
      params: {
        tab: "partners",
      },
    } as any)
  }
/>

        <OfficeCard
  title="Follow-ups"
  subtitle="Customers wanaokaribia ku-expire"
  onPress={() =>
    router.push("/office/follow-ups" as any)
  }
/>

   <OfficeCard
  title="System Performance"
  subtitle="Stores, usage na customer activity"
  onPress={() =>
    router.push("/office/system-performance" as any)
  }
/>
      </View>
    </ScrollView>
  );
}

function OfficeCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 260,
        flexGrow: 1,
        flexBasis: 260,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.10)",
        backgroundColor: "#FFFFFF",
        padding: 16,
        minHeight: 125,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 17,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: theme.colors.muted,
          fontWeight: "800",
          fontSize: 12,
          lineHeight: 18,
          marginTop: 8,
        }}
      >
        {subtitle}
      </Text>

      <Text
        style={{
          color: theme.colors.emerald,
          fontWeight: "900",
          marginTop: 14,
        }}
      >
        Open →
      </Text>
    </Pressable>
  );
}