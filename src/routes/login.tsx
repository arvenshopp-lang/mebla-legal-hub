import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AUTH_MESSAGES, logAuthEvent } from "@/lib/auth-errors";
import { resendSignupConfirmation } from "@/lib/auth-actions";
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
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
    const cleanEmail = normalizeEmail(email);
    const nextEmailError = validateEmail(cleanEmail);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      setFormError(null);
      setNotice(null);
      setNeedsConfirmation(false);
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
    <AuthShell title="تسجيل الدخول" subtitle="أدخل بياناتك للمتابعة" variant="login">
      <button
        type="button"
        onClick={google}
        disabled={googleLoading}
        aria-busy={googleLoading}
        className="flex w-full min-h-[46px] items-center justify-center gap-2.5 rounded-[var(--radius-m)] border border-border bg-surface py-3 text-sm font-medium text-foreground shadow-xs transition-colors duration-[var(--duration-fast)] hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        <span>{googleLoading ? "جاري الاتصال بـ Google…" : "تسجيل الدخول بحساب Google"}</span>
      </button>
      <p className="mt-2.5 text-center text-[11px] leading-5 text-text-muted">
        دخول آمن عبر حساب Google — لا نطّلع على كلمة مرورك إطلاقاً.
      </p>
      <div className="my-6 flex items-center gap-3 text-xs text-text-muted">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        <span>أو</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
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
            name="email"
            id="login-email"
            inputMode="email"
            spellCheck={false}
            autoComplete="email"
            required
            value={email}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "login-email-error" : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            onBlur={(e) => {
              const value = e.target.value;
              setEmailError(value.trim() ? validateEmail(normalizeEmail(value)) : null);
            }}
            className={`${loginInputCls} ${emailError ? invalidFieldCls : ""}`}
          />
          {emailError && <FieldError id="login-email-error">{emailError}</FieldError>}
        </Field>
        <Field label="كلمة المرور">
          <input
            type="password"
            name="password"
            id="login-password"
            autoComplete="current-password"
            required
            value={password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "login-password-error" : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            className={`${loginInputCls} ${passwordError ? invalidFieldCls : ""}`}
          />
          {passwordError && <FieldError id="login-password-error">{passwordError}</FieldError>}
        </Field>
        <div className="text-end">
          <Link
            to="/forgot-password"
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            نسيت كلمة المرور؟
          </Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full min-h-[46px] rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-[var(--duration-fast)] hover:bg-primary-hover active:bg-primary-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "جاري تسجيل الدخول…" : "دخول"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link
          to="/register"
          className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          إنشاء حساب
        </Link>
      </p>
    </AuthShell>
  );
}

export { inputCls } from "@/lib/list-utils";

/** تنسيق حقول صفحة الدخول: يبني على inputCls المشترك دون تعديله عالمياً. */
const loginInputCls = `${fieldInputCls} min-h-[46px] rounded-[var(--radius-m)] focus-visible:outline-none`;

/** إبراز بصري للحقل غير الصحيح دون تعديل التنسيق المشترك. */
const invalidFieldCls = "border-danger focus-visible:outline-danger";

/** توحيد صيغة البريد: إزالة الفراغات والمسافات غير المرئية وتصغير الأحرف. */
function normalizeEmail(value: string) {
  return value.replace(/[\s\u200b-\u200f\u202a-\u202e]/g, "").toLowerCase();
}

/** رسائل تحقق عربية واضحة للبريد الإلكتروني، وتشمل حالة كتابته بحروف عربية. */
function validateEmail(cleanEmail: string): string | null {
  if (!cleanEmail) return "يرجى إدخال البريد الإلكتروني.";
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(cleanEmail))
    return "البريد الإلكتروني يُكتب بالحروف اللاتينية والأرقام الإنجليزية فقط. يرجى تبديل لغة لوحة المفاتيح إلى الإنجليزية.";
  if (/[٠-٩۰-۹]/.test(cleanEmail))
    return "استخدم الأرقام الإنجليزية (0-9) في البريد الإلكتروني بدلاً من الأرقام العربية.";
  if (!cleanEmail.includes("@"))
    return "البريد الإلكتروني يجب أن يحتوي على الرمز @، مثال: name@example.com";
  if (cleanEmail.split("@").length > 2) return "البريد الإلكتروني يحتوي على أكثر من رمز @ واحد.";
  const [local, domain] = cleanEmail.split("@");
  if (!local) return "يرجى كتابة اسم المستخدم قبل الرمز @.";
  if (!domain) return "يرجى كتابة اسم النطاق بعد الرمز @، مثال: example.com";
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith("."))
    return "اسم النطاق غير مكتمل. يجب أن يكون على هيئة example.com";
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local))
    return "البريد الإلكتروني يحتوي على رموز غير مسموح بها.";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
    return "اسم النطاق غير صحيح. يجب أن يكون على هيئة example.com";
  return null;
}

/** رسائل تحقق عربية واضحة لكلمة المرور (تحقق شكلي فقط دون كشف سياسة الحساب). */
function validatePassword(value: string): string | null {
  if (!value) return "يرجى إدخال كلمة المرور.";
  if (value.trim().length === 0) return "كلمة المرور لا يمكن أن تكون مسافات فقط.";
  if (value.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
  return null;
}

/** رسالة خطأ حقل واحد داخل منطقة role=\"alert\" ليقرأها قارئ الشاشة فوراً. */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span
      id={id}
      role="alert"
      className="mt-1.5 block text-[12px] leading-5 font-medium text-danger"
    >
      {children}
    </span>
  );
}

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
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: "default" | "login";
}) {
  return (
    <div dir="rtl" className="flex min-h-dvh flex-col bg-background px-4 py-10">
      <div
        className={`mx-auto flex w-full flex-1 flex-col justify-center ${
          variant === "login" ? "max-w-[412px]" : "max-w-[420px]"
        }`}
      >
        <Link
          to="/"
          className="mb-8 flex min-h-[44px] items-center justify-center rounded-[var(--radius-m)] text-center text-[17px] font-bold tracking-tight text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          مِهلة <span className="text-text-muted">·</span>{" "}
          <span className="text-[13px] tracking-[0.18em]">MEHLA</span>
        </Link>
        <div
          className={
            variant === "login"
              ? "surface-card p-5 shadow-sm sm:p-8"
              : "surface-card p-6 shadow-sm sm:p-8"
          }
        >
          <h1 className={variant === "login" ? "text-h2 text-center" : "text-h2"}>{title}</h1>
          {subtitle && (
            <p
              className={`mt-1.5 text-body-sm text-muted-foreground ${
                variant === "login" ? "text-center" : ""
              }`}
            >
              {subtitle}
            </p>
          )}
          <div className={variant === "login" ? "mt-6" : "mt-7"}>{children}</div>
        </div>
        <p className="mt-6 text-center text-[12px] text-text-muted">
          منصة مِهلة لإدارة الممارسة القانونية · mehlalex.com
        </p>
      </div>
    </div>
  );
}
