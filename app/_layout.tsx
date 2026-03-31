import { OrgProvider, useOrg } from "@/src/context/OrgContext";
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

  const {
    loading: orgLoading,
    orgs,
    activeOrgId,
  } = useOrg();

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    let alive = true;

    const isInAuth = (segs: string[]) => segs?.[0] === "(auth)";
    const isInOnboarding = (segs: string[]) => segs?.[0] === "(onboarding)";
    const isResetPasswordRoute = (segs: string[]) =>
      segs?.[0] === "(auth)" && segs?.[1] === "reset-password";
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

      const currentSegs = segmentsRef.current;
      const inAuth = isInAuth(currentSegs);
      const inOnboarding = isInOnboarding(currentSegs);
      const inResetPassword = isResetPasswordRoute(currentSegs);

      if (!session) {
        if (!inAuth) router.replace("/(auth)/login");
        setReady(true);
        return;
      }

      if (inResetPassword) {
        setReady(true);
        return;
      }

      const verified = isEmailVerified(session.user);

      if (!verified) {
        if (!inAuth) router.replace("/(auth)/login");
        setReady(true);
        return;
      }

      // IMPORTANT:
      // verified user must pass org/onboarding check before entering tabs
      if (orgLoading) {
        setReady(true);
        return;
      }

      const hasWorkspace = !!activeOrgId || (orgs?.length ?? 0) > 0;

      if (!hasWorkspace) {
        if (!inOnboarding) {
          router.replace("/(onboarding)");
        }
        setReady(true);
        return;
      }

      if (inAuth || inOnboarding) {
        router.replace("/(tabs)");
      }

      setReady(true);
    };

    void boot();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const currentSegs = segmentsRef.current;
      const inAuth = isInAuth(currentSegs);
      const inOnboarding = isInOnboarding(currentSegs);
      const inResetPassword = isResetPasswordRoute(currentSegs);

      if (!session) {
        if (!inAuth) router.replace("/(auth)/login");
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        router.replace("/(auth)/reset-password");
        return;
      }

      if (inResetPassword) {
        return;
      }

      const verified = isEmailVerified(session.user);

      if (!verified) {
        if (!inAuth) router.replace("/(auth)/login");
        return;
      }

      if (orgLoading) {
        return;
      }

      const hasWorkspace = !!activeOrgId || (orgs?.length ?? 0) > 0;

      if (!hasWorkspace) {
        if (!inOnboarding) {
          router.replace("/(onboarding)");
        }
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        if (inAuth || inOnboarding) {
          router.replace("/(tabs)");
        }
      }
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [router, orgLoading, orgs, activeOrgId]);

  if (!ready || orgLoading) {
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