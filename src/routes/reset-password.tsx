import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        try { await supabase.auth.exchangeCodeForSession(window.location.href); } catch {}
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.error("رابط غير صالح أو منتهي");
        navigate({ to: "/forgot-password", replace: true });
      } else {
        setReady(true);
      }
    })();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("كلمة المرور يجب 8 خانات على الأقل");
    if (password !== confirm) return toast.error("كلمتا المرور غير متطابقتين");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error("تعذّر تحديث كلمة المرور", { description: error.message });
    toast.success("تم تحديث كلمة المرور");
    navigate({ to: "/dashboard", replace: true });
  };

  if (!ready)
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F3EE] text-[#123C32]">جاري التحقق…</div>;

  return (
    <AuthShell title="كلمة مرور جديدة" subtitle="أدخل كلمة مرور جديدة لحسابك">
      <form onSubmit={submit} className="space-y-4">
        <Field label="كلمة المرور الجديدة">
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <Field label="تأكيد كلمة المرور">
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </Field>
        <button disabled={loading} className="w-full rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "جاري التحديث…" : "تحديث كلمة المرور"}
        </button>
      </form>
    </AuthShell>
  );
}