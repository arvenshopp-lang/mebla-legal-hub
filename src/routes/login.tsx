import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AUTH_MESSAGES, logAuthEvent } from "@/lib/auth-errors";
import { resendSignupConfirmation, sendMagicLink } from "@/lib/auth-actions";
import { GoogleIcon } from "@/components/google-icon";
import { inputCls as fieldInputCls } from "@/lib/list-utils";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/dashboard",
  }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | مِهلة" },
      {
        name: "description",
        content: "سجّل الدخول إلى حسابك في منصة مِهلة لمتابعة القضايا والجلسات.",
      },
      { property: "og:title", content: "تسجيل الدخول | مِهلة" },
      {
        property: "og:description",
        content: "سجّل الدخول إلى منصة مِهلة لمتابعة قضايا مكتبك وجلساته ومهله النظامية.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/login" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/login" }],
  }),
});

function LoginPage() {
  const { redirect } = useSearch({ from: "/login" });
  const {
    session,
    authLoading,
    organizationLoading,
    memberships,
    allMemberships,
    refresh,
    signIn,
  } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "resend" | "magic">(null);
  const [notice, setNotice] = useState<string | null>(null);

  const safeRedirect =
    typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/dashboard";

  const destinationFor = (active: number, all: number) => {
    // دعوة فريق: الرابط هو المقصد الصحيح حتى قبل وجود أي عضوية فعّالة
    if (safeRedirect.startsWith("/invite/")) return safeRedirect;
    if (active > 0) return safeRedirect;
    return all > 0 ? "/pending-access" : "/onboarding";
  };

  // Already signed in: send the user where they belong (never render the form).
  useEffect(() => {
    if (authLoading || organizationLoading || !session) return;
    navigate({
      to: destinationFor(memberships.length, allMemberships.length),
      replace: true,
    } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    organizationLoading,
    session,
    memberships.length,
    allMemberships.length,
    safeRedirect,
  ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    if (!password) {
      setFormError("يرجى إدخال كلمة المرور");
      return;
    }
    setLoading(true);
    setFormError(null);
    setNotice(null);
    setNeedsConfirmation(false);

    const { error } = await signIn(cleanEmail, password);
    if (error) {
      let friendly = error;
      if (error === AUTH_MESSAGES.emailNotConfirmed) setNeedsConfirmation(true);
      if (error === AUTH_MESSAGES.invalidCredentials) {
        // رسالة موحّدة لا تكشف وجود الحساب ولا طريقة تسجيل دخوله (منع تعداد الحسابات)،
        // مع إرشاد المستخدم لكل الاحتمالات دون أي استعلام عن البريد في الخادم.
        friendly =
          "بيانات الدخول غير صحيحة. إن كان حسابك مرتبطاً بـ Google فاستخدم زر «المتابعة عبر Google» أعلاه، أو أعد تعيين كلمة المرور عبر «نسيت كلمة المرور؟».";
      }
      logAuthEvent({ route: "/login", action: "sign_in_password", sanitizedMessage: friendly });
      setLoading(false);
      setFormError(friendly);
      return;
    }

    // Wait for session + profile + membership before navigating (no flash, no loop).
    const refreshed = await refresh();
    setLoading(false);
    toast.success("مرحباً بعودتك");
    navigate({
      to: destinationFor(refreshed.memberships.length, refreshed.allMemberships.length),
      replace: true,
    } as never);
  };

  const google = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setFormError(null);
    setNotice(null);
    sessionStorage.setItem("mehla_auth_redirect", safeRedirect);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      setGoogleLoading(false);
      setFormError("تعذر بدء تسجيل الدخول عبر Google. حاول مرة أخرى.");
      logAuthEvent({
        route: "/login",
        action: "sign_in_google",
        sanitizedMessage: "oauth_start_failed",
      });
    }
  };

  const resendConfirmation = async () => {
    if (actionBusy) return;
    setActionBusy("resend");
    const result = await resendSignupConfirmation(email);
    setActionBusy(null);
    if (result.ok) {
      setFormError(null);
      setNotice(result.message);
      toast.success(result.message);
    } else {
      setFormError(result.message);
    }
  };

  const requestMagicLink = async () => {
    if (actionBusy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError("أدخل بريدك الإلكتروني أولاً لإرسال رابط الدخول");
      return;
    }
    setActionBusy("magic");
    const result = await sendMagicLink(cleanEmail);
    setActionBusy(null);
    if (result.ok) {
      setFormError(null);
      setNotice(result.message);
      toast.success(result.message);
    } else {
      setFormError(result.message);
    }
  };

  // Only show the verification screen when a session actually exists.
  if (session && (authLoading || organizationLoading)) {
    return (
      <AuthShell title="جاري التحقق" subtitle="نتأكد من حالة حسابك قبل المتابعة">
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm text-foreground">
          لحظات قليلة…
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="تسجيل الدخول" subtitle="أدخل بياناتك للمتابعة">
      <button
        type="button"
        onClick={google}
        disabled={googleLoading}
        aria-busy={googleLoading}
        className="flex w-full min-h-[46px] items-center justify-center gap-2.5 rounded-[var(--radius-m)] border border-border bg-surface py-3 text-sm font-medium text-foreground shadow-[0_1px_2px_rgba(18,60,50,0.06)] transition hover:bg-surface-muted active:scale-[0.99] disabled:opacity-60"
      >
        <GoogleIcon />
        <span>{googleLoading ? "جاري فتح نافذة Google…" : "المتابعة عبر Google"}</span>
      </button>
      <p className="mt-2 text-center text-[11px] leading-5 text-text-muted">
        دخول آمن عبر حساب Google — لا نطّلع على كلمة مرورك إطلاقاً.
      </p>
      <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
        <div className="h-px flex-1 bg-surface-muted" /> أو{" "}
        <div className="h-px flex-1 bg-surface-muted" />
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-3 text-[12.5px] leading-6 text-danger"
          >
            {formError}
            {needsConfirmation && (
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={actionBusy === "resend"}
                className="mt-2 block font-semibold underline disabled:opacity-60"
              >
                {actionBusy === "resend" ? "جاري الإرسال…" : "إعادة إرسال رابط التأكيد"}
              </button>
            )}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-[var(--radius-m)] border border-success/25 bg-success-soft p-3 text-[12.5px] leading-6 text-success"
          >
            {notice}
          </div>
        )}
        <Field label="البريد الإلكتروني">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldInputCls}
          />
        </Field>
        <Field label="كلمة المرور">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldInputCls}
          />
        </Field>
        <div className="text-left">
          <Link
            to="/forgot-password"
            className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
          >
            نسيت كلمة المرور؟
          </Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full min-h-[46px] rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition disabled:opacity-60"
        >
          {loading ? "جاري تسجيل الدخول…" : "دخول"}
        </button>
        <button
          type="button"
          onClick={requestMagicLink}
          disabled={actionBusy === "magic"}
          className="w-full text-center text-xs font-medium text-muted-foreground underline transition hover:text-foreground disabled:opacity-60"
        >
          {actionBusy === "magic" ? "جاري إرسال الرابط…" : "الدخول برابط لمرة واحدة عبر البريد"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link to="/register" className="font-semibold text-foreground underline">
          إنشاء حساب
        </Link>
      </p>
    </AuthShell>
  );
}

export { inputCls } from "@/lib/list-utils";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-label mb-1.5 block text-foreground">{label}</span>
      {children}
      {hint && <span className="text-caption mt-1 block">{hint}</span>}
    </label>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div dir="rtl" className="flex min-h-dvh flex-col bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
        <Link
          to="/"
          className="mb-8 block text-center text-[17px] font-bold tracking-tight text-foreground"
        >
          مِهلة <span className="text-text-muted">·</span>{" "}
          <span className="text-[13px] tracking-[0.18em]">MEHLA</span>
        </Link>
        <div className="surface-card p-6 shadow-sm sm:p-8">
          <h1 className="text-h2">{title}</h1>
          {subtitle && <p className="mt-1.5 text-body-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <p className="mt-6 text-center text-[12px] text-text-muted">
          منصة مِهلة لإدارة الممارسة القانونية · mehlalex.com
        </p>
      </div>
    </div>
  );
}
