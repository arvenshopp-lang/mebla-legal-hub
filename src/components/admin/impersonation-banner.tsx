/**
 * شريط تنبيه الانتحال — ثابت أعلى الصفحة، غير قابل للإخفاء، ويظهر في كل الصفحات
 * أثناء جلسة انتحال نشطة، مع تسجيل كل صفحة تُزار خادمياً.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EyeOff, ShieldAlert } from "lucide-react";
import { endRbacImpersonation, getRbacImpersonationState, logRbacImpersonationPage } from "@/lib/rbac/rbac.functions";
import { formatRiyadh, remainingLabel } from "@/components/admin/rbac/shared";

export function ImpersonationBanner() {
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const stateFn = useServerFn(getRbacImpersonationState);
  const logFn = useServerFn(logRbacImpersonationPage);
  const endFn = useServerFn(endRbacImpersonation);

  const session = useQuery({
    queryKey: ["rbac-impersonation-state"],
    queryFn: () => stateFn({ data: undefined }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const active = session.data ?? null;

  useEffect(() => {
    if (!active) return;
    void logFn({ data: { path: pathname } }).catch(() => undefined);
  }, [active, logFn, pathname]);

  const end = useMutation({
    mutationFn: () => endFn({ data: { id: active!.id, reason: "إنهاء يدوي من الشريط" } }),
    onSuccess: () => {
      toast.success("تم إنهاء جلسة الانتحال.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!active) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-[var(--z-modal)] flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning-soft px-4 py-2.5 text-[13px] text-warning"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
        <strong>جلسة انتحال نشطة (قراءة فقط)</strong>
        <span className="truncate">
          تعرض بيانات {active.target_email ?? active.target_user_id} — تنتهي {formatRiyadh(active.expires_at)} (يتبقى{" "}
          {remainingLabel(active.expires_at)})
        </span>
      </span>
      <button
        type="button"
        onClick={() => end.mutate()}
        disabled={end.isPending}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-m)] bg-warning px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        <EyeOff className="h-4 w-4" aria-hidden />
        {end.isPending ? "جارٍ الإنهاء…" : "إنهاء الجلسة"}
      </button>
    </div>
  );
}
