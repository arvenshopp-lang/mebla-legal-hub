import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "./login";
import { PasswordChecklist } from "@/components/password-checklist";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { PasswordInput } from "@/components/password-input";
import { usePasswordStrength } from "@/hooks/use-password-strength";
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
  const strength = usePasswordStrength(password);
  const canSubmit = strength.acceptable && password === confirm && !loading;

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
    if (!strength.acceptable)
      return toast.error(strength.reason ?? "يرجى استيفاء جميع شروط كلمة المرور قبل المتابعة");
    if (password !== confirm) return toast.error("كلمتا المرور غير متطابقتين");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(translateAuthError(error));
    toast.success("تم تحديث كلمة المرور");
    navigate({ to: "/dashboard", replace: true });
  };

  if (!ready)
    return <div className="min-h-dvh flex items-center justify-center bg-surface-muted text-foreground">جاري التحقق…</div>;

  return (
    <AuthShell title="كلمة مرور جديدة" subtitle="أدخل كلمة مرور جديدة لحسابك">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <PasswordInput
            label="كلمة المرور الجديدة"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password.length > 0 && <PasswordChecklist password={password} state={strength} />}
        </div>
        <PasswordInput
          label="تأكيد كلمة المرور"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm.length > 0 && password !== confirm && (
          <p className="text-xs text-danger">كلمتا المرور غير متطابقتين</p>
        )}
        <button disabled={!canSubmit} className="w-full min-h-[46px] rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:bg-primary/35">
          {loading ? "جاري التحديث…" : "تحديث كلمة المرور"}
        </button>
      </form>
    </AuthShell>
  );
}