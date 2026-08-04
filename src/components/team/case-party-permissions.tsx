/**
 * منح صلاحيات بيانات أطراف القضية (Least Privilege).
 * الواجهة عرض فقط: كل منح أو سحب يُتحقق منه خادمياً وتفرضه سياسات RLS.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import {
  Badge, Btn, DataCard, EmptyState, ErrorBlock, FormField, IconBtn, LoadingBlock, Modal, Td, Th, inputCls,
} from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import {
  grantCasePartyPermission, listCasePartyGrants, revokeCasePartyPermission,
} from "@/lib/case-parties.functions";

const PERMISSIONS = [
  { id: "case_parties.create", label: "إضافة طرف" },
  { id: "case_parties.update", label: "تعديل بيانات طرف" },
  { id: "case_parties.delete", label: "حذف طرف" },
  { id: "case_parties.read", label: "الاطلاع على الأطراف" },
] as const;

type PermissionId = (typeof PERMISSIONS)[number]["id"];

const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.id, p.label]),
);

interface Member {
  user_id: string;
  role: string;
  profile?: { full_name?: string | null } | null;
}

export function CasePartyPermissionsPanel({ orgId, members }: { orgId: string; members: Member[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const listFn = useServerFn(listCasePartyGrants);
  const grantFn = useServerFn(grantCasePartyPermission);
  const revokeFn = useServerFn(revokeCasePartyPermission);

  const grants = useQuery({
    queryKey: ["case-party-grants", orgId],
    queryFn: async () => listFn({ data: { organizationId: orgId } }),
  });

  // المالك والمدير يملكان الصلاحية ضمناً، فلا يحتاجان منحاً.
  const grantable = useMemo(
    () => members.filter((m) => m.role !== "owner" && m.role !== "admin"),
    [members],
  );
  const nameOf = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile?.full_name ?? "عضو";

  const [userId, setUserId] = useState("");
  const [permission, setPermission] = useState<PermissionId>("case_parties.create");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => { setUserId(""); setPermission("case_parties.create"); setReason(""); setExpiresAt(""); setErrors({}); };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["case-party-grants", orgId] });
    void qc.invalidateQueries({ queryKey: ["case-party-perms", orgId] });
  };

  const grant = useMutation({
    mutationFn: async () =>
      grantFn({
        data: {
          organizationId: orgId,
          userId,
          permission,
          reason: reason.trim(),
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("تم منح الصلاحية");
      invalidate();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error("تعذّر منح الصلاحية", { description: e.message }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => revokeFn({ data: { organizationId: orgId, id } }),
    onSuccess: () => { toast.success("تم سحب الصلاحية"); invalidate(); setRevoking(null); },
    onError: (e: Error) => toast.error("تعذّر سحب الصلاحية", { description: e.message }),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!userId) errs.userId = "اختر العضو";
    if (reason.trim().length < 8) errs.reason = "اكتب سبباً إدارياً واضحاً (٨ أحرف على الأقل)";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    grant.mutate();
  };

  const rows = (grants.data ?? []).filter((g) => !g.revoked_at);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            صلاحيات بيانات أطراف القضية
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            الكتابة على بيانات الأطراف لا تُمنح بالدور، بل بصلاحية صريحة لكل عملية. المالك والمدير يملكانها ضمناً،
            وكل إنشاء أو تعديل أو حذف يُسجَّل بالقيم قبل وبعد.
          </p>
        </div>
        <Btn size="sm" onClick={() => { reset(); setOpen(true); }}>منح صلاحية</Btn>
      </div>

      {grants.isPending ? (
        <DataCard><div className="p-4"><LoadingBlock rows={3} cols={4} /></div></DataCard>
      ) : grants.isError ? (
        <ErrorBlock message="تعذّر تحميل الصلاحيات الممنوحة." />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد صلاحيات ممنوحة" hint="لا يملك أي عضو — غير المالك والمدير — صلاحية الكتابة على بيانات الأطراف." />
      ) : (
        <DataCard>
          <table className="min-w-full">
            <thead className="bg-surface-muted/60">
              <tr><Th>العضو</Th><Th>الصلاحية</Th><Th>السبب</Th><Th>تنتهي في</Th><Th>{" "}</Th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((g) => (
                <tr key={g.id} className="hover:bg-surface-muted/40">
                  <Td className="font-medium">{nameOf(g.user_id)}</Td>
                  <Td><Badge tone="muted">{PERMISSION_LABELS[g.permission] ?? g.permission}</Badge></Td>
                  <Td className="max-w-[280px] truncate">{g.reason ?? "—"}</Td>
                  <Td>{g.expires_at ? fmtDate(g.expires_at) : "بلا تاريخ انتهاء"}</Td>
                  <Td>
                    <IconBtn
                      tone="danger"
                      aria-label="سحب الصلاحية"
                      title="سحب الصلاحية"
                      loading={revoke.isPending && revoking === g.id}
                      onClick={() => { setRevoking(g.id); revoke.mutate(g.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="منح صلاحية على بيانات أطراف القضية">
        <div className="space-y-4">
          <FormField label="العضو" error={errors.userId} required>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls}>
              <option value="">— اختر العضو —</option>
              {grantable.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.user_id}</option>
              ))}
            </select>
          </FormField>
          <FormField label="الصلاحية" required>
            <select value={permission} onChange={(e) => setPermission(e.target.value as PermissionId)} className={inputCls}>
              {PERMISSIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </FormField>
          <FormField label="السبب الإداري" error={errors.reason} required>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="مثال: تكليف بإدخال أطراف قضايا التنفيذ" />
          </FormField>
          <FormField label="تاريخ الانتهاء (اختياري)" hint="بعد هذا التاريخ تسقط الصلاحية تلقائياً.">
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setOpen(false)}>إلغاء</Btn>
            <Btn onClick={submit} loading={grant.isPending}>منح</Btn>
          </div>
        </div>
      </Modal>
    </section>
  );
}
