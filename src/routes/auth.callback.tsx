import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    (async () => {
      // Supabase handles both PKCE (?code=) and hash (#access_token) flows internally
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const flowType = url.searchParams.get("type") ?? hashParams.get("type");
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href);
        } catch {
          // الرابط قد يكون مستهلكاً مسبقاً — نكمل بقراءة الجلسة الحالية.
        }
      }
      const refreshed = await refresh();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const storedRedirect = sessionStorage.getItem("mehla_auth_redirect");
        sessionStorage.removeItem("mehla_auth_redirect");
        // إكمال التسجيل عبر Google يُسجَّل مرة واحدة فقط، بعد نجاح الجلسة فعلياً
        if (sessionStorage.getItem("mehla_signup_intent") === "google") {
          sessionStorage.removeItem("mehla_signup_intent");
          track("signup_completed", { auth_method: "google", action_source: "onboarding" });
        }
        const safeRedirect =
          storedRedirect?.startsWith("/") && !storedRedirect.startsWith("//")
            ? storedRedirect
            : "/dashboard";
        const target = safeRedirect.startsWith("/invite/")
          ? safeRedirect
          : flowType === "signup" || flowType === "email_change"
            ? "/auth/verified"
            : refreshed.memberships.length > 0
              ? safeRedirect
              : "/onboarding";
        navigate({ to: target, replace: true } as never);
      } else {
        navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true });
      }
    })();
  }, [navigate, refresh]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-muted text-foreground">
      جاري إكمال تسجيل الدخول…
    </div>
  );
}
