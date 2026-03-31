import { OrgProvider } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    let alive = true;

    const isInAuth = (segs: string[]) => segs?.[0] === "(auth)";
    const isEmailVerified = (user: any) =>
      !!(user?.email_confirmed_at ?? user?.confirmed_at);

    const boot = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (error) {
        setReady(true);
        return;
      }

      const inAuth = isInAuth(segmentsRef.current);

      if (!session) {
        if (!inAuth) router.replace("/(auth)/login");
        setReady(true);
        return;
      }

      const verified = isEmailVerified(session.user);

      // user ana session lakini email bado haijaverify
      if (!verified) {
        if (!inAuth) router.replace("/(auth)/login");
        setReady(true);
        return;
      }

      // verified users only
      if (inAuth) {
        router.replace("/(tabs)");
      }

      setReady(true);
    };

    void boot();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const inAuth = isInAuth(segmentsRef.current);

      if (!session) {
        if (!inAuth) router.replace("/(auth)/login");
        return;
      }

      const verified = isEmailVerified(session.user);

      if (!verified) {
        if (!inAuth) router.replace("/(auth)/login");
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        if (inAuth) router.replace("/(tabs)");
      }
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" backgroundColor={theme.colors.background} />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={theme.colors.background} />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: Platform.OS === "android" ? "fade" : "default",
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <OrgProvider>
      <AuthGate />
    </OrgProvider>
  );
}