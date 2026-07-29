import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";
import { GoogleIcon } from "@/components/google-icon";
import { PasswordChecklist } from "@/components/password-checklist";
import { evaluatePassword } from "@/lib/password-policy";
import { translateAuthError, logAuthEvent } from "@/lib/auth-errors";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "إنشاء حساب | مِهلة" },
      { name: "description", content: "أنشئ حساباً مجانياً في منصة مِهلة لإدارة قضايا مكتبك." },
      { property: "og:title", content: "إنشاء حساب | مِهلة" },
      { property: "og:description", content: "أنشئ حساباً مجانياً في منصة مِهلة." },
    ],
  }),
});

function RegisterPage() {
  const { session, authLoading, organizationLoading, memberships, refresh } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordCheck = evaluatePassword(password);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = passwordCheck.valid && emailValid && fullName.trim().length >= 3 && !loading;

  useEffect(() => {
    if (authLoading || organizationLoading || !session) return;
    navigate({ to: memberships.length > 0 ? "/dashboard" : "/onboarding", replace: true });
  }, [authLoading, organizationLoading, session, memberships.length, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    // لا يُرسل أي طلب للخادم قبل استيفاء كل الشروط
    if (fullName.trim().length < 3) {
      setFormError("يرجى إدخال الاسم الكامل");
      return;
    }
    if (!emailValid) {
      setFormError("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    if (!passwordCheck.valid) {
      setPasswordTouched(true);
      setFormError("يرجى استيفاء جميع شروط كلمة المرور قبل المتابعة");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: window.location.origin + "/auth/callback",
      },
    });
    setLoading(false);
    if (error) {
      const friendly = translateAuthError(error);
      logAuthEvent({ route: "/register", action: "sign_up", sanitizedMessage: friendly });
      setFormError(friendly);
      toast.error(friendly);
      return;
    }
    if (data.session) {
      const refreshed = await refresh();
      toast.success("تم إنشاء حسابك بنجاح");
      navigate({ to: refreshed.memberships.length > 0 ? "/dashboard" : "/onboarding", replace: true });
    } else {
      setEmailSent(email.trim().toLowerCase());
      toast.success("تم إنشاء حسابك بنجاح", { description: "أرسلنا رابط تأكيد البريد الإلكتروني" });
    }
  };

  if (emailSent) {
    return (
      <AuthShell title="تحقق من بريدك" subtitle="أرسلنا رابط تفعيل الحساب">
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm text-foreground">
          أرسلنا رسالة تفعيل إلى <b>{emailSent}</b>. افتح الرابط داخل الرسالة لإكمال إنشاء حسابك، ثم عُد لتسجيل الدخول.
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/login" search={{ redirect: "/dashboard" }} className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition">
            الذهاب لتسجيل الدخول
          </Link>
          <button type="button" onClick={() => setEmailSent(null)} className="text-xs text-muted-foreground hover:text-foreground">
            استخدام بريد آخر
          </button>
        </div>
      </AuthShell>
    );
  }

  const google = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    sessionStorage.setItem("mehla_auth_redirect", "/onboarding");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      setGoogleLoading(false);
      toast.error("تعذّر الدخول عبر Google");
    }
  };

  if (session && (authLoading || organizationLoading)) {
    return (
      <AuthShell title="جاري التحقق" subtitle="نتأكد من حالة حسابك قبل إنشاء حساب جديد">
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm text-foreground">
          لحظات قليلة…
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="إنشاء حساب جديد" subtitle="ابدأ بتنظيم قضايا مكتبك في دقائق">
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
        إنشاء حساب آمن عبر Google خلال ثوانٍ.
      </p>
      <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
        <div className="h-px flex-1 bg-surface-muted" /> أو <div className="h-px flex-1 bg-surface-muted" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        {formError && (
          <div role="alert" className="rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-3 text-xs leading-6 text-danger">
            {formError}
          </div>
        )}
        <Field label="الاسم الكامل">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="البريد الإلكتروني">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <div>
          <Field label="كلمة المرور">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onFocus={() => setPasswordTouched(true)}
              onChange={(e) => {
                setPassword(e.target.value);
                if (!passwordTouched) setPasswordTouched(true);
              }}
              className={inputCls}
            />
          </Field>
          {(passwordTouched || password.length > 0) && <PasswordChecklist password={password} />}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={loading}
          className="w-full min-h-[46px] rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary/35 disabled:hover:bg-primary/35"
        >
          {loading ? "جاري الإنشاء…" : "إنشاء الحساب"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟ <Link to="/login" search={{ redirect: "/dashboard" }} className="font-semibold text-foreground underline">تسجيل الدخول</Link>
      </p>
    </AuthShell>
  );
}