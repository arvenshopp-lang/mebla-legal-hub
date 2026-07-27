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
      await refresh();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Landed after email confirmation or OAuth — route to onboarding; auth gate will redirect to /dashboard if already onboarded
        navigate({ to: "/onboarding", replace: true });
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