import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManage, ROLE_LABELS } from "@/hooks/use-auth";
import { APP_ROLE, INVITATION_STATUS, asOptions, fmtDate } from "@/lib/enums";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
  DataCard,
  Th,
  Td,
  BusyOverlay,
  IconBtn,
  Modal,
  FormField,
  inputCls,
  Btn,
  Badge,
  ConfirmDialog,
} from "@/lib/list-utils";
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
        .select("*, profile:profiles(full_name, email, phone, job_title, avatar_url)")
        .eq("organization_id", activeOrgId!)
        .order("joined_at");
      if (error) throw error;
      return data ?? [];
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
            : `تعذّر إرسال البريد حالياً، شارك الرابط يدوياً من زر «نسخ».${result.emailRef ? ` (مرجع العطل: ${result.emailRef})` : ""}`,
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
          <DataCard>
            <table className="min-w-full">
              <thead className="bg-surface-muted/60">
                <tr>
                  <Th>الاسم</Th>
                  <Th>البريد</Th>
                  <Th>المسمى</Th>
                  <Th>الدور</Th>
                  <Th>الحالة</Th>
                  <Th>تاريخ الانضمام</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m: MemberRow) => {
                  const isSelf = m.user_id === user?.id;
                  const isOwner = m.role === "owner";
                  return (
                    <tr key={m.id} className="hover:bg-surface-muted/40">
                      <Td className="font-medium">
                        {m.profile?.full_name ?? "—"}{" "}
                        {isSelf && <span className="text-xs text-text-muted">(أنت)</span>}
                      </Td>
                      <Td>{m.profile?.email ?? "—"}</Td>
                      <Td>{m.profile?.job_title ?? "—"}</Td>
                      <Td>
                        {admin && !isOwner && !isSelf ? (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              changeRole.mutate({
                                id: m.id,
                                role: e.target.value as Enums<"app_role">,
                              })
                            }
                            className={inputCls + " max-w-[160px] py-1.5"}
                          >
                            {(["admin", "lawyer", "legal_assistant", "viewer"] as const).map(
                              (r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          <Badge tone={isOwner ? "gold" : "muted"}>
                            {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={m.status === "active" ? "green" : "muted"}>
                          {m.status === "active" ? "نشط" : m.status}
                        </Badge>
                      </Td>
                      <Td>{fmtDate(m.joined_at)}</Td>
                      <Td>
                        {admin && !isOwner && !isSelf && (
                          <IconBtn
                            tone="danger"
                            aria-label="إزالة العضو"
                            title="إزالة العضو"
                            loading={remove.isPending && removing?.id === m.id}
                            onClick={() => setRemoving(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconBtn>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataCard>
        </BusyOverlay>
      )}

      {admin && (invitations ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-base font-bold text-foreground">الدعوات</h2>
          <DataCard>
            <table className="min-w-full">
              <thead className="bg-surface-muted/60">
                <tr>
                  <Th>البريد</Th>
                  <Th>الدور</Th>
                  <Th>الحالة</Th>
                  <Th>تنتهي في</Th>
                  <Th>الرابط</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invitations!.map((inv: InvitationRow) => {
                  const link = inviteUrl(inv.token);
                  const status = effectiveInviteStatus(inv);
                  return (
                    <tr key={inv.id} className="hover:bg-surface-muted/40">
                      <Td>{inv.email}</Td>
                      <Td>
                        <Badge tone="muted">
                          {ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS]}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            status === "pending"
                              ? "warn"
                              : status === "accepted"
                                ? "green"
                                : "muted"
                          }
                        >
                          {INVITATION_STATUS[status]}
                        </Badge>
                      </Td>
                      <Td>{fmtDate(inv.expires_at)}</Td>
                      <Td>
                        {status === "pending" && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(link);
                                toast.success("تم نسخ الرابط");
                              }}
                              className="inline-flex items-center gap-1 text-xs text-foreground underline"
                            >
                              <Copy className="h-3 w-3" /> نسخ
                            </button>
                            <button
                              onClick={() => resend.mutate({ email: inv.email, role: inv.role })}
                              disabled={resend.isPending}
                              className="inline-flex items-center gap-1 text-xs text-foreground underline disabled:opacity-60"
                            >
                              <Mail className="h-3 w-3" /> إعادة الإرسال
                            </button>
                          </div>
                        )}
                      </Td>
                      <Td>
                        {status === "pending" && (
                          <IconBtn
                            tone="danger"
                            aria-label="إلغاء الدعوة"
                            title="إلغاء الدعوة"
                            loading={revoke.isPending && revoking?.id === inv.id}
                            onClick={() => setRevoking(inv)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconBtn>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataCard>
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

  const reset = () => {
    setEmail("");
    setRole("lawyer");
    setErrors({});
    setLink(null);
    setEmailDelivered(false);
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
      if (result.emailSent) {
        toast.success("تم إرسال الدعوة بالبريد الإلكتروني");
      } else {
        toast.warning("تم إنشاء الدعوة", {
          description: `تعذّر إرسال البريد حالياً، شارك الرابط أدناه مع العضو.${result.emailRef ? ` (مرجع العطل: ${result.emailRef})` : ""}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["team-invitations"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error("تعذّر الإرسال", {
        description:
          message.includes("QUOTA_EXCEEDED") || message.includes("SUBSCRIPTION")
            ? describeMutationError(message)
            : describeInviteError(message),
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
            <FormField label="البريد الإلكتروني *">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="user@example.com"
              />
              {errors.email && <span className="text-xs text-danger">{errors.email}</span>}
            </FormField>
            <FormField label="الدور *">
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
