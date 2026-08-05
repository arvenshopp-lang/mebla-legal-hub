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
      {
        name: "description",
        content:
          "تابع حالة عضويتك في مكتب المحاماة على منصة مِهلة، وتعرّف على ما إذا كان طلب انضمامك بانتظار موافقة مالك المكتب أو موقوفاً مؤقتاً.",
      },
      { property: "og:title", content: "حالة العضوية | مِهلة" },
      {
        property: "og:description",
        content: "متابعة حالة طلب انضمامك إلى مكتب المحاماة على منصة مِهلة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/pending-access" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/pending-access" }],
  }),
});

function PendingAccessPage() {
  const { session, authLoading, organizationLoading, memberships, allMemberships, signOut } =
    useAuth();
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
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm text-foreground">
          لحظات قليلة…
        </div>
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
      <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm leading-7 text-foreground">
        {suspended
          ? "أوقف مالك المكتب أو المدير وصولك مؤقتاً. تواصل معه لإعادة تفعيل حسابك."
          : "بمجرد تفعيل عضويتك من مالك المكتب ستتمكن من الدخول مباشرة إلى لوحة التحكم."}
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={() => window.location.assign("/pending-access")}
          className="w-full rounded-[var(--radius-m)] border border-border py-3 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          تحديث الحالة
        </button>
        <button
          onClick={() =>
            void signOut().then(() =>
              navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true }),
            )
          }
          className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
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
