import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type OrgMembership = {
  organization_id: string;
  role: "owner" | "admin" | "lawyer" | "legal_assistant" | "viewer";
  organization: { id: string; name: string } | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: OrgMembership[];
  activeOrgId: string | null;
  activeRole: OrgMembership["role"] | null;
  setActiveOrgId: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVE_ORG_KEY = "mehla_active_org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setActiveOrgId = (id: string) => {
    setActiveOrgIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_ORG_KEY, id);
  };

  const loadMemberships = async (uid: string) => {
    const { data } = await supabase
      .from("organization_members")
      .select("organization_id, role, organization:organizations(id,name)")
      .eq("user_id", uid)
      .eq("status", "active");
    const list = (data ?? []) as unknown as OrgMembership[];
    setMemberships(list);
    if (list.length > 0) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null;
      const found = list.find((m) => m.organization_id === stored);
      setActiveOrgIdState(found?.organization_id ?? list[0].organization_id);
    } else {
      setActiveOrgIdState(null);
    }
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) await loadMemberships(data.session.user.id);
    else setMemberships([]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadMemberships(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user) await loadMemberships(s.user.id);
      else setMemberships([]);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_ORG_KEY);
  };

  const activeRole = memberships.find((m) => m.organization_id === activeOrgId)?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
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