import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformAdminProvider, usePlatformStaffQuery } from "@/hooks/use-platform-admin";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/mehla-admin")({
  ssr: false,
  component: AdminGate,
});

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted" dir="rtl">
      <p className="text-sm font-medium text-foreground">{text}</p>
    </div>
  );
}

function AdminGate() {
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["admin-session"],
    queryFn: async () => (await supabase.auth.getUser()).data.user ?? null,
  });
  const { data: staff, isLoading: staffLoading, isError } = usePlatformStaffQuery();

  useEffect(() => {
    if (sessionLoading || session) return;
    navigate({ to: "/login", search: { redirect: "/mehla-admin" }, replace: true } as never);
  }, [sessionLoading, session, navigate]);

  if (sessionLoading || (session && staffLoading)) return <Splash text="جاري التحقق من صلاحيات الإدارة…" />;
  if (!session) return <Splash text="جاري تحويلك لتسجيل الدخول…" />;

  if (isError || !staff || staff.status !== "active") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-muted px-4" dir="rtl">
        <div className="max-w-md rounded-[var(--radius-l)] border border-border bg-surface p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-danger" aria-hidden />
          <h1 className="mt-4 text-h4">وصول غير مصرّح به</h1>
          <p className="mt-2 text-body-sm text-muted-foreground">
            هذه اللوحة مخصصة لفريق تشغيل منصة مِهلة فقط. إن كنت تعتقد أن هذا خطأ، تواصل مع مالك المنصة.
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-flex h-11 items-center rounded-[var(--radius-m)] bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            العودة إلى منصة المحامين
          </a>
        </div>
      </div>
    );
  }

  return (
    <PlatformAdminProvider staff={staff} loading={false}>
      <Outlet />
    </PlatformAdminProvider>
  );
}