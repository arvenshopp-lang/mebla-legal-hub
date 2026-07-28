import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManage, ROLE_LABELS } from "@/hooks/use-auth";
import { APP_ROLE, INVITATION_STATUS, asOptions, fmtDate } from "@/lib/enums";
import {
  PageToolbar, EmptyState, LoadingBlock, ErrorBlock, DataCard, Th, Td,
  Modal, FormField, inputCls, Btn, Badge, ConfirmDialog,
} from "@/lib/list-utils";
import { Trash2, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team")({
  component: Page,
});

const inviteSchema = z.object({
  email: z.string().trim().email("بريد غير صالح").max(255),
  role: z.enum(["admin", "lawyer", "legal_assistant", "viewer"]),
});

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<any | null>(null);
  const [revoking, setRevoking] = useState<any | null>(null);
  const admin = canManage(activeRole);

  const { data: members, isLoading, error } = useQuery({
    queryKey: ["team-members", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("organization_members")
        .select("*, profile:profiles(full_name, email, phone, job_title, avatar_url)")
        .eq("organization_id", activeOrgId!).order("joined_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invitations } = useQuery({
    queryKey: ["team-invitations", activeOrgId],
    enabled: !!activeOrgId && admin,
    queryFn: async () => {
      const { data } = await supabase.from("organization_invitations")
        .select("*").eq("organization_id", activeOrgId!).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: any }) => {
      const { error } = await supabase.from("organization_members").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث الدور"); qc.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (e: any) => toast.error("تعذّر التحديث", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الإزالة"); qc.invalidateQueries({ queryKey: ["team-members"] }); setRemoving(null); },
    onError: (e: any) => toast.error("تعذّر الإزالة", { description: e.message }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_invitations").update({ status: "revoked" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم إلغاء الدعوة"); qc.invalidateQueries({ queryKey: ["team-invitations"] }); setRevoking(null); },
  });

  const filtered = (members ?? []).filter((m: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.profile?.full_name ?? "").toLowerCase().includes(s) || (m.profile?.email ?? "").toLowerCase().includes(s);
  });

  return (
    <DashboardShell title="الفريق">
      <PageToolbar
        search={search} setSearch={setSearch}
        canAdd={admin}
        onAdd={() => setInviteOpen(true)}
        addLabel="دعوة عضو"
      />
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={(error as any).message} /> :
        !filtered.length ? <EmptyState title="لا يوجد أعضاء" /> : (
        <DataCard>
          <table className="min-w-full">
            <thead className="bg-[#F5F3EE]/60">
              <tr><Th>الاسم</Th><Th>البريد</Th><Th>المسمى</Th><Th>الدور</Th><Th>الحالة</Th><Th>تاريخ الانضمام</Th><Th>{" "}</Th></tr>
            </thead>
            <tbody className="divide-y divide-[#123C32]/5">
              {filtered.map((m: any) => {
                const isSelf = m.user_id === user?.id;
                const isOwner = m.role === "owner";
                return (
                  <tr key={m.id} className="hover:bg-[#F5F3EE]/40">
                    <Td className="font-medium">{m.profile?.full_name ?? "—"} {isSelf && <span className="text-xs text-[#123C32]/50">(أنت)</span>}</Td>
                    <Td>{m.profile?.email ?? "—"}</Td>
                    <Td>{m.profile?.job_title ?? "—"}</Td>
                    <Td>
                      {admin && !isOwner && !isSelf ? (
                        <select value={m.role} onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value })} className={inputCls + " max-w-[160px] py-1.5"}>
                          {(["admin", "lawyer", "legal_assistant", "viewer"] as const).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={isOwner ? "gold" : "muted"}>{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}</Badge>
                      )}
                    </Td>
                    <Td><Badge tone={m.status === "active" ? "green" : "muted"}>{m.status === "active" ? "نشط" : m.status}</Badge></Td>
                    <Td>{fmtDate(m.joined_at)}</Td>
                    <Td>
                      {admin && !isOwner && !isSelf && (
                        <button onClick={() => setRemoving(m)} className="rounded-lg p-1.5 text-[#7A2E20] hover:bg-[#FBEDE9]"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataCard>
      )}

      {admin && (invitations ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-base font-bold text-[#123C32]">الدعوات</h2>
          <DataCard>
            <table className="min-w-full">
              <thead className="bg-[#F5F3EE]/60">
                <tr><Th>البريد</Th><Th>الدور</Th><Th>الحالة</Th><Th>تنتهي في</Th><Th>الرابط</Th><Th>{" "}</Th></tr>
              </thead>
              <tbody className="divide-y divide-[#123C32]/5">
                {invitations!.map((inv: any) => {
                  const link = `${window.location.origin}/register?invite=${inv.token}`;
                  return (
                    <tr key={inv.id} className="hover:bg-[#F5F3EE]/40">
                      <Td>{inv.email}</Td>
                      <Td><Badge tone="muted">{ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS]}</Badge></Td>
                      <Td><Badge tone={inv.status === "pending" ? "warn" : inv.status === "accepted" ? "green" : "muted"}>{INVITATION_STATUS[inv.status]}</Badge></Td>
                      <Td>{fmtDate(inv.expires_at)}</Td>
                      <Td>
                        {inv.status === "pending" && (
                          <button onClick={() => { navigator.clipboard.writeText(link); toast.success("تم نسخ الرابط"); }} className="inline-flex items-center gap-1 text-xs text-[#123C32] underline">
                            <Copy className="h-3 w-3" /> نسخ
                          </button>
                        )}
                      </Td>
                      <Td>
                        {inv.status === "pending" && <button onClick={() => setRevoking(inv)} className="rounded-lg p-1.5 text-[#7A2E20] hover:bg-[#FBEDE9]"><Trash2 className="h-4 w-4" /></button>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataCard>
        </div>
      )}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} orgId={activeOrgId!} userId={user?.id} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && remove.mutate(removing.id)} loading={remove.isPending} title="إزالة عضو" message={`سيتم إزالة "${removing?.profile?.full_name}" من الفريق.`} />
      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} onConfirm={() => revoking && revoke.mutate(revoking.id)} loading={revoke.isPending} title="إلغاء الدعوة" message={`سيتم إلغاء دعوة "${revoking?.email}".`} confirmLabel="تأكيد الإلغاء" />
    </DashboardShell>
  );
}

function InviteDialog({ open, onClose, orgId, userId }: { open: boolean; onClose: () => void; orgId: string; userId?: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "lawyer" | "legal_assistant" | "viewer">("lawyer");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const reset = () => { setEmail(""); setRole("lawyer"); setErrors({}); setLink(null); };

  const save = async () => {
    const res = inviteSchema.safeParse({ email, role });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      return setErrors(errs);
    }
    setSaving(true);
    const token = crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(); expires.setDate(expires.getDate() + 14);
    const { data, error } = await supabase.from("organization_invitations").insert({
      organization_id: orgId, email: res.data.email, role: res.data.role,
      token, status: "pending", expires_at: expires.toISOString(), invited_by: userId,
    }).select().single();
    setSaving(false);
    if (error) return toast.error("تعذّر الإرسال", { description: error.message });
    setLink(`${window.location.origin}/register?invite=${data.token}`);
    toast.success("تم إنشاء الدعوة");
    qc.invalidateQueries({ queryKey: ["team-invitations"] });
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="دعوة عضو جديد">
      {link ? (
        <div className="space-y-4">
          <p className="text-sm text-[#123C32]/80">شارك الرابط التالي مع العضو ليتمكن من الانضمام:</p>
          <div className="flex items-center gap-2 rounded-xl border border-[#123C32]/15 bg-[#F5F3EE] p-3">
            <code className="flex-1 truncate text-xs">{link}</code>
            <Btn size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success("تم النسخ"); }}>
              <Copy className="h-3 w-3" /> نسخ
            </Btn>
          </div>
          <div className="flex justify-end"><Btn onClick={() => { reset(); onClose(); }}>تم</Btn></div>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            <FormField label="البريد الإلكتروني *">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="user@example.com" />
              {errors.email && <span className="text-xs text-[#7A2E20]">{errors.email}</span>}
            </FormField>
            <FormField label="الدور *">
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className={inputCls}>
                {(["admin", "lawyer", "legal_assistant", "viewer"] as const).map((r) => (
                  <option key={r} value={r}>{APP_ROLE[r]}</option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>إلغاء</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "إنشاء الدعوة"}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}