import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
      if (code) {
        try { await supabase.auth.exchangeCodeForSession(window.location.href); } catch {}
      }
      const refreshed = await refresh();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const storedRedirect = sessionStorage.getItem("mehla_auth_redirect");
        sessionStorage.removeItem("mehla_auth_redirect");
        const safeRedirect = storedRedirect?.startsWith("/") && !storedRedirect.startsWith("//")
          ? storedRedirect
          : "/dashboard";
        const target = refreshed.memberships.length > 0 ? safeRedirect : "/onboarding";
        navigate({ to: target, replace: true });
      } else {
        navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true });
      }
    })();
  }, [navigate, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F3EE] text-[#123C32]">
      جاري إكمال تسجيل الدخول…
    </div>
  );
}