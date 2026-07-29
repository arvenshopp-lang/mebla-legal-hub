import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthGate,
});

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE]">
      <div className="text-sm font-medium text-[#123C32]">{text}</div>
    </div>
  );
}

function AuthGate() {
  const { authLoading, organizationLoading, session, memberships, allMemberships, authError } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loading = authLoading || organizationLoading;
  // The path the user actually asked for, captured once so a redirect to
  // /login can never overwrite it with "/login" on a re-render.
  const requestedPath = useRef(pathname);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: requestedPath.current } as never, replace: true });
      return;
    }
    if (memberships.length > 0) return;
    // A session exists but no active membership: pending/suspended vs. brand new.
    navigate({ to: allMemberships.length > 0 ? "/pending-access" : "/onboarding", replace: true } as never);
  }, [loading, session, memberships.length, allMemberships.length, navigate]);

  if (loading) return <Splash text="جاري التحقق من الحساب…" />;
  if (!session) return <Splash text="جاري تحويلك لتسجيل الدخول…" />;

  if (memberships.length === 0) {
    return (
      <Splash
        text={allMemberships.length > 0 ? "جاري التحقق من حالة عضويتك…" : "جاري توجيهك لإكمال إعداد المكتب…"}
      />
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE] px-4">
        <div className="max-w-md rounded-2xl border border-[#7A2E20]/25 bg-white p-6 text-center">
          <p className="text-sm leading-7 text-[#7A2E20]">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-[#123C32] px-5 py-2.5 text-sm font-semibold text-white"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
