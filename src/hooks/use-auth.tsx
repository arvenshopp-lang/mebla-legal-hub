import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

type OrgMembership = {
  organization_id: string;
  role: "owner" | "admin" | "lawyer" | "legal_assistant" | "viewer";
  organization: { id: string; name: string } | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  authLoading: boolean;
  profileLoading: boolean;
  organizationLoading: boolean;
  membership: OrgMembership | null;
  loading: boolean;
  memberships: OrgMembership[];
  activeOrgId: string | null;
  activeRole: OrgMembership["role"] | null;
  setActiveOrgId: (id: string) => void;
  refresh: () => Promise<{ session: Session | null; memberships: OrgMembership[] }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVE_ORG_KEY = "mehla_active_org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const requestId = useRef(0);

  const setActiveOrgId = (id: string) => {
    setActiveOrgIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_ORG_KEY, id);
  };

  const clearUserData = useCallback(() => {
    setProfile(null);
    setMemberships([]);
    setActiveOrgIdState(null);
    setProfileLoading(false);
    setOrganizationLoading(false);
    if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_ORG_KEY);
  }, []);

  const applyMemberships = useCallback((list: OrgMembership[]) => {
    setMemberships(list);
    if (list.length > 0) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null;
      const found = list.find((m) => m.organization_id === stored);
      const nextOrgId = found?.organization_id ?? list[0].organization_id;
      setActiveOrgIdState(nextOrgId);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_ORG_KEY, nextOrgId);
    } else {
      setActiveOrgIdState(null);
      if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  }, []);

  const loadUserData = useCallback(async (user: User, currentRequestId: number) => {
    setProfileLoading(true);
    setOrganizationLoading(true);

    const [profileResult, membershipResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url, job_title")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select("organization_id, role, organization:organizations(id,name)")
        .eq("user_id", user.id)
        .eq("status", "active"),
    ]);

    if (requestId.current !== currentRequestId) {
      return [];
    }

    setProfile((profileResult.data ?? null) as Profile | null);
    const list = (membershipResult.data ?? []) as unknown as OrgMembership[];
    applyMemberships(list);
    setProfileLoading(false);
    setOrganizationLoading(false);
    return list;
  }, [applyMemberships]);

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setAuthLoading(true);
    const { data } = await supabase.auth.getSession();
    if (requestId.current !== currentRequestId) {
      return { session: null, memberships: [] };
    }
    setSession(data.session);
    let nextMemberships: OrgMembership[] = [];
    if (data.session?.user) {
      nextMemberships = await loadUserData(data.session.user, currentRequestId);
    } else {
      clearUserData();
    }
    if (requestId.current === currentRequestId) setAuthLoading(false);
    return { session: data.session, memberships: nextMemberships };
  }, [clearUserData, loadUserData]);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      const currentRequestId = ++requestId.current;
      setAuthLoading(true);
      setSession(s);
      if (s?.user) await loadUserData(s.user, currentRequestId);
      else clearUserData();
      if (requestId.current === currentRequestId) setAuthLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [clearUserData, loadUserData, refresh]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearUserData();
  };

  const membership = memberships.find((m) => m.organization_id === activeOrgId) ?? null;
  const activeRole = membership?.role ?? null;
  const loading = authLoading || profileLoading || organizationLoading;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        authLoading,
        profileLoading,
        organizationLoading,
        membership,
        loading,
        memberships,
        activeOrgId,
        activeRole,
        setActiveOrgId,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<OrgMembership["role"], string> = {
  owner: "مالك",
  admin: "مدير",
  lawyer: "محامٍ",
  legal_assistant: "مساعد قانوني",
  viewer: "مشاهد",
};

export function canManage(role: OrgMembership["role"] | null) {
  return role === "owner" || role === "admin";
}
export function canEdit(role: OrgMembership["role"] | null) {
  return role === "owner" || role === "admin" || role === "lawyer" || role === "legal_assistant";
}