// src/context/OrgContext.tsx
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { kv, KV_KEYS } from "../storage/kv";
import { supabase } from "../supabase/supabaseClient";

/**
 * KATIBA (DORA v1):
 * - DB is source of truth
 * - OrgContext reads ONLY canonical sources via RPC: get_my_orgs / get_my_stores
 * - Onboarding uses RPC create_org_with_store(p_org_name, p_first_store_name)
 * - No fallback tables
 */

export type OrgRole = "owner" | "admin" | "staff" | "cashier";

export type MyOrgRow = {
  organization_id: string;
  organization_name: string;
  role: OrgRole;
};

export type MyStoreRow = {
  store_id: string;
  store_name: string;
  organization_id: string;
  store_type?: "STANDARD" | "CAPITAL_RECOVERY";

  // ✅ PLAN LOCK (V2)
  is_allowed?: boolean; // default true if missing
  lock_reason?: string | null;
};

export type OrgState = {
  // data
  loading: boolean;
  refreshing: boolean;
  error: string | null;

  // canonical RPC results (single naming used everywhere)
  orgs: MyOrgRow[];
  stores: MyStoreRow[];

  // derived active selection
  activeOrgId: string | null;
  activeOrgName: string | null;
  activeRole: OrgRole | null;

  // active store selection
  activeStoreId: string | null;
  activeStoreName: string | null;

  // actions
  refresh: () => Promise<void>;
  setActiveOrgId: (orgId: string | null) => void;
  setActiveStoreId: (storeId: string | null) => void;

  // canonical onboarding
  createOrgWithStore: (args: {
    p_org_name: string;
    p_first_store_name: string;
  }) => Promise<void>;
};

const OrgContext = createContext<OrgState | undefined>(undefined);

function clean(s: any) {
  return String(s ?? "").trim();
}

function activeOrgKeyForUser(userId: string) {
  return `${KV_KEYS.activeOrgId}:${userId}`;
}

function activeStoreKeyForUser(userId: string) {
  return `${KV_KEYS.activeStoreId}:${userId}`;
}

function isDisabledAccountMessage(message: unknown) {
  const msg = String(message ?? "").toLowerCase();

  return (
    msg.includes("disabled") ||
    msg.includes("deleted") ||
    msg.includes("deactivated") ||
    msg.includes("inactive") ||
    msg.includes("account disabled") ||
    msg.includes("account deleted")
  );
}

// ✅ prefer v2 then fallback
const GET_MY_STORES_CANDIDATES = ["get_my_stores_v2", "get_my_stores"] as const;

async function rpcFirstWorkingStores(): Promise<MyStoreRow[]> {
  let lastErr: any = null;

  for (const fn of GET_MY_STORES_CANDIDATES) {
    const { data, error } = await supabase.rpc(fn as any);
    if (!error) {
  const rows = (data ?? []) as any[];
  // normalize (ensure new fields exist as defaults)
  return rows.map((r) => ({
    store_id: clean(r?.store_id ?? r?.id),
    store_name: clean(r?.store_name ?? r?.name),
    organization_id: clean(r?.organization_id),
    store_type: (r?.store_type ?? "STANDARD") as "STANDARD" | "CAPITAL_RECOVERY",
    is_allowed:
      typeof r?.is_allowed === "boolean" ? r.is_allowed : true,
    lock_reason: clean(r?.lock_reason) ? String(r.lock_reason) : null,
  })) as MyStoreRow[];
}

    lastErr = error;

    const msg = String(error.message ?? "").toLowerCase();
    const missing =
      msg.includes("does not exist") ||
      msg.includes("function") ||
      msg.includes("rpc");

    const recoverable =
      missing ||
      msg.includes("not allowed") ||
      msg.includes("permission denied") ||
      msg.includes("access denied");

    // if recoverable -> try next candidate; else stop
    if (!recoverable) break;
  }

  throw lastErr ?? new Error("get_my_stores RPC missing");
}
function resolveConsistentSelection(args: {
  orgs: MyOrgRow[];
  stores: MyStoreRow[];
  preferredOrgId: string | null;
  preferredStoreId: string | null;
}) {
  const orgs = args.orgs ?? [];
  const stores = args.stores ?? [];

  const preferredOrgId = clean(args.preferredOrgId);
  const preferredStoreId = clean(args.preferredStoreId);

  const preferredStore =
    stores.find((s) => clean(s.store_id) === preferredStoreId) ?? null;

  const preferredStoreOrgId = clean(preferredStore?.organization_id);

  // 1) store ikijulikana, org yake ndiyo iwe source of truth
  let nextOrgId =
    preferredStoreOrgId ||
    (orgs.find((o) => clean(o.organization_id) === preferredOrgId)
      ? preferredOrgId
      : "") ||
    clean(orgs[0]?.organization_id) ||
    null;

  const withinOrg = nextOrgId
    ? stores.filter((s) => clean(s.organization_id) === nextOrgId)
    : [];

  const isAllowed = (s: MyStoreRow | null | undefined) =>
    typeof s?.is_allowed === "boolean" ? s.is_allowed : true;

  const selectedStore =
    withinOrg.find(
      (s) => clean(s.store_id) === preferredStoreId && isAllowed(s)
    ) ?? null;

  const firstAllowedStore = withinOrg.find((s) => isAllowed(s)) ?? null;
  const fallbackStore = withinOrg[0] ?? null;

  const nextStore = selectedStore ?? firstAllowedStore ?? fallbackStore ?? null;

  return {
    orgId: nextOrgId,
    storeId: clean(nextStore?.store_id) || null,
  };
}
export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<MyOrgRow[]>([]);
  const [stores, setStores] = useState<MyStoreRow[]>([]);

  const [activeOrgId, _setActiveOrgId] = useState<string | null>(null);
  const [activeStoreId, _setActiveStoreId] = useState<string | null>(null);

  // latest selection refs (avoid boot-loop dependencies)
  const activeOrgIdRef = useRef<string | null>(null);
  const activeStoreIdRef = useRef<string | null>(null);

  // per-user hydration / persistence guards
  const hydratedUserRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // ✅ FIX A: when org changes, clear active store (state + KV)
  const setActiveOrgId = useCallback(
    (orgId: string | null) => {
      const prevOrgId = activeOrgId;
      const userId = currentUserIdRef.current;

      _setActiveOrgId(orgId);
      activeOrgIdRef.current = orgId;
      void kv.setString(KV_KEYS.activeOrgId, orgId);

      if (userId) {
        void kv.setString(activeOrgKeyForUser(userId), orgId);
      }

      // If org is changing, store selection from old org must NOT carry over
      if (orgId !== prevOrgId) {
        _setActiveStoreId(null);
        activeStoreIdRef.current = null;
        void kv.setString(KV_KEYS.activeStoreId, null);

        if (userId) {
          void kv.setString(activeStoreKeyForUser(userId), null);
        }
      }
    },
    [activeOrgId]
  );

  const setActiveStoreId = useCallback((storeId: string | null) => {
    const userId = currentUserIdRef.current;

    _setActiveStoreId(storeId);
    activeStoreIdRef.current = storeId;
    void kv.setString(KV_KEYS.activeStoreId, storeId);

    if (userId) {
      void kv.setString(activeStoreKeyForUser(userId), storeId);
    }
  }, []);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  useEffect(() => {
    activeStoreIdRef.current = activeStoreId;
  }, [activeStoreId]);

  const deriveActive = useMemo(() => {
    const org =
      orgs.find((o) => clean(o.organization_id) === clean(activeOrgId)) ??
      orgs[0] ??
      null;

    return {
      orgId: org?.organization_id ?? null,
      orgName: org?.organization_name ?? null,
      role: org?.role ?? null,
    };
  }, [orgs, activeOrgId]);

  /**
   * ✅ PATCH A (SAFE):
   * - NEVER clear/persist null selection during loading OR refreshing.
   * - If orgs temporarily empty (RPC delay/error), do NOT wipe saved KV values.
   * - True clearing happens only on logout (no session) inside loadAll().
   */
  useEffect(() => {
    if (loading || refreshing) return;
    if (!deriveActive.orgId) return;

    if (activeOrgId !== deriveActive.orgId) {
      _setActiveOrgId(deriveActive.orgId);
      activeOrgIdRef.current = deriveActive.orgId;
      void kv.setString(KV_KEYS.activeOrgId, deriveActive.orgId);

      const userId = currentUserIdRef.current;
      if (userId) {
        void kv.setString(activeOrgKeyForUser(userId), deriveActive.orgId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deriveActive.orgId, loading, refreshing]);

  // ✅ derive active store:
  // - prefer selected store IF it is allowed
  // - else first allowed store in active org
  // - else fallback to first store
  const deriveActiveStore = useMemo(() => {
    const withinOrg = deriveActive.orgId
      ? (stores ?? []).filter((s) => s.organization_id === deriveActive.orgId)
      : (stores ?? []);

    const isAllowed = (s: any) => (typeof s?.is_allowed === "boolean" ? s.is_allowed : true);

    const selected =
      withinOrg.find((s) => s.store_id === activeStoreId && isAllowed(s)) ?? null;

    const firstAllowed =
      withinOrg.find((s) => isAllowed(s)) ?? null;

    const fallback = withinOrg[0] ?? null;

    const store = selected ?? firstAllowed ?? fallback;

    return {
      storeId: store?.store_id ?? null,
      storeName: store?.store_name ?? null,
    };
  }, [stores, deriveActive.orgId, activeStoreId]);

  /**
   * ✅ PATCH A (SAFE):
   * - NEVER clear/persist null selection during loading OR refreshing.
   * - If stores temporarily empty (RPC delay/error), do NOT wipe saved KV values.
   * - True clearing happens only on logout (no session) inside loadAll().
   */
  useEffect(() => {
    if (loading || refreshing) return;
    if (!deriveActiveStore.storeId) return;

    if (activeStoreId !== deriveActiveStore.storeId) {
      _setActiveStoreId(deriveActiveStore.storeId);
      activeStoreIdRef.current = deriveActiveStore.storeId;
      void kv.setString(KV_KEYS.activeStoreId, deriveActiveStore.storeId);

      const userId = currentUserIdRef.current;
      if (userId) {
        void kv.setString(activeStoreKeyForUser(userId), deriveActiveStore.storeId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deriveActiveStore.storeId, loading, refreshing]);

  // hydrate saved selection once per authenticated user
  const hydrateSelectionOnce = useCallback(async (userId: string) => {
    if (hydratedUserRef.current === userId) return;
    hydratedUserRef.current = userId;

    const [savedUserOrgId, savedUserStoreId, legacyOrgId, legacyStoreId] =
      await Promise.all([
        kv.getString(activeOrgKeyForUser(userId)),
        kv.getString(activeStoreKeyForUser(userId)),
        kv.getString(KV_KEYS.activeOrgId),
        kv.getString(KV_KEYS.activeStoreId),
      ]);

    const nextOrgId = savedUserOrgId || legacyOrgId || null;
    const nextStoreId = savedUserStoreId || legacyStoreId || null;

    if (nextOrgId) {
      _setActiveOrgId(nextOrgId);
      activeOrgIdRef.current = nextOrgId;
    }
    if (nextStoreId) {
      _setActiveStoreId(nextStoreId);
      activeStoreIdRef.current = nextStoreId;
    }
  }, []);

  const loadAll = useCallback(
    async (mode: "boot" | "refresh") => {
      setError(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        const {
          data: { session },
          error: sessErr,
        } = await supabase.auth.getSession();

        if (sessErr) throw sessErr;

        // not logged in => clear volatile active state only
        // IMPORTANT: keep per-user last workspace memory intact
        if (!session) {
          currentUserIdRef.current = null;
          setOrgs([]);
          setStores([]);
          _setActiveOrgId(null);
          _setActiveStoreId(null);
          await kv.clearActiveSelection();
          return;
        }

        currentUserIdRef.current = session.user.id;

        // hydrate only after we know exactly which authenticated user is active
        if (mode === "boot") {
          await hydrateSelectionOnce(session.user.id);
        }

        // 1) canonical org list
        const { data: orgData, error: orgErr } = await supabase.rpc("get_my_orgs");

        if (orgErr) {
          if (isDisabledAccountMessage(orgErr.message)) {
            try {
              await supabase.auth.signOut();
            } catch (err: any) {
              console.log("OrgContext disabled-account signOut ignore:", err);
            }

            setOrgs([]);
            setStores([]);
            _setActiveOrgId(null);
            _setActiveStoreId(null);
            await kv.clearActiveSelection();
            setError("This account has been disabled.");
            return;
          }

          throw orgErr;
        }

        const typedOrgs = (orgData ?? []) as MyOrgRow[];
        setOrgs(typedOrgs);

      // 2) stores (prefer v2; fallback to legacy)
        // IMPORTANT:
        // do not let store-loading failure break whole OrgContext state.
        // orgs may still be valid even if stores RPC is restricted or empty.
        let typedStores: MyStoreRow[] = [];

        try {
          typedStores = await rpcFirstWorkingStores();
          setStores(typedStores);
        } catch (storeErr: any) {
          typedStores = [];
          setStores([]);
          // keep orgs loaded; expose softer message instead of breaking whole app
          setError(storeErr?.message ?? "Failed to load stores");
        }

        // 3) resolve consistent active org/store for multi-workspace users
        const resolved = resolveConsistentSelection({
          orgs: typedOrgs,
          stores: typedStores,
          preferredOrgId: activeOrgIdRef.current,
          preferredStoreId: activeStoreIdRef.current,
        });

        _setActiveOrgId(resolved.orgId);
        _setActiveStoreId(resolved.storeId);
        activeOrgIdRef.current = resolved.orgId;
        activeStoreIdRef.current = resolved.storeId;

        const userId = currentUserIdRef.current;

        await Promise.all([
          kv.setString(KV_KEYS.activeOrgId, resolved.orgId),
          kv.setString(KV_KEYS.activeStoreId, resolved.storeId),
          ...(userId
            ? [
                kv.setString(activeOrgKeyForUser(userId), resolved.orgId),
                kv.setString(activeStoreKeyForUser(userId), resolved.storeId),
              ]
            : []),
        ]);
      } catch (e: any) {
        const msg = e?.message ?? "Failed to load org/store data";

        if (isDisabledAccountMessage(msg)) {
          try {
            await supabase.auth.signOut();
          } catch (err: any) {
            console.log("loadAll disabled-account signOut ignore:", err);
          }

          setOrgs([]);
          setStores([]);
          _setActiveOrgId(null);
          _setActiveStoreId(null);
          await kv.clearActiveSelection();
          setError("This account has been disabled.");
        } else {
          setError(msg);
          // IMPORTANT: do NOT clear org/store selection here.
        }
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [hydrateSelectionOnce]
  );

  const refresh = useCallback(async () => {
    await loadAll("refresh");
  }, [loadAll]);

  const createOrgWithStore = useCallback(
    async (args: { p_org_name: string; p_first_store_name: string }) => {
      setError(null);

      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      if (sessErr) throw sessErr;
      if (!session) throw new Error("Not authenticated");

      const payload = {
        p_org_name: args.p_org_name,
        p_first_store_name: args.p_first_store_name,
      };

      const { error: rpcErr } = await supabase.rpc("create_org_with_store", payload);
      if (rpcErr) throw rpcErr;

      await loadAll("refresh");
    },
    [loadAll]
  );

  // Boot load
  useEffect(() => {
    loadAll("boot");
  }, [loadAll]);

  // Auth changes => reload canonical state (guarded to avoid web loop/request storms)
  useEffect(() => {
    let alive = true;

    const { data } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, _session: Session | null) => {
        if (!alive) return;

        const event = String(_event ?? "").toUpperCase();
        const nextUserId = _session?.user?.id ?? null;
        const prevUserId = currentUserIdRef.current;

        // always track latest user id
        currentUserIdRef.current = nextUserId;

        // ✅ Only reset hydration memory when actual user identity changes
        if (prevUserId !== nextUserId) {
          hydratedUserRef.current = null;
        }

        // ✅ Ignore noisy refresh events on web to stop request loops
        if (event === "TOKEN_REFRESHED") {
          return;
        }

        // ✅ Initial session already handled by boot loader
        if (event === "INITIAL_SESSION") {
          return;
        }

        // ✅ Only reload for meaningful auth events
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED" ||
          event === "PASSWORD_RECOVERY"
        ) {
          void loadAll("boot");
        }
      }
    );

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [loadAll]);

  const value: OrgState = {
    loading,
    refreshing,
    error,

    orgs,
    stores,

    activeOrgId: deriveActive.orgId,
    activeOrgName: deriveActive.orgName,
    activeRole: deriveActive.role,

    activeStoreId: deriveActiveStore.storeId,
    activeStoreName: deriveActiveStore.storeName,

    refresh,
    setActiveOrgId,
    setActiveStoreId,

    createOrgWithStore,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside <OrgProvider />");
  return ctx;
}