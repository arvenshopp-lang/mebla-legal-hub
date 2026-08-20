import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { useAuth, canManage, ROLE_LABELS } from "@/hooks/use-auth";
import { APP_ROLE, INVITATION_STATUS, asOptions, fmtDate } from "@/lib/enums";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
  BusyOverlay,
  IconBtn,
  Modal,
  FormField,
  inputCls,
  Btn,
  Badge,
  ConfirmDialog,
} from "@/lib/list-utils";
import { FIELD_LIMITS } from "@/lib/form-limits";
import { DataView, type Column } from "@/components/data/data-view";
import { Trash2, Copy, Mail } from "lucide-react";
import { describeMutationError } from "@/lib/subscription.shared";
import { describeInviteError } from "@/lib/invitations.shared";
import { inviteTeamMember } from "@/lib/invitations.functions";
import { CasePartyPermissionsPanel } from "@/components/team/case-party-permissions";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { errMsg } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/team")({
  component: Page,
  head: () => ({
    meta: [
      { title: "الفريق | مِهلة" },
      {
        name: "description",
        content: "إدارة أعضاء المكتب وأدوارهم ودعوات الانضمام وحالات العضوية.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "الفريق | مِهلة" },
      {
        property: "og:description",
        content: "إدارة أعضاء المكتب وأدوارهم ودعوات الانضمام وحالات العضوية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const inviteSchema = z.object({
  email: z.string().trim().email("بريد غير صالح").max(255),
  role: z.enum(["admin", "lawyer", "legal_assistant", "viewer"]),
});

/** رابط الدعوة الرسمي: صفحة عامة تعالج الرمز وتُنفّذ الانضمام. */
const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

/**
 * سبب عدم وصول رسالة الدعوة بصيغة عربية عملية. الحجب لدى خدمة البريد
 * (ارتداد أو إلغاء اشتراك أو شكوى) لا يمكن رفعه من داخل المكتب، لذلك نوجّه
 * المستخدم إلى الرابط اليدوي ثم إلى دعم مِهلة.
 */
const describeEmailReason = (reason?: string, ref?: string): string => {
  if (reason === "recipient_suppressed")
    return "هذا البريد محجوب لدى مزوّد البريد (ارتداد سابق أو إلغاء اشتراك)، فلا تصله رسائل المنصة. الدعوة أُنشئت — شارك الرابط مباشرة مع العضو، أو راسل دعم مِهلة لرفع الحجب.";
  if (reason === "email_not_configured")
    return "خدمة البريد غير مهيأة حالياً. الدعوة أُنشئت — شارك الرابط مباشرة مع العضو.";
  return `تعذّر إرسال البريد حالياً، شارك الرابط يدوياً من زر «نسخ».${ref ? ` (مرجع العطل: ${ref})` : ""}`;
};

/** الحالة الفعلية للدعوة: "pending" منتهية الصلاحية تُعرض كمنتهية. */
const effectiveInviteStatus = (inv: { status: string; expires_at: string | null }) =>
  inv.status === "pending" && inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now()
    ? "expired"
    : inv.status;

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  type MemberRow = Tables<"organization_members"> & {
    profile: {
      full_name: string | null;
      email: string | null;
      phone: string | null;
      job_title: string | null;
      avatar_url: string | null;
    } | null;
  };
  type InvitationRow = Tables<"organization_invitations">;
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const [revoking, setRevoking] = useState<InvitationRow | null>(null);
  const admin = canManage(activeRole);

  const {
    data: members,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["team-members", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("*, profile:profiles(full_name, job_title, avatar_url)")
        .eq("organization_id", activeOrgId!)
        .order("joined_at");
      if (error) throw error;
      const rows = (data ?? []) as MemberRow[];
      // بيانات التواصل تُمنح لمالك/مدير المكتب فقط عبر دالة خادمية مقيّدة.
      if (!canManage(activeRole)) return rows;
      const { data: contacts } = await supabase.rpc("org_team_contacts", {
        _organization_id: activeOrgId!,
      });
      const byUser = new Map(
        ((contacts ?? []) as { user_id: string; email: string | null; phone: string | null }[]).map(
          (c) => [c.user_id, c],
        ),
      );
      return rows.map((m) => ({
        ...m,
        profile: m.profile
          ? {
              ...m.profile,
              email: byUser.get(m.user_id)?.email ?? null,
              phone: byUser.get(m.user_id)?.phone ?? null,
            }
          : null,
      }));
    },
  });

  const { data: invitations } = useQuery({
    queryKey: ["team-invitations", activeOrgId],
    enabled: !!activeOrgId && admin,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_invitations")
        .select("*")
        .eq("organization_id", activeOrgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Enums<"app_role"> }) => {
      const { error } = await supabase.from("organization_members").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الدور");
      qc.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (e: unknown) => toast.error("تعذّر التحديث", { description: errMsg(e) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الإزالة");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      setRemoving(null);
    },
    onError: (e: unknown) => toast.error("تعذّر الإزالة", { description: errMsg(e) }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("organization_invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إلغاء الدعوة");
      qc.invalidateQueries({ queryKey: ["team-invitations"] });
      setRevoking(null);
    },
    onError: (e: unknown) =>
      toast.error("تعذّر إلغاء الدعوة", { description: describeMutationError(errMsg(e)) }),
  });

  const resend = useMutation({
    mutationFn: (inv: { email: string; role: string }) =>
      inviteTeamMember({
        data: {
          organizationId: activeOrgId!,
          email: inv.email,
          role: inv.role,
          origin: window.location.origin,
        },
      }),
    onSuccess: (result) => {
      toast[result.emailSent ? "success" : "warning"](
        result.emailSent ? "تم إرسال الدعوة مرة أخرى" : "أُنشئ رابط جديد للدعوة",
        {
          description: result.emailSent
            ? "أُصدر رابط جديد وأُبطل الرابط السابق."
            : describeEmailReason(result.emailReason, result.emailRef),
        },
      );
      qc.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (e: unknown) =>
      toast.error("تعذّر إعادة الإرسال", {
        description: describeInviteError(e instanceof Error ? e.message : ""),
      }),
  });

  const filtered = (members ?? []).filter((m: MemberRow) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (m.profile?.full_name ?? "").toLowerCase().includes(s) ||
      (m.profile?.email ?? "").toLowerCase().includes(s)
    );
  });

  const memberColumns: Column<MemberRow>[] = [
    {
      id: "name",
      header: "الاسم",
      mobile: "title",
      wrap: true,
      cell: (m) => (
        <>
          {m.profile?.full_name ?? "—"}{" "}
          {m.user_id === user?.id && <span className="text-xs text-text-muted">(أنت)</span>}
        </>
      ),
    },
    { id: "email", header: "البريد", wrap: true, cell: (m) => m.profile?.email ?? "—" },
    { id: "job", header: "المسمى", cell: (m) => m.profile?.job_title ?? "—" },
    {
      id: "role",
      header: "الدور",
      cell: (m) =>
        admin && m.role !== "owner" && m.user_id !== user?.id ? (
          <select
            value={m.role}
            aria-label="دور العضو"
            onChange={(e) =>
              changeRole.mutate({ id: m.id, role: e.target.value as Enums<"app_role"> })
            }
            className={inputCls + " max-w-[160px] py-1.5"}
          >
            {(["admin", "lawyer", "legal_assistant", "viewer"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <Badge tone={m.role === "owner" ? "gold" : "muted"}>
            {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}
          </Badge>
        ),
    },
    {
      id: "status",
      header: "الحالة",
      cell: (m) => (
        <Badge tone={m.status === "active" ? "green" : "muted"}>
          {m.status === "active" ? "نشط" : m.status}
        </Badge>
      ),
    },
    { id: "joined", header: "تاريخ الانضمام", cell: (m) => fmtDate(m.joined_at) },
    {
      id: "actions",
      header: " ",
      mobile: "actions",
      cell: (m) =>
        admin && m.role !== "owner" && m.user_id !== user?.id ? (
          <IconBtn
            tone="danger"
            aria-label="إزالة العضو"
            title="إزالة العضو"
            loading={remove.isPending && removing?.id === m.id}
            onClick={() => setRemoving(m)}
          >
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        ) : null,
    },
  ];

  const invitationColumns: Column<InvitationRow>[] = [
    { id: "email", header: "البريد", mobile: "title", wrap: true, cell: (inv) => inv.email },
    {
      id: "role",
      header: "الدور",
      cell: (inv) => (
        <Badge tone="muted">{ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS]}</Badge>
      ),
    },
    {
      id: "status",
      header: "الحالة",
      cell: (inv) => {
        const status = effectiveInviteStatus(inv);
        return (
          <Badge tone={status === "pending" ? "warn" : status === "accepted" ? "green" : "muted"}>
            {INVITATION_STATUS[status]}
          </Badge>
        );
      },
    },
    { id: "expires", header: "تنتهي في", cell: (inv) => fmtDate(inv.expires_at) },
    {
      id: "link",
      header: "الرابط",
      cell: (inv) =>
        effectiveInviteStatus(inv) === "pending" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Btn
              variant="link"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl(inv.token));
                toast.success("تم نسخ الرابط");
              }}
            >
              <Copy className="h-3 w-3" /> نسخ
            </Btn>
            <Btn
              variant="link"
              size="sm"
              disabled={resend.isPending}
              onClick={() => resend.mutate({ email: inv.email, role: inv.role })}
            >
              <Mail className="h-3 w-3" /> إعادة الإرسال
            </Btn>
          </div>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: " ",
      mobile: "actions",
      cell: (inv) =>
        effectiveInviteStatus(inv) === "pending" ? (
          <IconBtn
            tone="danger"
            aria-label="إلغاء الدعوة"
            title="إلغاء الدعوة"
            loading={revoke.isPending && revoking?.id === inv.id}
            onClick={() => setRevoking(inv)}
          >
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        ) : null,
    },
  ];

  return (
    <DashboardShell title="الفريق">
      <PageToolbar
        searching={isFetching && !isLoading}
        search={search}
        setSearch={setSearch}
        canAdd={admin}
        onAdd={() => setInviteOpen(true)}
        addLabel="دعوة عضو"
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={errMsg(error)} />
      ) : !filtered.length ? (
        <EmptyState title="لا يوجد أعضاء" />
      ) : (
        <BusyOverlay busy={isFetching && !isLoading}>
          <DataView
            label="جدول أعضاء الفريق"
            rows={filtered as MemberRow[]}
            rowKey={(m) => m.id}
            columns={memberColumns}
          />
        </BusyOverlay>
      )}

      {admin && (invitations ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-base font-bold text-foreground">الدعوات</h2>
          <DataView
            label="جدول الدعوات"
            rows={invitations as InvitationRow[]}
            rowKey={(inv) => inv.id}
            columns={invitationColumns}
          />
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        orgId={activeOrgId!}
        userId={user?.id}
      />
      {admin && activeOrgId && (
        <CasePartyPermissionsPanel orgId={activeOrgId} members={(members ?? []) as never} />
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        title="إزالة عضو"
        message={`سيتم إزالة "${removing?.profile?.full_name}" من الفريق.`}
      />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        loading={revoke.isPending}
        title="إلغاء الدعوة"
        message={`سيتم إلغاء دعوة "${revoking?.email}".`}
        confirmLabel="تأكيد الإلغاء"
      />
    </DashboardShell>
  );
}

function InviteDialog({
  open,
  onClose,
  orgId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "lawyer" | "legal_assistant" | "viewer">("lawyer");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [emailDelivered, setEmailDelivered] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setRole("lawyer");
    setErrors({});
    setLink(null);
    setEmailDelivered(false);
    setEmailNotice(null);
  };

  const save = async () => {
    const res = inviteSchema.safeParse({ email, role });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message;
      });
      setErrors(errs);
      toast.error("تحقق من الحقول المطلوبة", { description: Object.values(errs)[0] as string });
      return;
    }
    setSaving(true);
    try {
      const result = await inviteTeamMember({
        data: {
          organizationId: orgId,
          email: res.data.email.toLowerCase(),
          role: res.data.role,
          origin: window.location.origin,
        },
      });
      setLink(result.inviteUrl);
      setEmailDelivered(result.emailSent);
      setEmailNotice(
        result.emailSent ? null : describeEmailReason(result.emailReason, result.emailRef),
      );
      track("team_member_invited", { action_source: "dashboard" });
      if (result.emailSent) {
        toast.success("تم إرسال الدعوة بالبريد الإلكتروني");
      } else {
        toast.warning("تم إنشاء الدعوة", {
          description: describeEmailReason(result.emailReason, result.emailRef),
        });
      }
      qc.invalidateQueries({ queryKey: ["team-invitations"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error("تعذّر الإرسال", {
        // بوابات الحصص والاستحقاقات ترجع رسالة عربية جاهزة؛ نعرضها كما هي
        // ونرجع لمترجم أخطاء الدعوات عند أي سبب آخر.
        description: describeMutationError(message, describeInviteError(message)),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="دعوة عضو جديد"
    >
      {link ? (
        <div className="space-y-4">
          {emailNotice && (
            <p
              role="status"
              className="rounded-[var(--radius-m)] border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-foreground"
            >
              {emailNotice}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {emailDelivered
              ? "أرسلنا رسالة الدعوة إلى بريد العضو. يمكنك أيضاً مشاركة الرابط مباشرة:"
              : "شارك الرابط التالي مع العضو ليتمكن من الانضمام:"}
          </p>
          <div className="flex items-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
            <code className="flex-1 truncate text-xs">{link}</code>
            <Btn
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("تم النسخ");
              }}
            >
              <Copy className="h-3 w-3" /> نسخ
            </Btn>
          </div>
          <div className="flex justify-end">
            <Btn
              onClick={() => {
                reset();
                onClose();
              }}
            >
              تم
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            <FormField label="البريد الإلكتروني" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={FIELD_LIMITS.email}
                dir="ltr"
                className={inputCls}
                placeholder="user@example.com"
              />
              {errors.email && <span className="text-xs text-danger">{errors.email}</span>}
            </FormField>
            <FormField label="الدور" required>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "admin" | "lawyer" | "legal_assistant" | "viewer")
                }
                className={inputCls}
              >
                {(["admin", "lawyer", "legal_assistant", "viewer"] as const).map((r) => (
                  <option key={r} value={r}>
                    {APP_ROLE[r]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn
              variant="outline"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={saving}
            >
              إلغاء
            </Btn>
            <Btn onClick={save} loading={saving}>
              {saving ? "جاري الإنشاء…" : "إنشاء الدعوة"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}
