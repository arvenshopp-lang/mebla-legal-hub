import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AuthShell } from "./login";

export const Route = createFileRoute("/pending-access")({
  ssr: false,
  component: PendingAccessPage,
  head: () => ({
    meta: [
      { title: "حالة العضوية | مِهلة" },
      { name: "description", content: "حالة عضويتك في مكتب المحاماة على منصة مِهلة." },
      { property: "og:title", content: "حالة العضوية | مِهلة" },
      { property: "og:description", content: "حالة عضويتك في مكتب المحاماة على منصة مِهلة." },
    ],
  }),
});

function PendingAccessPage() {
  const { session, authLoading, organizationLoading, memberships, allMemberships, signOut } = useAuth();
  const navigate = useNavigate();
  const loading = authLoading || organizationLoading;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true });
      return;
    }
    if (memberships.length > 0) navigate({ to: "/dashboard", replace: true });
    else if (allMemberships.length === 0) navigate({ to: "/onboarding", replace: true });
  }, [loading, session, memberships.length, allMemberships.length, navigate]);

  const suspended = allMemberships.some((m) => m.status === "suspended");

  if (loading || !session) {
    return (
      <AuthShell title="جاري التحقق">
        <div className="rounded-xl border border-border bg-[#F5F3EE] p-5 text-sm text-[#123C32]">لحظات قليلة…</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={suspended ? "تم إيقاف عضويتك" : "بانتظار قبول العضوية"}
      subtitle={
        suspended
          ? "لا تملك صلاحية الدخول إلى هذه المنشأة حالياً"
          : "دعوتك للانضمام إلى المكتب لم تُفعّل بعد"
      }
    >
      <div className="rounded-xl border border-border bg-[#F5F3EE] p-5 text-sm leading-7 text-[#123C32]">
        {suspended
          ? "أوقف مالك المكتب أو المدير وصولك مؤقتاً. تواصل معه لإعادة تفعيل حسابك."
          : "بمجرد تفعيل عضويتك من مالك المكتب ستتمكن من الدخول مباشرة إلى لوحة التحكم."}
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={() => window.location.assign("/pending-access")}
          className="w-full rounded-xl border border-border py-3 text-sm font-medium text-[#123C32] hover:bg-surface-muted"
        >
          تحديث الحالة
        </button>
        <button
          onClick={() => void signOut().then(() => navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true }))}
          className="w-full rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          تسجيل الخروج
        </button>
        <Link to="/" className="text-center text-xs text-muted-foreground underline">
          العودة إلى الصفحة الرئيسية
        </Link>
      </div>
    </AuthShell>
  );
}
