import { OrgProvider, useOrg } from "@/src/context/OrgContext";
import {
  applySupabaseSessionFromInitialUrl,
  applySupabaseSessionFromUrl,
  supabase,
} from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import {
  Ionicons,
  MaterialIcons,
  MaterialCommunityIcons,
  Feather,
  FontAwesome,
  FontAwesome5,
  AntDesign,
  Entypo,
  EvilIcons,
  Foundation,
  Octicons,
  SimpleLineIcons,
  Zocial,
} from "@expo/vector-icons";
import { useFonts } from "expo-font";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";

function cleanBarcode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

function isTypingIntoField(target: any) {
  if (!target) return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  const editable = !!target.isContentEditable;
  return editable || tag === "input" || tag === "textarea" || tag === "select";
}

function isEmailVerified(user: any) {
  return !!(user?.email_confirmed_at ?? user?.confirmed_at);
}

function isAuthRoute(segs: string[]) {
  const a = segs?.[0];
  const b = segs?.[1];
  return (
    a === "(auth)" ||
    a === "login" ||
    a === "register" ||
    a === "reset-password" ||
    (a === "(auth)" &&
      (b === "login" || b === "register" || b === "reset-password"))
  );
}

function isOnboardingRoute(segs: string[]) {
  const a = segs?.[0];
  const b = segs?.[1];

  return (
    a === "(onboarding)" ||
    a === "business" ||
    a === "store" ||
    a === "referral" ||
    (a === "(onboarding)" &&
      (b === "business" || b === "store" || b === "referral"))
  );
}

async function getValidSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  const jwtExpired =
    !!error && /jwt\s*expired/i.test(String(error.message ?? ""));

  const isExpiredByTime =
    !!session?.expires_at && session.expires_at * 1000 <= Date.now() + 5000;

  if (jwtExpired || isExpiredByTime) {
    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError) {
      return { session: null, error: refreshError };
    }

    return { session: refreshed.session ?? null, error: null };
  }

  return { session: session ?? null, error: error ?? null };
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const webScanBufferRef = useRef("");
  const webScanLastAtRef = useRef(0);
  const webScanStartedAtRef = useRef(0);
  const webScanTimerRef = useRef<any>(null);

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...MaterialCommunityIcons.font,
    ...Feather.font,
    ...FontAwesome.font,
    ...FontAwesome5.font,
    ...AntDesign.font,
    ...Entypo.font,
    ...EvilIcons.font,
    ...Foundation.font,
    ...Octicons.font,
    ...SimpleLineIcons.font,
    ...Zocial.font,
  });

  const { loading: orgLoading, refreshing: orgRefreshing, orgs } = useOrg();

  const orgSettling = orgLoading || orgRefreshing;

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const resetWebScanBuffer = () => {
      webScanBufferRef.current = "";
      webScanLastAtRef.current = 0;
      webScanStartedAtRef.current = 0;

      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };

    const flushWebScanBuffer = () => {
      const code = cleanBarcode(webScanBufferRef.current);
      const startedAt = webScanStartedAtRef.current;
      const endedAt = webScanLastAtRef.current;

      resetWebScanBuffer();

      if (!code || code.length < 4) return;

      const duration =
        startedAt > 0 && endedAt >= startedAt ? endedAt - startedAt : 0;

      if (duration > 900 && code.length < 8) return;

      const segs = segmentsRef.current ?? [];
      const a = segs?.[0];
      const b = segs?.[1];
      const c = segs?.[2];

      const isInAuth = isAuthRoute(segs);
      const isInOnboarding = isOnboardingRoute(segs);

      const isSalesRoute = a === "(tabs)" && b === "sales";

      const isProductsRoute = a === "(tabs)" && b === "products";

      const isInventoryRoute =
        (a === "(tabs)" && b === "stores" && c === "inventory") ||
        (a === "(tabs)" &&
          b === "stores" &&
          String(c ?? "").startsWith("inventory"));

      if (!ready) return;
      if (hasSession !== true) return;
      if (orgSettling) return;
      if (isInAuth || isInOnboarding) return;

      if (isProductsRoute || isInventoryRoute) return;

      if (isSalesRoute) return;

      router.replace({
        pathname: "/(tabs)/sales",
        params: {
          barcode: code,
          _ts: String(Date.now()),
        },
      } as any);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as any;
      if (isTypingIntoField(target)) return;

      const key = String(e.key ?? "");
      const now = Date.now();

      if (!key) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (
        key === "Shift" ||
        key === "Control" ||
        key === "Alt" ||
        key === "Meta" ||
        key === "Tab"
      ) {
        return;
      }

      if (key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        flushWebScanBuffer();
        return;
      }

      if (key.length !== 1) return;

      e.stopPropagation();

      if (now - webScanLastAtRef.current > 120) {
        webScanBufferRef.current = "";
        webScanStartedAtRef.current = now;
      }

      if (!webScanStartedAtRef.current) {
        webScanStartedAtRef.current = now;
      }

      webScanBufferRef.current += key;
      webScanLastAtRef.current = now;

      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
      }

      webScanTimerRef.current = setTimeout(() => {
        flushWebScanBuffer();
      }, 180);
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      resetWebScanBuffer();
    };
  }, [router, ready, hasSession, orgSettling]);

  useEffect(() => {
    let alive = true;

    const isInAuth = (segs: string[]) => isAuthRoute(segs);

    const isResetPasswordRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return a === "reset-password" || (a === "(auth)" && b === "reset-password");
    };

    const routes = {
      login: "/login",
      resetPassword:
        Platform.OS === "web" ? "/reset-password" : "/(auth)/reset-password",
      onboarding: "/(onboarding)/referral",
      home: "/(tabs)",
    };

    const boot = async () => {
      const initialResult = await applySupabaseSessionFromInitialUrl();

      if (!alive) return;

      const currentSegs = segmentsRef.current;
      const inAuth = isInAuth(currentSegs);
      const inResetPassword = isResetPasswordRoute(currentSegs);

      if (
        initialResult.handled &&
        String(initialResult.type ?? "").toLowerCase() === "recovery"
      ) {
        router.replace(routes.resetPassword as any);
        setReady(true);
        return;
      }

      const { session, error } = await getValidSession();

      if (!alive) return;

      if (error) {
        setReady(true);
        return;
      }

      if (!session) {
        setHasSession(false);

        if (!inAuth) {
          router.replace(routes.login as any);
        }
        setReady(true);
        return;
      }

      if (inResetPassword) {
        setHasSession(true);
        setReady(true);
        return;
      }

      const verified = isEmailVerified(session.user);

      if (!verified) {
        setHasSession(false);

        if (!inAuth) {
          router.replace(routes.login as any);
        }
        setReady(true);
        return;
      }

      setHasSession(true);
      setReady(true);
    };

    void boot();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentSegs = segmentsRef.current;
        const inAuth = isInAuth(currentSegs);
        const inResetPassword = isResetPasswordRoute(currentSegs);

        if (event === "PASSWORD_RECOVERY") {
          router.replace(routes.resetPassword as any);
          return;
        }

        if (event === "SIGNED_OUT") {
          setHasSession(false);
          setReady(true);

          if (!inAuth) {
            router.replace(routes.login as any);
          }
          return;
        }

        if (event === "TOKEN_REFRESHED") {
          setHasSession(!!session);
          return;
        }

        if (!session) {
          setHasSession(false);
          setReady(true);

          if (!inAuth) {
            router.replace(routes.login as any);
          }
          return;
        }

        if (inResetPassword) return;

        const verified = isEmailVerified(session.user);

        if (!verified) {
          setHasSession(false);
          setReady(true);

          if (!inAuth) {
            router.replace(routes.login as any);
          }
          return;
        }

        setHasSession(true);
        setReady(true);
      }
    );

    const urlSub = Linking.addEventListener("url", async ({ url }) => {
      const result = await applySupabaseSessionFromUrl(url);
      const authType = String(result.type ?? "").toLowerCase();

      if (authType === "recovery") {
        router.replace(routes.resetPassword as any);
      }

      if (!result.handled) return;
      if (!result.ok) return;
      if (authType === "recovery") return;

      const recovered = await getValidSession();

      if (!recovered.session) return;

      setHasSession(true);
      router.replace(routes.home as any);
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      urlSub.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (hasSession !== true) return;

    const currentSegs = segmentsRef.current;

    const isInAuth = (segs: string[]) => isAuthRoute(segs);

    const isResetPasswordRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return a === "reset-password" || (a === "(auth)" && b === "reset-password");
    };

    if (isResetPasswordRoute(currentSegs)) return;
    if (orgSettling) return;

    const inAuth = isInAuth(currentSegs);
    const inOnboarding = isOnboardingRoute(currentSegs);
    const hasOrg = Array.isArray(orgs) && orgs.length > 0;

    if (!hasOrg) {
      if (!inOnboarding) {
        router.replace("/(onboarding)/referral" as any);
      }
      return;
    }

    if (inAuth || inOnboarding) {
      router.replace("/(tabs)" as any);
    }
  }, [ready, hasSession, orgSettling, orgs, router]);

  useEffect(() => {
    return () => {
      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };
  }, []);

  if (!ready || !fontsLoaded || (hasSession === true && orgSettling)) {
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