import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";

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
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/onboarding", replace: true });
  }, [session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("كلمة المرور يجب أن تكون 8 خانات على الأقل");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + "/onboarding",
      },
    });
    setLoading(false);
    if (error) return toast.error("تعذّر إنشاء الحساب", { description: error.message });
    await refresh();
    toast.success("تم إنشاء الحساب");
    navigate({ to: "/onboarding", replace: true });
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("تعذّر الدخول عبر Google");
  };

  return (
    <AuthShell title="إنشاء حساب جديد" subtitle="ابدأ بتنظيم قضايا مكتبك في دقائق">
      <button onClick={google} className="w-full rounded-xl border border-[#123C32]/20 bg-white py-3 text-sm font-medium text-[#123C32] hover:bg-[#123C32]/5 transition">
        المتابعة عبر Google
      </button>
      <div className="my-5 flex items-center gap-3 text-xs text-[#123C32]/50">
        <div className="h-px flex-1 bg-[#123C32]/10" /> أو <div className="h-px flex-1 bg-[#123C32]/10" />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="الاسم الكامل">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="البريد الإلكتروني">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="كلمة المرور">
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <button disabled={loading} className="w-full rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-white hover:bg-[#0d2e26] transition disabled:opacity-60">
          {loading ? "جاري الإنشاء…" : "إنشاء الحساب"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[#123C32]/70">
        لديك حساب بالفعل؟ <Link to="/login" className="font-semibold text-[#123C32] underline">تسجيل الدخول</Link>
      </p>
    </AuthShell>
  );
}