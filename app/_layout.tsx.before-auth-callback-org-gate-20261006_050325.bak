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
import {
  ActivityIndicator,
  Platform,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

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
    a === "email-verified" ||
    (a === "(auth)" &&
      (
        b === "login" ||
        b === "register" ||
        b === "reset-password" ||
        b === "email-verified"
      ))
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
  console.log("AUTH DEBUG: before getSession");

  const sessionResult = await Promise.race([
    supabase.auth.getSession(),

    new Promise<any>((resolve) => {
      setTimeout(() => {
        resolve({
          data: {
            session: null,
          },
          error: new Error(
            "getSession timed out after 5000ms"
          ),
          __timedOut: true,
        });
      }, 5000);
    }),
  ]);

  console.log(
    "AUTH DEBUG: after getSession",
    sessionResult
  );

  const session =
    sessionResult?.data?.session ?? null;

  const error =
    sessionResult?.error ?? null;

  if (sessionResult?.__timedOut) {
    return {
      session: null,
      error,
    };
  }

  const jwtExpired =
    !!error &&
    /jwt\s*expired/i.test(
      String(error?.message ?? "")
    );

  const isExpiredByTime =
    !!session?.expires_at &&
    session.expires_at * 1000 <=
      Date.now() + 5000;

  if (
    jwtExpired ||
    isExpiredByTime
  ) {
    console.log(
      "AUTH DEBUG: before refreshSession"
    );

    const refreshResult =
      await Promise.race([
        supabase.auth.refreshSession(),

        new Promise<any>(
          (resolve) => {
            setTimeout(() => {
              resolve({
                data: {
                  session: null,
                },
                error: new Error(
                  "refreshSession timed out after 5000ms"
                ),
                __timedOut: true,
              });
            }, 5000);
          }
        ),
      ]);

    console.log(
      "AUTH DEBUG: after refreshSession",
      refreshResult
    );

    if (
      refreshResult?.error
    ) {
      return {
        session: null,
        error: refreshResult.error,
      };
    }

    return {
      session:
        refreshResult?.data?.session ??
        null,
      error: null,
    };
  }

  return {
    session,
    error,
  };
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>([]);
 const [ready, setReady] = useState(false);
const [hasSession, setHasSession] = useState<boolean | null>(null);
const [isOfficeUser, setIsOfficeUser] = useState(false);

const [bootStage, setBootStage] = useState("START");

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

  const orgSettling = orgLoading;
  const orgBusy = orgLoading || orgRefreshing;

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
      if (isOfficeUser) return;
      if (orgBusy) return;
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
  }, [router, ready, hasSession, isOfficeUser, orgBusy]);

  useEffect(() => {
    let alive = true;

    const isInAuth = (segs: string[]) => isAuthRoute(segs);

    const isResetPasswordRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];
      return a === "reset-password" || (a === "(auth)" && b === "reset-password");
    };

    const isEmailVerifiedRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];

      return (
        a === "email-verified" ||
        (a === "(auth)" && b === "email-verified")
      );
    };

  const routes = {
  login: "/login",
  resetPassword:
    Platform.OS === "web" ? "/reset-password" : "/(auth)/reset-password",
  emailVerified:
    Platform.OS === "web" ? "/email-verified" : "/(auth)/email-verified",
  onboarding: "/(onboarding)/referral",
  home: "/(tabs)",
  office: "/office",
};

const boot = async () => {
  setBootStage("INITIAL_URL");

  let initialResult: any = {
    handled: false,
    ok: true,
    type: null,
  };

  try {
    initialResult = await Promise.race([
      applySupabaseSessionFromInitialUrl(),

      new Promise<any>((resolve) => {
        setTimeout(() => {
          resolve({
            handled: false,
            ok: true,
            type: null,
            timedOut: true,
          });
        }, 1500);
      }),
    ]);
  } catch (e) {
    console.log(
      "Initial auth URL processing skipped:",
      e
    );

    initialResult = {
      handled: false,
      ok: true,
      type: null,
    };
  }

  if (!alive) return;

  setBootStage("INITIAL_URL_DONE");

  const currentSegs = segmentsRef.current;

  const inAuth = isInAuth(currentSegs);

  const inResetPassword =
    isResetPasswordRoute(currentSegs);

  const inEmailVerified =
    isEmailVerifiedRoute(currentSegs);

  if (
    initialResult?.handled &&
    String(initialResult?.type ?? "").toLowerCase() ===
      "recovery"
  ) {
    setBootStage("RECOVERY_ROUTE");
    setHasSession(true);
    setReady(true);

    router.replace(
      routes.resetPassword as any
    );

    return;
  }

  setBootStage("GET_SESSION");

let sessionResult: {
  session: any;
  error: any;
};

try {
  sessionResult = await Promise.race([
    getValidSession(),

    new Promise<{
      session: null;
      error: Error;
    }>((resolve) => {
      setTimeout(() => {
        resolve({
          session: null,
          error: new Error(
            "Supabase session check timed out"
          ),
        });
      }, 8000);
    }),
  ]);
} catch (e: any) {
  sessionResult = {
    session: null,
    error:
      e instanceof Error
        ? e
        : new Error(
            String(
              e?.message ??
                "Session check failed"
            )
          ),
  };
}

  if (!alive) return;

  setBootStage("SESSION_RETURNED");

  const { session, error } =
    sessionResult;

  if (error && !session) {
    console.log(
      "Auth boot session error:",
      error
    );

    setBootStage("SESSION_ERROR");
    setHasSession(false);
    setIsOfficeUser(false);
    setReady(true);

    if (!inAuth) {
      router.replace(
        routes.login as any
      );
    }

    return;
  }

  if (!session) {
    setBootStage("NO_SESSION");
    setHasSession(false);
    setIsOfficeUser(false);
    setReady(true);

    if (!inAuth) {
      router.replace(
        routes.login as any
      );
    }

    return;
  }

  setBootStage("SESSION_FOUND");

  if (inResetPassword) {
    setHasSession(true);
    setReady(true);
    setBootStage("RESET_READY");
    return;
  }

  if (inEmailVerified) {
    setHasSession(true);
    setReady(true);
    setBootStage(
      "EMAIL_VERIFIED_READY"
    );
    return;
  }

  const verified =
    isEmailVerified(session.user);

  if (!verified) {
    setBootStage("EMAIL_NOT_VERIFIED");
    setHasSession(false);
    setIsOfficeUser(false);
    setReady(true);

    if (!inAuth) {
      router.replace(
        routes.login as any
      );
    }

    return;
  }

  setBootStage("EMAIL_VERIFIED");

  const email = String(
    session.user?.email ?? ""
  )
    .trim()
    .toLowerCase();

  const officeUser =
    email === INTERNAL_BILLING_EMAIL;

  setHasSession(true);
  setIsOfficeUser(officeUser);

  if (officeUser) {
    setBootStage("OFFICE_READY");

    /*
     * IMPORTANT:
     * Unlock Root Stack first,
     * then navigate to Office.
     */
    setReady(true);

    setTimeout(() => {
      if (!alive) return;

      router.replace(
        routes.office as any
      );
    }, 0);

    return;
  }

  setBootStage("NORMAL_USER_READY");
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
          setIsOfficeUser(false);
          setReady(true);

          if (!inAuth) {
            router.replace(routes.login as any);
          }

          return;
        }

      if (event === "TOKEN_REFRESHED") {
  if (!session) {
    setHasSession(false);
    setIsOfficeUser(false);
    return;
  }

  const email = String(session.user?.email ?? "")
    .trim()
    .toLowerCase();

  const officeUser =
    email === INTERNAL_BILLING_EMAIL;

  setHasSession(true);
  setIsOfficeUser(officeUser);

  /*
   * IMPORTANT:
   * TOKEN_REFRESHED should update auth state only.
   * It must NOT force navigation back to /office,
   * because the office user may currently be inside:
   *
   * /office/customers
   * /office/...
   */
  return;
}

      if (!session) {
  setHasSession(false);
  setIsOfficeUser(false);
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
          setIsOfficeUser(false);
          setReady(true);

          if (!inAuth) {
            router.replace(routes.login as any);
          }

          return;
        }

        const email = String(session.user?.email ?? "")
          .trim()
          .toLowerCase();

     const officeUser =
  email === INTERNAL_BILLING_EMAIL;

setHasSession(true);
setIsOfficeUser(officeUser);
setReady(true);

if (officeUser) {
  const currentSegs =
    segmentsRef.current ?? [];

  const alreadyInOffice =
    currentSegs?.[0] === "office";

  if (!alreadyInOffice) {
    router.replace(
      routes.office as any
    );
  }

  return;
}
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

      const email = String(recovered.session.user?.email ?? "")
        .trim()
        .toLowerCase();

      const officeUser = email === INTERNAL_BILLING_EMAIL;

      setHasSession(true);
      setIsOfficeUser(officeUser);

      router.replace(
        officeUser
          ? (routes.office as any)
          : (routes.home as any)
      );
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

    const isEmailVerifiedRoute = (segs: string[]) => {
      const a = segs?.[0];
      const b = segs?.[1];

      return (
        a === "email-verified" ||
        (a === "(auth)" && b === "email-verified")
      );
    };

    if (isResetPasswordRoute(currentSegs)) return;
    if (isEmailVerifiedRoute(currentSegs)) return;

    const isOfficeRoute = currentSegs?.[0] === "office";

    if (isOfficeUser) {
      if (!isOfficeRoute) {
        router.replace("/office" as any);
      }
      return;
    }

    if (orgLoading) return;

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
  }, [ready, hasSession, isOfficeUser, orgLoading, orgs, router]);

  useEffect(() => {
    return () => {
      if (webScanTimerRef.current) {
        clearTimeout(webScanTimerRef.current);
        webScanTimerRef.current = null;
      }
    };
  }, []);

if (
  !ready ||
  !fontsLoaded ||
  (
    Platform.OS !== "web" &&
    hasSession === true &&
    !isOfficeUser &&
    orgLoading
  )
) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StatusBar
        style="light"
        backgroundColor={theme.colors.background}
      />

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
      <AuthGate  />
    </OrgProvider>
  );
}