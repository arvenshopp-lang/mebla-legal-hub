import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/routes/login";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate } from "@/lib/enums";
import { supabase } from "@/integrations/supabase/client";
import {
  getInvitation,
  joinOrganization,
  requestInviteResendFn,
} from "@/lib/invitations.functions";
import {
  describeInviteError,
  INVITE_MESSAGES,
  isValidInviteToken,
  type InviteRole,
} from "@/lib/invitations.shared";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  component: InvitePage,
});

const ROLE_LABEL: Record<InviteRole, string> = {
  admin: "مدير المكتب",
  lawyer: "محامٍ",
  legal_assistant: "مساعد قانوني",
  viewer: "مطالع",
};

const ROLE_HINT: Record<InviteRole, string> = {
  admin: "إدارة كاملة للقضايا والعملاء وأعضاء الفريق.",
  lawyer: "إدارة القضايا والجلسات والمهل والمستندات.",
  legal_assistant: "مساندة تشغيلية على القضايا والمهام والمستندات.",
  viewer: "اطلاع فقط دون تعديل البيانات.",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <span className="text-body-sm font-semibold text-foreground text-left">{value}</span>
    </div>
  );
}

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { session, refresh, loading: authLoading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const tokenValid = isValidInviteToken(token);

  const preview = useQuery({
    queryKey: ["invitation", token],
    enabled: tokenValid,
    retry: false,
    staleTime: 30_000,
    queryFn: () => getInvitation({ data: { token } }),
  });

  const join = useServerFn(joinOrganization);
  const requestResend = useServerFn(requestInviteResendFn);
  const [resendState, setResendState] = useState<"idle" | "pending" | "done">("idle");
  const accept = useMutation({
    mutationFn: () => join({ data: { token } }),
    onSuccess: async (result) => {
      if (result.state === "joined") {
        await refresh();
        toast.success(
          result.alreadyMember
            ? "أنت عضو في هذا المكتب بالفعل"
            : `تم انضمامك إلى ${result.orgName}`,
        );
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      if (result.state === "email_mismatch") {
        toast.error(
          `هذه الدعوة صادرة لبريد آخر (${result.maskedEmail}). سجّل الدخول بالبريد المدعو.`,
        );
        void preview.refetch();
        return;
      }
      toast.error(INVITE_MESSAGES[result.state]);
      void preview.refetch();
    },
    onError: (error: unknown) => {
      toast.error(describeInviteError(error instanceof Error ? error.message : ""));
    },
  });

  const switchAccount = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    navigate({ to: "/login", search: { redirect: `/invite/${token}` }, replace: true });
  };

  // انضمام تلقائي بعد إنشاء الحساب أو تسجيل الدخول: الرابط نفسه هو الموافقة.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    if (!session || authLoading) return;
    if (preview.data?.state !== "valid") return;
    autoJoined.current = true;
    accept.mutate();
    // حرس autoJoined يمنع أي تكرار عند تغيّر مرجع الـ mutation.
  }, [session, authLoading, preview.data?.state, accept]);

  const askResend = async () => {
    setResendState("pending");
    try {
      const result = await requestResend({ data: { token } });
      setResendState("done");
      toast[result.notified ? "success" : "warning"](
        result.notified ? "تم إبلاغ مسؤول المكتب بطلبك" : "تعذّر إرسال الطلب",
        {
          description: result.notified
            ? "سيصلك رابط دعوة جديد على بريدك بعد إصداره."
            : "تواصل مع مسؤول المكتب لإصدار دعوة جديدة.",
        },
      );
    } catch {
      setResendState("idle");
      toast.error("تعذّر إرسال الطلب حالياً، حاول مرة أخرى.");
    }
  };

  if (!tokenValid) {
    return (
      <AuthShell title="دعوة غير صحيحة" subtitle="تعذّر التعرف على رابط الدعوة">
        <p className="text-body-sm text-foreground">{INVITE_MESSAGES.invalid}</p>
        <Link
          to="/"
          className="mt-6 block w-full rounded-[var(--radius-m)] border border-border py-3 text-center text-body-sm font-semibold text-foreground transition hover:bg-surface-muted"
        >
          العودة للصفحة الرئيسية
        </Link>
      </AuthShell>
    );
  }

  if (preview.isLoading || authLoading) {
    return (
      <AuthShell title="دعوة للانضمام" subtitle="نتحقق من صلاحية الدعوة">
        <div className="space-y-3" aria-live="polite">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
          <div className="h-11 w-full animate-pulse rounded bg-surface-muted" />
        </div>
      </AuthShell>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <AuthShell title="تعذّر تحميل الدعوة" subtitle="حدثت مشكلة مؤقتة">
        <p className="text-body-sm text-foreground">
          لم نتمكن من التحقق من الدعوة حالياً. تحقق من اتصالك ثم أعد المحاولة.
        </p>
        <button
          type="button"
          onClick={() => void preview.refetch()}
          className="mt-6 w-full rounded-[var(--radius-m)] bg-primary py-3 text-body-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
        >
          إعادة المحاولة
        </button>
      </AuthShell>
    );
  }

  const data = preview.data;

  if (data.state !== "valid") {
    return (
      <AuthShell title="الدعوة غير متاحة" subtitle={data.orgName ?? undefined}>
        <p className="text-body-sm text-foreground">{INVITE_MESSAGES[data.state]}</p>
        <div className="mt-6 flex flex-col gap-2">
          {(data.state === "expired" || data.state === "revoked") && (
            <button
              type="button"
              onClick={askResend}
              disabled={resendState !== "idle"}
              className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-body-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
            >
              {resendState === "pending"
                ? "جارٍ إرسال الطلب…"
                : resendState === "done"
                  ? "تم إرسال الطلب"
                  : "طلب إعادة إرسال الدعوة"}
            </button>
          )}
          <Link
            to="/login"
            search={{ redirect: "/dashboard" }}
            className="w-full rounded-[var(--radius-m)] border border-border py-3 text-center text-body-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            تسجيل الدخول
          </Link>
          <Link
            to="/"
            className="text-center text-[12px] text-muted-foreground hover:text-foreground"
          >
            العودة للصفحة الرئيسية
          </Link>
        </div>
      </AuthShell>
    );
  }

  const role = (data.role ?? "viewer") as InviteRole;

  return (
    <AuthShell title="دعوة للانضمام إلى مكتب" subtitle="راجع تفاصيل الدعوة قبل القبول">
      <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted px-4 py-1">
        <Row label="المكتب" value={data.orgName ?? "—"} />
        <Row label="الصفة" value={ROLE_LABEL[role]} />
        <Row label="البريد المدعو" value={<span dir="ltr">{data.maskedEmail}</span>} />
        <Row label="صلاحية الرابط" value={data.expiresAt ? fmtDate(data.expiresAt) : "—"} />
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">{ROLE_HINT[role]}</p>

      {session ? (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-body-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
          >
            {accept.isPending ? "جارٍ الانضمام…" : "قبول الدعوة والانضمام"}
          </button>
          <button
            type="button"
            onClick={switchAccount}
            disabled={signingOut}
            className="text-center text-[12px] text-muted-foreground transition hover:text-foreground disabled:opacity-60"
          >
            الدخول بحساب آخر
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/register"
            search={{ invite: token }}
            className="w-full rounded-[var(--radius-m)] bg-primary py-3 text-center text-body-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            إنشاء حساب وقبول الدعوة
          </Link>
          <Link
            to="/login"
            search={{ redirect: `/invite/${token}` }}
            className="w-full rounded-[var(--radius-m)] border border-border py-3 text-center text-body-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            لدي حساب بالفعل
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
