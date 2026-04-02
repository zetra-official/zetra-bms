import { OrgProvider } from "@/src/context/OrgContext";
import {
  applySupabaseSessionFromInitialUrl,
  applySupabaseSessionFromUrl,
  supabase,
} from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
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
    const isResetPasswordRoute = (segs: string[]) =>
      segs?.[0] === "(auth)" && segs?.[1] === "reset-password";
    const isOnboardingRoute = (segs: string[]) => segs?.[0] === "(onboarding)";
    const isEmailVerified = (user: any) =>
      !!(user?.email_confirmed_at ?? user?.confirmed_at);

    const goAfterLogin = async () => {
      try {
        const { data: orgData, error: orgErr } = await supabase.rpc("get_my_orgs");

        if (orgErr) {
          router.replace("/(tabs)");
          return;
        }

        const orgs = Array.isArray(orgData) ? orgData : [];

        if (orgs.length === 0) {
          router.replace("/(onboarding)");
          return;
        }

        router.replace("/(tabs)");
      } catch {
        router.replace("/(tabs)");
      }
    };

    const boot = async () => {
      const initialResult = await applySupabaseSessionFromInitialUrl();

      if (!alive) return;

      const currentSegs = segmentsRef.current;
      const inAuth = isInAuth(currentSegs);
      const inResetPassword = isResetPasswordRoute(currentSegs);
      const inOnboarding = isOnboardingRoute(currentSegs);

      if (
        initialResult.handled &&
        String(initialResult.type ?? "").toLowerCase() === "recovery"
      ) {
        router.replace("/(auth)/reset-password");
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (error) {
        setReady(true);
        return;
      }

      if (!session) {
        if (!inAuth) {
          router.replace("/(auth)/login");
        }
        setReady(true);
        return;
      }

      // stay on reset-password screen when recovery session exists
      if (inResetPassword) {
        setReady(true);
        return;
      }

      const verified = isEmailVerified(session.user);

      if (!verified) {
        if (!inAuth) {
          router.replace("/(auth)/login");
        }
        setReady(true);
        return;
      }

      if (inAuth || inOnboarding) {
        await goAfterLogin();
      }

      setReady(true);
    };

    void boot();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentSegs = segmentsRef.current;
        const inAuth = isInAuth(currentSegs);
        const inResetPassword = isResetPasswordRoute(currentSegs);
        const inOnboarding = isOnboardingRoute(currentSegs);

        if (event === "PASSWORD_RECOVERY") {
          router.replace("/(auth)/reset-password");
          return;
        }

        if (!session) {
          if (!inAuth) {
            router.replace("/(auth)/login");
          }
          return;
        }

        if (inResetPassword) {
          return;
        }

        const verified = isEmailVerified(session.user);

        if (!verified) {
          if (!inAuth) {
            router.replace("/(auth)/login");
          }
          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION" ||
          event === "USER_UPDATED"
        ) {
          if (inAuth || inOnboarding) {
            await goAfterLogin();
          }
        }
      }
    );

    const urlSub = Linking.addEventListener("url", async ({ url }) => {
      const result = await applySupabaseSessionFromUrl(url);
      const authType = String(result.type ?? "").toLowerCase();

      if (authType === "recovery") {
        router.replace("/(auth)/reset-password");
      }

      if (!result.handled) return;

      if (!result.ok) return;

      if (authType === "recovery") {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const currentSegs = segmentsRef.current;
      const inResetPassword = isResetPasswordRoute(currentSegs);

      if (inResetPassword) return;

      const verified = isEmailVerified(session.user);

      if (!verified) {
        router.replace("/(auth)/login");
        return;
      }

      await goAfterLogin();
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      urlSub.remove();
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