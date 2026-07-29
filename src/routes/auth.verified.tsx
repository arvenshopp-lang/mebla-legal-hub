import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth/verified")({
  ssr: false,
  component: VerifiedPage,
  head: () => ({
    meta: [
      { title: "تم تأكيد بريدك الإلكتروني | مِهلة" },
      { name: "description", content: "تم تأكيد بريدك الإلكتروني بنجاح في منصة مِهلة." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "تم تأكيد بريدك الإلكتروني | مِهلة" },
      { property: "og:description", content: "تم تأكيد بريدك الإلكتروني بنجاح في منصة مِهلة." },
    ],
  }),
});

function VerifiedPage() {
  const { session, memberships, allMemberships, authLoading, organizationLoading } = useAuth();
  const busy = authLoading || organizationLoading;

  const target = !session
    ? "/login"
    : memberships.length > 0
      ? "/dashboard"
      : allMemberships.length > 0
        ? "/pending-access"
        : "/onboarding";

  const label = !session
    ? "الانتقال إلى تسجيل الدخول"
    : memberships.length > 0
      ? "الانتقال إلى لوحة التحكم"
      : allMemberships.length > 0
        ? "متابعة حالة الانضمام"
        : "إكمال إنشاء المكتب";

  return (
    <div className="min-h-dvh bg-surface-muted flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 text-2xl font-bold tracking-tight text-foreground">
          مِهلة <span className="text-gold">·</span> MEHLA
        </div>
        <div className="rounded-[var(--radius-l)] border border-border bg-surface p-8 shadow-[0_20px_60px_-20px_rgba(18,60,50,0.15)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#C9A961" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-6 text-2xl font-bold text-foreground">تم تأكيد بريدك الإلكتروني بنجاح</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            حسابك جاهز الآن. يمكنك متابعة قضاياك وجلساتك ومهلك النظامية من داخل المنصة.
          </p>
          <Link
            to={target}
            className="mt-7 inline-flex w-full items-center justify-center rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
            aria-disabled={busy}
          >
            {busy ? "لحظات…" : label}
          </Link>
          <p className="mt-5 text-xs text-text-muted">
            إن لم تكن أنت من أنشأ هذا الحساب، يمكنك تجاهل الرسالة بأمان.
          </p>
        </div>
      </div>
    </div>
  );
}