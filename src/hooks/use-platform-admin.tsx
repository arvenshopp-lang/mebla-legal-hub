import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, type AdminPermission } from "@/lib/admin-permissions";

export type PlatformStaff = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  role: "super_admin" | "staff";
  status: "active" | "suspended";
  permissions: string[];
};

type Ctx = {
  staff: PlatformStaff | null;
  loading: boolean;
  can: (permission: AdminPermission) => boolean;
};

const PlatformAdminContext = createContext<Ctx | null>(null);

export function usePlatformStaffQuery() {
  return useQuery({
    queryKey: ["platform-staff-me"],
    staleTime: 60_000,
    queryFn: async (): Promise<PlatformStaff | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("platform_staff")
        .select("id, user_id, full_name, email, job_title, role, status, permissions")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as PlatformStaff | null) ?? null;
    },
  });
}

export function PlatformAdminProvider({
  staff,
  loading,
  children,
}: {
  staff: PlatformStaff | null;
  loading: boolean;
  children: ReactNode;
}) {
  const value: Ctx = {
    staff,
    loading,
    can: (permission) => hasPermission(staff, permission),
  };
  return <PlatformAdminContext.Provider value={value}>{children}</PlatformAdminContext.Provider>;
}

export function usePlatformAdmin(): Ctx {
  const ctx = useContext(PlatformAdminContext);
  if (!ctx) throw new Error("usePlatformAdmin must be used inside PlatformAdminProvider");
  return ctx;
}