import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  component: OnboardingPage,
});

function OnboardingPage() {
  const { session, loading, memberships, refresh, setActiveOrgId } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
    if (!loading && memberships.length > 0) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, memberships, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user) return;
    setSubmitting(true);
    const { data: org, error } = await supabase
      .from("organizations")
      .insert({ name, city: city || null, created_by: session.user.id })
      .select()
      .single();
    if (error || !org) {
      setSubmitting(false);
      return toast.error("تعذّر إنشاء المكتب", { description: error?.message });
    }
    const { error: memErr } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: session.user.id,
      role: "owner",
    });
    if (memErr) {
      setSubmitting(false);
      return toast.error("تعذّر إضافة العضوية", { description: memErr.message });
    }
    setActiveOrgId(org.id);
    await refresh();
    toast.success("تم إنشاء مكتبك");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <AuthShell title="أنشئ مكتبك" subtitle="ستدير قضايا مكتبك بشكل مستقل تماماً">
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم المكتب">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="مثال: مكتب المحامي عبدالله للاستشارات" />
        </Field>
        <Field label="المدينة (اختياري)">
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="الرياض" />
        </Field>
        <button disabled={submitting} className="w-full rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-white hover:bg-[#0d2e26] transition disabled:opacity-60">
          {submitting ? "جاري الإنشاء…" : "إنشاء المكتب والمتابعة"}
        </button>
      </form>
    </AuthShell>
  );
}