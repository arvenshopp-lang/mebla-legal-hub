import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_MESSAGES, logAuthEvent, translateAuthError } from "@/lib/auth-errors";
import { clearAllDrafts } from "@/lib/drafts/draft-store";

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

export type AppRole = "owner" | "admin" | "lawyer" | "legal_assistant" | "viewer";
export type MemberStatus = "active" | "pending" | "suspended";

type OrgMembership = {
  organization_id: string;
  role: AppRole;
  status: MemberStatus;
  organization: { id: string; name: string } | null;
};

type LoadResult = {
  session: Session | null;
  memberships: OrgMembership[];
  allMemberships: OrgMembership[];
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  authLoading: boolean;
  profileLoading: boolean;
  organizationLoading: boolean;
  authError: string | null;
  membership: OrgMembership | null;
  loading: boolean;
  /** active memberships only */
  memberships: OrgMembership[];
  /** every membership, whatever the status */
  allMemberships: OrgMembership[];
  activeOrgId: string | null;
  activeRole: AppRole | null;
  setActiveOrgId: (id: string) => void;
  refresh: () => Promise<LoadResult>;
  refreshAuthContext: () => Promise<LoadResult>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVE_ORG_KEY = "mehla_active_org";
const EMPTY: LoadResult = { session: null, memberships: [], allMemberships: [] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allMemberships, setAllMemberships] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const requestId = useRef(0);
  // بعد أول تحميل ناجح لا نُظهر شاشة التحقق مرة أخرى: أي تحديث لاحق (رجوع من
  // تطبيق آخر على Safari، تحديث التوكن) يجري في الخلفية دون تفريغ الواجهة.
  const bootstrapped = useRef(false);
  const loadedUserId = useRef<string | null>(null);

  const setActiveOrgId = useCallback((id: string) => {
    setActiveOrgIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_ORG_KEY, id);
  }, []);

  const clearUserData = useCallback(() => {
    setProfile(null);
    setAllMemberships([]);
    setActiveOrgIdState(null);
    setProfileLoading(false);
    setOrganizationLoading(false);
    setAuthError(null);
    if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_ORG_KEY);
  }, []);

  const applyMemberships = useCallback((all: OrgMembership[]) => {
    setAllMemberships(all);
    const active = all.filter((m) => m.status === "active");
    if (active.length > 0) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null;
      const found = active.find((m) => m.organization_id === stored);
      const nextOrgId = found?.organization_id ?? active[0].organization_id;
      setActiveOrgIdState(nextOrgId);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_ORG_KEY, nextOrgId);
    } else {
      setActiveOrgIdState(null);
      if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  }, []);

  /** Loads profile + memberships. Never signs the user out on failure. */
  const loadUserData = useCallback(
    async (
      currentUser: User,
      currentRequestId: number,
      background = false,
    ): Promise<OrgMembership[]> => {
      if (!background) {
        setProfileLoading(true);
        setOrganizationLoading(true);
      }

      const [profileResult, membershipResult] = await Promise.all([
        // بيانات التواصل الشخصية تُقرأ عبر دالة خادمية مقيّدة بالمستخدم نفسه
        // (أعمدة البريد والجوال في profiles غير مقروءة مباشرة من الواجهة).
        supabase.rpc("my_profile").maybeSingle(),
        supabase
          .from("organization_members")
          .select("organization_id, role, status, organization:organizations(id,name)")
          .eq("user_id", currentUser.id),
      ]);

      if (requestId.current !== currentRequestId) return [];

      let loadError: string | null = null;

      if (profileResult.error) {
        loadError = AUTH_MESSAGES.profileLoadFailed;
        logAuthEvent({
          route: "auth-provider",
          action: "load_profile",
          errorCode: profileResult.error.code,
          sanitizedMessage: AUTH_MESSAGES.profileLoadFailed,
          userId: currentUser.id,
        });
      } else if (!profileResult.data) {
        // Session without a profile row: self-heal through the RLS-protected
        // "insert own profile" policy instead of dropping the user to /login.
        const meta = (currentUser.user_metadata ?? {}) as Record<string, unknown>;
        const fullName =
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.name === "string" && meta.name) ||
          currentUser.email?.split("@")[0] ||
          "مستخدم";
        const { data: created, error: createError } = await supabase
          .from("profiles")
          .insert({ id: currentUser.id, full_name: fullName, email: currentUser.email ?? null })
          .select("id, full_name, avatar_url, job_title")
          .maybeSingle();
        if (createError) {
          loadError = AUTH_MESSAGES.profileLoadFailed;
          logAuthEvent({
            route: "auth-provider",
            action: "create_profile",
            errorCode: createError.code,
            sanitizedMessage: AUTH_MESSAGES.profileLoadFailed,
            userId: currentUser.id,
          });
        }
        if (requestId.current !== currentRequestId) return [];
        if (created) {
          const { data: fresh } = await supabase.rpc("my_profile").maybeSingle();
          setProfile((fresh ?? created) as Profile | null);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(profileResult.data as Profile);
        // مزامنة بريد الملف الشخصي بعد تأكيد تغيير البريد من رسالة التأكيد
        const authEmail = currentUser.email ?? null;
        const profileEmail = (profileResult.data as Profile).email ?? null;
        if (authEmail && authEmail.toLowerCase() !== (profileEmail ?? "").toLowerCase()) {
          const { error: syncError } = await supabase
            .from("profiles")
            .update({ email: authEmail })
            .eq("id", currentUser.id);
          if (!syncError) {
            const { data: synced } = await supabase.rpc("my_profile").maybeSingle();
            if (requestId.current === currentRequestId && synced) setProfile(synced as Profile);
          }
        }
      }

      if (membershipResult.error) {
        loadError = AUTH_MESSAGES.organizationLoadFailed;
        logAuthEvent({
          route: "auth-provider",
          action: "load_memberships",
          errorCode: membershipResult.error.code,
          sanitizedMessage: AUTH_MESSAGES.organizationLoadFailed,
          userId: currentUser.id,
        });
      }

      const all = (membershipResult.data ?? []) as unknown as OrgMembership[];
      applyMemberships(all);
      setAuthError(loadError);
      setProfileLoading(false);
      setOrganizationLoading(false);
      return all;
    },
    [applyMemberships],
  );

  const runLoad = useCallback(
    async (nextSession: Session | null, background = false): Promise<LoadResult> => {
      const currentRequestId = ++requestId.current;
      setSession(nextSession);
      let all: OrgMembership[] = [];
      if (nextSession?.user) {
        all = await loadUserData(nextSession.user, currentRequestId, background);
        loadedUserId.current = nextSession.user.id;
      } else {
        clearUserData();
        loadedUserId.current = null;
      }
      if (requestId.current !== currentRequestId) return EMPTY;
      setAuthLoading(false);
      bootstrapped.current = true;
      return {
        session: nextSession,
        memberships: all.filter((m) => m.status === "active"),
        allMemberships: all,
      };
    },
    [clearUserData, loadUserData],
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return runLoad(data.session ?? null);
  }, [runLoad]);

  useEffect(() => {
    let mounted = true;
    // A single listener is the only source of truth. Supabase emits
    // INITIAL_SESSION right after subscribing, so no extra bootstrap call is
    // needed (which would double-load and cause the login-page flash).
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      // تحديث التوكن لا يغيّر الهوية: لا نُعيد تحميل أي شيء.
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(nextSession);
        return;
      }
      // Safari يُطلق INITIAL_SESSION/SIGNED_IN عند الرجوع من تطبيق آخر لنفس
      // المستخدم؛ نُحدّث البيانات في الخلفية دون شاشة «جاري التحقق».
      const sameUser =
        bootstrapped.current && !!nextSession?.user && loadedUserId.current === nextSession.user.id;
      if (sameUser) {
        setSession(nextSession);
        void runLoad(nextSession ?? null, true);
        return;
      }
      void runLoad(nextSession ?? null, false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [runLoad]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error: translateAuthError(error) };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    requestId.current++;
    bootstrapped.current = false;
    loadedUserId.current = null;
    await supabase.auth.signOut();
    clearAllDrafts();
    clearUserData();
    setSession(null);
  }, [clearUserData]);

  const memberships = allMemberships.filter((m) => m.status === "active");
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
        authError,
        membership,
        loading,
        memberships,
        allMemberships,
        activeOrgId,
        activeRole,
        setActiveOrgId,
        refresh,
        refreshAuthContext: refresh,
        signIn,
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

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "مالك",
  admin: "مدير",
  lawyer: "محامٍ",
  legal_assistant: "مساعد قانوني",
  viewer: "مشاهد",
};

export function canManage(role: AppRole | null) {
  return role === "owner" || role === "admin";
}
export function canEdit(role: AppRole | null) {
  return role === "owner" || role === "admin" || role === "lawyer" || role === "legal_assistant";
}
