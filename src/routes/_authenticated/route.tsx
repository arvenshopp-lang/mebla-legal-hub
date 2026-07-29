import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthGate,
});

function AuthGate() {
  const { authLoading, organizationLoading, session, memberships } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loading = authLoading || organizationLoading;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: pathname } as never, replace: true });
      return;
    }
    if (memberships.length === 0) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, session, memberships, pathname, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE]">
        <div className="text-sm font-medium text-[#123C32]">جاري التحقق من الحساب…</div>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE]">
        <div className="text-sm font-medium text-[#123C32]">جاري توجيهك لإكمال إعداد المكتب…</div>
      </div>
    );
  }

  return <Outlet />;
}