import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";
import { GoogleIcon } from "@/components/google-icon";
import { PasswordChecklist } from "@/components/password-checklist";
import { PasswordInput } from "@/components/password-input";
import { usePasswordStrength } from "@/hooks/use-password-strength";
import { validatePasswordPolicy } from "@/lib/password-policy.functions";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { translateAuthError, logAuthEvent } from "@/lib/auth-errors";
import { resendSignupConfirmation } from "@/lib/auth-actions";
import { useQuery } from "@tanstack/react-query";
import { getSmsPublicConfig, verifyPhoneCode } from "@/lib/sms/sms.functions";
import { formatCountdown, usePhoneChallenge } from "@/lib/sms/use-phone-challenge";
import { useAutoSaveDraft } from "@/lib/drafts/use-autosave-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";
import {
  SMS_DISABLED_CONFIG,
  SMS_MESSAGES,
  normalizePhone,
  phoneFieldVisible,
} from "@/lib/sms/sms.shared";
import { isValidInviteToken } from "@/lib/invitations.shared";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  validateSearch: (search: Record<string, unknown>): { invite?: string } =>
    typeof search.invite === "string" && isValidInviteToken(search.invite)
      ? { invite: search.invite }
      : {},
  head: () => ({
    meta: [
      { title: "إنشاء حساب | مِهلة" },
      { name: "description", content: "أنشئ حساباً مجانياً في منصة مِهلة لإدارة قضايا مكتبك." },
      { property: "og:title", content: "إنشاء حساب | مِهلة" },
      {
        property: "og:description",
        content: "أنشئ حساب مكتبك على منصة مِهلة وابدأ إدارة القضايا والجلسات والمهل النظامية.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/register" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/register" }],
  }),
});

function RegisterPage() {
  const { session, authLoading, organizationLoading, memberships, refresh } = useAuth();
  const navigate = useNavigate();
  const { invite } = Route.useSearch();
  const postAuthTarget = invite ? (`/invite/${invite}` as const) : null;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);

  const { data: smsConfig } = useQuery({
    queryKey: ["sms-public-config"],
    queryFn: () => getSmsPublicConfig(),
    staleTime: 60_000,
  });
  const sms = smsConfig ?? SMS_DISABLED_CONFIG;
  const showPhone = phoneFieldVisible(sms);
  const phoneRequired = showPhone && sms.requirePhone;
  const verificationRequired = showPhone && sms.requireVerification && !sms.outage;
  const phoneParsed = normalizePhone(phone, sms.defaultDialCode);

  // خطوة التحقق محفوظة على الخادم: الرجوع من واتساب لا يُعيدها من الصفر
  const challenge = usePhoneChallenge({
    phone: phoneParsed.ok ? phoneParsed.e164 : null,
    purpose: "signup",
    resendWaitSeconds: sms.resendWaitSeconds,
    enabled: showPhone && sms.requireVerification && !phoneVerified,
  });

  // الحفظ التلقائي: لا تُحفظ كلمة المرور ولا رمز التحقق إطلاقاً
  const draftValue = useMemo(() => ({ fullName, email, phone }), [fullName, email, phone]);
  const restoreDraft = useCallback(
    (value: Partial<{ fullName: string; email: string; phone: string }>) => {
      if (typeof value.fullName === "string") setFullName(value.fullName);
      if (typeof value.email === "string") setEmail(value.email);
      if (typeof value.phone === "string") setPhone(value.phone);
    },
    [],
  );
  const draft = useAutoSaveDraft({
    scope: "register",
    userKey: "anon",
    value: draftValue,
    omit: ["password", "confirmPassword", "phoneCode"],
    onRestore: restoreDraft,
  });

  const strength = usePasswordStrength(password, { name: fullName, email });
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const phoneOk =
    !showPhone ||
    (!phoneRequired && phone.trim() === "") ||
    (phoneParsed.ok && (!verificationRequired || phoneVerified));
  const formIsValid = emailValid && fullName.trim().length >= 3 && passwordsMatch && phoneOk;
  const canSubmit = formIsValid && strength.acceptable && !loading;

  const sendPhoneCode = async () => {
    if (!phoneParsed.ok) {
      setFormError(phoneParsed.message);
      return;
    }
    setFormError(null);
    const ok = await challenge.send();
    if (ok) {
      setPhoneCode("");
      toast.success("تم إرسال رمز التحقق إلى جوالك", {
        description: challenge.testMode ? "الخدمة في وضع الاختبار حالياً." : undefined,
      });
    }
  };

  const confirmPhoneCode = async () => {
    if (verifyBusy || !phoneParsed.ok) return;
    setVerifyBusy(true);
    setFormError(null);
    try {
      await verifyPhoneCode({
        data: { phone: phoneParsed.e164, code: phoneCode, purpose: "signup" },
      });
      setPhoneVerified(true);
      challenge.reset();
      toast.success(SMS_MESSAGES.verified);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : SMS_MESSAGES.invalidCode);
    } finally {
      setVerifyBusy(false);
    }
  };

  useEffect(() => {
    if (authLoading || organizationLoading || !session) return;
    navigate({
      to: postAuthTarget ?? (memberships.length > 0 ? "/dashboard" : "/onboarding"),
      replace: true,
    } as never);
  }, [authLoading, organizationLoading, session, memberships.length, navigate, postAuthTarget]);

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
    if (!strength.acceptable) {
      setPasswordTouched(true);
      setFormError(
        strength.reason ??
          (strength.breachStatus === "checking"
            ? "جارٍ التحقق من أمان كلمة المرور، لحظات قليلة…"
            : "يرجى استيفاء جميع شروط كلمة المرور قبل المتابعة"),
      );
      return;
    }
    if (!passwordsMatch) {
      setFormError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (phoneRequired && !phoneParsed.ok) {
      setFormError(phoneParsed.ok ? null : phoneParsed.message);
      return;
    }
    if (verificationRequired && !phoneVerified) {
      setFormError("يرجى توثيق رقم الجوال برمز التحقق قبل إكمال التسجيل.");
      return;
    }
    setLoading(true);

    // تحقق نهائي على الخادم (لا يُسجَّل ولا يُخزَّن أي شيء من كلمة المرور)
    try {
      const verdict = await validatePasswordPolicy({
        data: { password, name: fullName.trim(), email: email.trim().toLowerCase() },
      });
      if (!verdict.ok) {
        setLoading(false);
        const message = verdict.reason ?? "كلمة المرور غير مقبولة، اختر كلمة أقوى";
        setPasswordTouched(true);
        setFormError(message);
        toast.error(message);
        return;
      }
    } catch {
      logAuthEvent({
        route: "/register",
        action: "password_policy_server_check",
        sanitizedMessage: "server_validation_unavailable",
      });
    }

    // حالة رقم الجوال مستقلة تماماً عن التحقق بخطوتين
    const phoneStatus =
      !showPhone || !phoneParsed.ok ? "not_required" : phoneVerified ? "verified" : "pending";

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          ...(phoneParsed.ok && showPhone
            ? { phone: phoneParsed.e164, phone_verification_status: phoneStatus }
            : {}),
        },
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
      draft.clear();
      const refreshed = await refresh();
      toast.success("تم إنشاء حسابك بنجاح");
      navigate({
        to: postAuthTarget ?? (refreshed.memberships.length > 0 ? "/dashboard" : "/onboarding"),
        replace: true,
      } as never);
    } else {
      draft.clear();
      setEmailSent(email.trim().toLowerCase());
      setResendAt(Date.now());
      toast.success("تم إنشاء حسابك بنجاح", { description: "أرسلنا رابط تأكيد البريد الإلكتروني" });
    }
  };

  if (emailSent) {
    const waitLeft = resendAt ? Math.ceil((60_000 - (Date.now() - resendAt)) / 1000) : 0;
    const resendConfirmation = async () => {
      if (resendBusy) return;
      if (waitLeft > 0) {
        toast.info(`لحماية الحساب، يمكن إعادة الإرسال بعد ${waitLeft} ثانية`);
        return;
      }
      setResendBusy(true);
      const result = await resendSignupConfirmation(emailSent);
      setResendBusy(false);
      if (result.ok) {
        setResendAt(Date.now());
        toast.success(result.message);
      } else {
        if (result.message.includes("كثرت المحاولات")) setResendAt(Date.now());
        toast.error(result.message);
      }
    };
    return (
      <AuthShell title="تحقق من بريدك" subtitle="أرسلنا رابط تفعيل الحساب">
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm text-foreground">
          أرسلنا رسالة تفعيل إلى <b>{emailSent}</b>. افتح الرابط داخل الرسالة لإكمال إنشاء حسابك، ثم
          عُد لتسجيل الدخول.
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/login"
            search={{ redirect: postAuthTarget ?? "/dashboard" }}
            className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition"
          >
            الذهاب لتسجيل الدخول
          </Link>
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={resendBusy}
            className="w-full rounded-[var(--radius-m)] border border-border py-3 text-center text-sm font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
          >
            {resendBusy ? "جاري الإرسال…" : "لم تصل الرسالة؟ إعادة الإرسال"}
          </button>
          <button
            type="button"
            onClick={() => setEmailSent(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            استخدام بريد آخر
          </button>
        </div>
      </AuthShell>
    );
  }

  const google = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    sessionStorage.setItem("mehla_auth_redirect", postAuthTarget ?? "/onboarding");
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
        <div className="h-px flex-1 bg-surface-muted" /> أو{" "}
        <div className="h-px flex-1 bg-surface-muted" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <DraftPrompt draft={draft as never} />
        {formError && (
          <div
            role="alert"
            className="rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-3 text-xs leading-6 text-danger"
          >
            {formError}
          </div>
        )}
        <Field label="الاسم الكامل">
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="البريد الإلكتروني">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        {showPhone && (
          <div className="space-y-3">
            <Field
              label={phoneRequired ? "رقم الجوال" : "رقم الجوال (اختياري)"}
              hint={
                verificationRequired
                  ? "سنرسل رمز تحقق لمرة واحدة لتوثيق الرقم."
                  : "يُستخدم للتواصل والتنبيهات، ويمكن توثيقه لاحقاً من الإعدادات."
              }
            >
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                required={phoneRequired}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneVerified(false);
                }}
                className={inputCls + " text-center tracking-[0.12em]"}
              />
            </Field>

            {sms.showOutageNotice && (
              <div
                role="status"
                className="rounded-[var(--radius-m)] border border-warning/25 bg-warning-soft p-3 text-[12px] leading-6 text-warning"
              >
                {SMS_MESSAGES.outage}
              </div>
            )}

            {verificationRequired && !phoneVerified && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    onClick={sendPhoneCode}
                    disabled={
                      challenge.busy ||
                      !phoneParsed.ok ||
                      (challenge.active && !challenge.canResend)
                    }
                    className="min-h-[42px] rounded-[var(--radius-m)] border border-border bg-surface px-4 text-[13px] font-medium text-foreground transition hover:bg-surface-muted disabled:opacity-60"
                  >
                    {challenge.busy
                      ? "جاري الإرسال…"
                      : challenge.active
                        ? challenge.canResend
                          ? "إعادة إرسال الرمز"
                          : `إعادة الإرسال بعد ${formatCountdown(challenge.resendIn)}`
                        : challenge.expired
                          ? "إرسال رمز جديد"
                          : "إرسال رمز التحقق"}
                  </button>
                  {(challenge.active || challenge.expired) && (
                    <input
                      value={phoneCode}
                      onChange={(e) =>
                        setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, sms.codeLength))
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      dir="ltr"
                      aria-label="رمز التحقق"
                      disabled={challenge.expired}
                      className={inputCls + " max-w-[150px] text-center font-mono tracking-[0.4em]"}
                    />
                  )}
                  {(challenge.active || challenge.expired) && (
                    <button
                      type="button"
                      onClick={confirmPhoneCode}
                      disabled={
                        verifyBusy || challenge.expired || phoneCode.length < sms.codeLength
                      }
                      className="min-h-[42px] rounded-[var(--radius-m)] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
                    >
                      {verifyBusy ? "جاري التحقق…" : "تأكيد الرمز"}
                    </button>
                  )}
                </div>
                {challenge.active && (
                  <p role="status" className="text-[12px] text-text-muted">
                    الرمز صالح لمدة {formatCountdown(challenge.secondsLeft)}
                    {challenge.attemptsLeft !== null
                      ? ` — محاولات متبقية: ${challenge.attemptsLeft}`
                      : ""}
                  </p>
                )}
                {challenge.expired && (
                  <p role="alert" className="text-[12px] text-warning">
                    انتهت صلاحية الرمز. اطلب رمزاً جديداً لإكمال التوثيق.
                  </p>
                )}
                {challenge.error && (
                  <p role="alert" className="text-[12px] text-danger">
                    {challenge.error}
                  </p>
                )}
              </div>
            )}

            {phoneVerified && (
              <p className="text-[12.5px] font-medium text-success">تم توثيق رقم الجوال بنجاح.</p>
            )}
          </div>
        )}
        <div>
          <PasswordInput
            label="كلمة المرور"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onFocus={() => setPasswordTouched(true)}
            onChange={(e) => {
              setPassword(e.target.value);
              if (!passwordTouched) setPasswordTouched(true);
            }}
          />
          {(passwordTouched || password.length > 0) && (
            <PasswordChecklist password={password} state={strength} />
          )}
        </div>
        <div>
          <PasswordInput
            label="تأكيد كلمة المرور"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p role="alert" className="mt-1.5 text-[12.5px] text-danger">
              كلمتا المرور غير متطابقتين
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={loading}
          className="w-full min-h-[46px] rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary/35 disabled:hover:bg-primary/35"
        >
          {loading ? "جاري الإنشاء…" : "إنشاء الحساب"}
        </button>
        <DraftStatus draft={draft as never} />
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{" "}
        <Link
          to="/login"
          search={{ redirect: "/dashboard" }}
          className="font-semibold text-foreground underline"
        >
          تسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
