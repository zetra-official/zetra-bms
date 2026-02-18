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

export type OrgRole = "owner" | "admin" | "staff";

export type MyOrgRow = {
  organization_id: string;
  organization_name: string;
  role: OrgRole;
};

export type MyStoreRow = {
  store_id: string;
  store_name: string;
  organization_id: string;
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

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<MyOrgRow[]>([]);
  const [stores, setStores] = useState<MyStoreRow[]>([]);

  const [activeOrgId, _setActiveOrgId] = useState<string | null>(null);
  const [activeStoreId, _setActiveStoreId] = useState<string | null>(null);

  // prevent overriding user selection after first hydration
  const hydratedRef = useRef(false);

  // ✅ FIX A: when org changes, clear active store (state + KV)
  const setActiveOrgId = useCallback(
    (orgId: string | null) => {
      const prevOrgId = activeOrgId;

      _setActiveOrgId(orgId);
      void kv.setString(KV_KEYS.activeOrgId, orgId);

      // If org is changing, store selection from old org must NOT carry over
      if (orgId !== prevOrgId) {
        _setActiveStoreId(null);
        void kv.setString(KV_KEYS.activeStoreId, null);
      }
    },
    [activeOrgId]
  );

  const setActiveStoreId = useCallback((storeId: string | null) => {
    _setActiveStoreId(storeId);
    void kv.setString(KV_KEYS.activeStoreId, storeId);
  }, []);

  const deriveActive = useMemo(() => {
    const org =
      orgs.find((o) => o.organization_id === activeOrgId) ?? orgs[0] ?? null;

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
      void kv.setString(KV_KEYS.activeOrgId, deriveActive.orgId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deriveActive.orgId, loading, refreshing]);

  // derive active store from selected store OR first store in active org
  const deriveActiveStore = useMemo(() => {
    const withinOrg = deriveActive.orgId
      ? (stores ?? []).filter((s) => s.organization_id === deriveActive.orgId)
      : (stores ?? []);

    const store =
      withinOrg.find((s) => s.store_id === activeStoreId) ??
      withinOrg[0] ??
      (stores ?? [])[0] ??
      null;

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
      void kv.setString(KV_KEYS.activeStoreId, deriveActiveStore.storeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deriveActiveStore.storeId, loading, refreshing]);

  // hydrate saved selection once (org/store ids) — runs before first boot load
  const hydrateSelectionOnce = useCallback(async () => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const [savedOrgId, savedStoreId] = await Promise.all([
      kv.getString(KV_KEYS.activeOrgId),
      kv.getString(KV_KEYS.activeStoreId),
    ]);

    if (savedOrgId) _setActiveOrgId(savedOrgId);
    if (savedStoreId) _setActiveStoreId(savedStoreId);
  }, []);

  const loadAll = useCallback(
    async (mode: "boot" | "refresh") => {
      setError(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        // ✅ hydrate only at app start / auth change boot
        if (mode === "boot") {
          await hydrateSelectionOnce();
        }

        const {
          data: { session },
          error: sessErr,
        } = await supabase.auth.getSession();

        if (sessErr) throw sessErr;

        // not logged in => clear (this is the ONLY place we wipe selection)
        if (!session) {
          setOrgs([]);
          setStores([]);
          _setActiveOrgId(null);
          _setActiveStoreId(null);
          await kv.clearActiveSelection();
          return;
        }

        // 1) canonical org list
        const { data: orgData, error: orgErr } = await supabase.rpc("get_my_orgs");
        if (orgErr) throw orgErr;

        const typedOrgs = (orgData ?? []) as MyOrgRow[];
        setOrgs(typedOrgs);

        // 2) canonical store list
        const { data: storeData, error: storeErr } = await supabase.rpc("get_my_stores");
        if (storeErr) throw storeErr;

        const typedStores = (storeData ?? []) as MyStoreRow[];
        setStores(typedStores);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load org/store data");
        // IMPORTANT: do NOT clear org/store selection here.
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

  // Auth changes => reload canonical state
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, _session: Session | null) => {
        hydratedRef.current = false;
        loadAll("boot");
      }
    );

    return () => {
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