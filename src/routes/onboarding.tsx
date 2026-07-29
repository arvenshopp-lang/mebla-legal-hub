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
  const { session, authLoading, organizationLoading, memberships, allMemberships, refresh, setActiveOrgId } =
    useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const loading = authLoading || organizationLoading;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: "/onboarding" }, replace: true });
      return;
    }
    if (memberships.length > 0) navigate({ to: "/dashboard", replace: true });
    else if (allMemberships.length > 0) navigate({ to: "/pending-access", replace: true });
  }, [loading, session, memberships.length, allMemberships.length, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!session?.user) return;
    const trimmedName = name.trim();
    if (!trimmedName) return toast.error("يرجى إدخال اسم المكتب");
    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_organization_with_owner", {
      _name: trimmedName,
      _city: city.trim() || undefined,
    });

    if (error || !data?.[0]?.organization_id) {
      setSubmitting(false);
      const isDuplicate = error?.message?.includes("already belongs") || error?.message?.includes("already");
      return toast.error(isDuplicate ? "لديك مكتب مُفعّل بالفعل" : "تعذّر إنشاء المكتب", {
        description: isDuplicate ? "سنوجهك إلى لوحة التحكم." : error?.message,
      });
    }
    setActiveOrgId(data[0].organization_id);
    const refreshed = await refresh();
    if (refreshed.memberships.length === 0) {
      setSubmitting(false);
      return toast.error("تم إنشاء المكتب لكن لم تظهر العضوية بعد", {
        description: "حدّث الصفحة أو حاول تسجيل الدخول مرة أخرى.",
      });
    }
    toast.success(data[0].already_exists ? "تم العثور على مكتبك" : "تم إنشاء مكتبك بنجاح");
    navigate({ to: "/dashboard", replace: true });
  };

  if (loading) {
    return (
      <AuthShell title="جاري التحقق" subtitle="نتأكد من حالة حسابك ومكتبك قبل المتابعة">
        <div className="rounded-xl border border-border bg-[#F5F3EE] p-5 text-sm text-[#123C32]">
          لحظات قليلة…
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="أنشئ مكتبك" subtitle="ستدير قضايا مكتبك بشكل مستقل تماماً">
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم المكتب">
          <input required disabled={submitting} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="مثال: مكتب المحامي عبدالله للاستشارات" />
        </Field>
        <Field label="المدينة (اختياري)">
          <input disabled={submitting} value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="الرياض" />
        </Field>
        <button type="submit" disabled={submitting || !name.trim()} className="w-full rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition disabled:opacity-60">
          {submitting ? "جاري الإنشاء…" : "إنشاء المكتب والمتابعة"}
        </button>
      </form>
    </AuthShell>
  );
}