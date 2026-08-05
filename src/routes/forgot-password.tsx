import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell, Field, inputCls } from "./login";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPage,
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور | مِهلة" },
      {
        name: "description",
        content:
          "استعد الوصول إلى حسابك في منصة مِهلة: أدخل بريدك الإلكتروني المسجّل ليصلك رابط آمن لإعادة تعيين كلمة المرور خلال دقائق.",
      },
      { property: "og:title", content: "استعادة كلمة المرور | مِهلة" },
      {
        property: "og:description",
        content: "رابط آمن لإعادة تعيين كلمة مرور حسابك في منصة مِهلة القانونية.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/forgot-password" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/forgot-password" }],
  }),
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    if (error) return toast.error("تعذّر إرسال الرابط", { description: error.message });
    setSent(true);
  };

  if (sent)
    return (
      <AuthShell title="تحقق من بريدك" subtitle="أرسلنا رابط إعادة تعيين كلمة المرور">
        <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-5 text-sm">
          إن كان <b>{email}</b> مسجّلاً لدينا، فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.
        </div>
        <Link
          to="/login"
          search={{ redirect: "/dashboard" }}
          className="mt-6 block w-full rounded-[var(--radius-m)] bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
        >
          العودة لتسجيل الدخول
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell title="نسيت كلمة المرور؟" subtitle="أدخل بريدك لإرسال رابط الاستعادة">
      <form onSubmit={submit} className="space-y-4">
        <Field label="البريد الإلكتروني">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <button
          disabled={loading}
          className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? "جاري الإرسال…" : "إرسال الرابط"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        تذكّرت كلمة المرور؟{" "}
        <Link to="/login" search={{ redirect: "/dashboard" }} className="font-semibold underline">
          تسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
