import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";
import { PasswordChecklist } from "@/components/password-checklist";
import { evaluatePassword } from "@/lib/password-policy";
import { translateAuthError } from "@/lib/auth-errors";

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
  const check = evaluatePassword(password);
  const canSubmit = check.valid && password === confirm && !loading;

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
    if (!check.valid) return toast.error("يرجى استيفاء جميع شروط كلمة المرور قبل المتابعة");
    if (password !== confirm) return toast.error("كلمتا المرور غير متطابقتين");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(translateAuthError(error));
    toast.success("تم تحديث كلمة المرور");
    navigate({ to: "/dashboard", replace: true });
  };

  if (!ready)
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F3EE] text-[#123C32]">جاري التحقق…</div>;

  return (
    <AuthShell title="كلمة مرور جديدة" subtitle="أدخل كلمة مرور جديدة لحسابك">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Field label="كلمة المرور الجديدة">
            <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </Field>
          {password.length > 0 && <PasswordChecklist password={password} />}
        </div>
        <Field label="تأكيد كلمة المرور">
          <input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </Field>
        {confirm.length > 0 && password !== confirm && (
          <p className="text-xs text-danger">كلمتا المرور غير متطابقتين</p>
        )}
        <button disabled={!canSubmit} className="w-full min-h-[46px] rounded-xl bg-[#123C32] py-3 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:bg-[#123C32]/35">
          {loading ? "جاري التحديث…" : "تحديث كلمة المرور"}
        </button>
      </form>
    </AuthShell>
  );
}