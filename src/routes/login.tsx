import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AUTH_MESSAGES, logAuthEvent } from "@/lib/auth-errors";
import { lookupSignInMethods } from "@/lib/auth-lookup.functions";
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
      { name: "description", content: "سجّل الدخول إلى حسابك في منصة مِهلة لمتابعة القضايا والجلسات." },
      { property: "og:title", content: "تسجيل الدخول | مِهلة" },
      { property: "og:description", content: "سجّل الدخول إلى حسابك في منصة مِهلة." },
    ],
  }),
});

function LoginPage() {
  const { redirect } = useSearch({ from: "/login" });
  const { session, authLoading, organizationLoading, memberships, allMemberships, refresh, signIn } =
    useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const safeRedirect =
    typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/dashboard";

  const destinationFor = (active: number, all: number) => {
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
  }, [authLoading, organizationLoading, session, memberships.length, allMemberships.length, safeRedirect]);

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

    const { error } = await signIn(cleanEmail, password);
    if (error) {
      let friendly = error;
      if (error === AUTH_MESSAGES.invalidCredentials) {
        // Distinguish "wrong password" from "this account signs in with Google".
        try {
          const info = await lookupSignInMethods({ data: { email: cleanEmail } });
          if (info.exists && !info.hasPassword && info.providers.length > 0) {
            friendly =
              "هذا الحساب مرتبط بتسجيل الدخول عبر Google. استخدم زر «المتابعة عبر Google» أعلاه، أو عيّن كلمة مرور عبر «نسيت كلمة المرور؟».";
          } else if (!info.exists) {
            friendly = AUTH_MESSAGES.userNotFound;
          }
        } catch {
          /* keep the generic credentials message */
        }
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
    sessionStorage.setItem("mehla_auth_redirect", safeRedirect);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      setGoogleLoading(false);
      setFormError("تعذر بدء تسجيل الدخول عبر Google. حاول مرة أخرى.");
      logAuthEvent({ route: "/login", action: "sign_in_google", sanitizedMessage: "oauth_start_failed" });
    }
  };

  // Only show the verification screen when a session actually exists.
  if (session && (authLoading || organizationLoading)) {
    return (
      <AuthShell title="جاري التحقق" subtitle="نتأكد من حالة حسابك قبل المتابعة">
        <div className="rounded-[var(--radius-m)] border border-border bg-[#F5F3EE] p-5 text-sm text-[#123C32]">
          لحظات قليلة…
        </div>
      </AuthShell>
    );
  }

  return <AuthShell title="تسجيل الدخول" subtitle="أدخل بياناتك للمتابعة">
    <button
      type="button"
      onClick={google}
      disabled={googleLoading}
      aria-busy={googleLoading}
      className="flex w-full min-h-[46px] items-center justify-center gap-2.5 rounded-[var(--radius-m)] border border-border bg-surface py-3 text-sm font-medium text-[#123C32] shadow-[0_1px_2px_rgba(18,60,50,0.06)] transition hover:bg-surface-muted active:scale-[0.99] disabled:opacity-60"
    >
      <GoogleIcon />
      <span>{googleLoading ? "جاري فتح نافذة Google…" : "المتابعة عبر Google"}</span>
    </button>
    <p className="mt-2 text-center text-[11px] leading-5 text-text-muted">
      دخول آمن عبر حساب Google — لا نطّلع على كلمة مرورك إطلاقاً.
    </p>
    <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
      <div className="h-px flex-1 bg-surface-muted" /> أو <div className="h-px flex-1 bg-surface-muted" />
    </div>
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && (
        <div role="alert" className="rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-3 text-[12.5px] leading-6 text-danger">
          {formError}
        </div>
      )}
      <Field label="البريد الإلكتروني">
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldInputCls} />
      </Field>
      <Field label="كلمة المرور">
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={fieldInputCls} />
      </Field>
      <div className="text-left">
        <Link to="/forgot-password" className="text-xs font-medium text-muted-foreground underline hover:text-[#123C32]">
          نسيت كلمة المرور؟
        </Link>
      </div>
      <button type="submit" disabled={loading} aria-busy={loading} className="w-full min-h-[46px] rounded-[var(--radius-m)] bg-[#123C32] py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition disabled:opacity-60">
        {loading ? "جاري تسجيل الدخول…" : "دخول"}
      </button>
    </form>
    <p className="mt-6 text-center text-sm text-muted-foreground">
      ليس لديك حساب؟ <Link to="/register" className="font-semibold text-[#123C32] underline">إنشاء حساب</Link>
    </p>
  </AuthShell>;
}

export { inputCls } from "@/lib/list-utils";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
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
        <Link to="/" className="mb-8 block text-center text-[17px] font-bold tracking-tight text-foreground">
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
