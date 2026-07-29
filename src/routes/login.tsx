import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { GoogleIcon } from "@/components/google-icon";

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
  const { session, authLoading, organizationLoading, memberships, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading || organizationLoading || !session) return;
    navigate({ to: memberships.length > 0 ? redirect || "/dashboard" : "/onboarding", replace: true });
  }, [authLoading, organizationLoading, session, memberships.length, redirect, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("تعذّر تسجيل الدخول", { description: error.message });
      return;
    }
    const refreshed = await refresh();
    toast.success("مرحباً بعودتك");
    navigate({ to: refreshed.memberships.length > 0 ? redirect || "/dashboard" : "/onboarding", replace: true });
  };

  const google = async () => {
    sessionStorage.setItem("mehla_auth_redirect", redirect || "/dashboard");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) toast.error("تعذّر الدخول عبر Google");
  };

  if (authLoading || organizationLoading) {
    return (
      <AuthShell title="جاري التحقق" subtitle="نتأكد من حالة حسابك قبل عرض صفحة الدخول">
        <div className="rounded-xl border border-[#123C32]/15 bg-[#F5F3EE] p-5 text-sm text-[#123C32]">
          لحظات قليلة…
        </div>
      </AuthShell>
    );
  }

  return <AuthShell title="تسجيل الدخول" subtitle="أدخل بياناتك للمتابعة">
    <button type="button" onClick={google} className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#123C32]/20 bg-white py-3 text-sm font-medium text-[#123C32] transition hover:bg-[#123C32]/5">
      <GoogleIcon />
      <span>المتابعة عبر Google</span>
    </button>
    <div className="my-5 flex items-center gap-3 text-xs text-[#123C32]/50">
      <div className="h-px flex-1 bg-[#123C32]/10" /> أو <div className="h-px flex-1 bg-[#123C32]/10" />
    </div>
    <form onSubmit={submit} className="space-y-4">
      <Field label="البريد الإلكتروني">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </Field>
      <Field label="كلمة المرور">
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
      </Field>
      <div className="text-left">
        <Link to="/forgot-password" className="text-xs font-medium text-[#123C32]/70 underline hover:text-[#123C32]">
          نسيت كلمة المرور؟
        </Link>
      </div>
      <button disabled={loading} className="w-full rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-white hover:bg-[#0d2e26] transition disabled:opacity-60">
        {loading ? "جاري الدخول…" : "دخول"}
      </button>
    </form>
    <p className="mt-6 text-center text-sm text-[#123C32]/70">
      ليس لديك حساب؟ <Link to="/register" className="font-semibold text-[#123C32] underline">إنشاء حساب</Link>
    </p>
  </AuthShell>;
}

export const inputCls =
  "w-full rounded-xl border border-[#123C32]/15 bg-[#F5F3EE] px-4 py-3 text-[#123C32] outline-none focus:border-[#123C32] focus:bg-white transition";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#123C32]">{label}</span>
      {children}
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
    <div className="min-h-screen bg-[#F5F3EE] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 block text-center text-2xl font-bold tracking-tight text-[#123C32]">
          مِهلة <span className="text-[#C9A961]">·</span> MEHLA
        </Link>
        <div className="rounded-3xl border border-[#123C32]/10 bg-white p-8 shadow-[0_20px_60px_-20px_rgba(18,60,50,0.15)]">
          <h1 className="text-2xl font-bold text-[#123C32]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[#123C32]/60">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}