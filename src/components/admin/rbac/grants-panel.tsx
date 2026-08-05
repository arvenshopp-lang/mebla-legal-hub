/** المنح المؤقتة والتفويض: توقيت الرياض، مرجع إداري، وسحب فوري. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldOff } from "lucide-react";
import { ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  Modal,
  PageToolbar,
  SectionCard,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { createRbacGrant, revokeRbacGrant } from "@/lib/rbac/rbac.functions";
import {
  Field,
  StaffSelect,
  formatRiyadh,
  grantState,
  isoToRiyadhLocal,
  remainingLabel,
  riyadhLocalToIso,
  staffName,
  type RbacGrant,
  type RbacOverview,
} from "./shared";

type GrantForm = {
  granteeUserId: string;
  permission: string;
  source: "temporary" | "delegation";
  reason: string;
  reference: string;
  startsAt: string;
  expiresAt: string;
};

function defaultForm(): GrantForm {
  const start = new Date();
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  return {
    granteeUserId: "",
    permission: "",
    source: "temporary",
    reason: "",
    reference: "",
    startsAt: isoToRiyadhLocal(start.toISOString()),
    expiresAt: isoToRiyadhLocal(end.toISOString()),
  };
}

export function GrantsPanel({
  data,
  canGrant,
  refresh,
}: {
  data: RbacOverview;
  canGrant: boolean;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "expired" | "revoked">("live");
  const [form, setForm] = useState<GrantForm | null>(null);
  const [revoke, setRevoke] = useState<{ grant: RbacGrant; reason: string } | null>(null);

  const createFn = useServerFn(createRbacGrant);
  const revokeFn = useServerFn(revokeRbacGrant);
  const now = new Date(data.now).getTime();

  const create = useMutation({
    mutationFn: () => {
      const f = form!;
      const startsAt = f.startsAt ? riyadhLocalToIso(f.startsAt) : null;
      const expiresAt = riyadhLocalToIso(f.expiresAt);
      if (!expiresAt) throw new Error("حدّد وقت انتهاء صحيح بتوقيت الرياض.");
      if (startsAt && new Date(expiresAt).getTime() <= new Date(startsAt).getTime())
        throw new Error("وقت الانتهاء يجب أن يكون بعد وقت البدء.");
      if (f.reason.trim().length < 10) throw new Error("اكتب سبباً واضحاً لا يقل عن 10 أحرف.");
      return createFn({
        data: {
          granteeUserId: f.granteeUserId,
          permission: f.permission,
          source: f.source,
          reason: f.reason,
          reference: f.reference || null,
          startsAt,
          expiresAt,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إصدار المنح.");
      setForm(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeFn({ data: { id: revoke!.grant.id, reason: revoke!.reason } }),
    onSuccess: () => {
      toast.success("تم سحب المنح.");
      setRevoke(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim();
    return data.grants.filter((g) => {
      const st = grantState(g, now);
      if (status === "live" && st.label !== "سارٍ" && st.label !== "لم يبدأ بعد") return false;
      if (status === "expired" && st.label !== "منتهي") return false;
      if (status === "revoked" && st.label !== "مسحوب") return false;
      if (!q) return true;
      const holder = staffName(data.staff, g.grantee_user_id);
      return (
        g.permission.includes(q) ||
        holder.includes(q) ||
        (g.reference ?? "").includes(q) ||
        g.reason.includes(q)
      );
    });
  }, [data.grants, data.staff, now, search, status]);

  const grantable = useMemo(() => {
    const mine = new Set(data.me.effectivePermissions);
    const isSuper = data.me.role === "super_admin";
    return ADMIN_PERMISSIONS.filter((p) => isSuper || mine.has(p.id));
  }, [data.me]);

  const delegatable = useMemo(() => new Set(data.me.basePermissions), [data.me.basePermissions]);

  return (
    <div className="space-y-5">
      <SectionCard title="منحي السارية" description="الصلاحيات المؤقتة الممنوحة لك حالياً.">
        {data.me.liveGrants.length === 0 ? (
          <p className="text-caption">لا توجد منح سارية على حسابك.</p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {data.me.liveGrants.map((g) => (
              <li
                key={`${g.permission}-${g.expires_at}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="font-mono text-[12px]">{g.permission}</span>
                <Badge tone={g.source === "delegation" ? "info" : "gold"}>
                  {g.source === "delegation" ? "تفويض" : "مؤقت"}
                </Badge>
                <span className="text-caption">
                  تنتهي {formatRiyadh(g.expires_at)} — يتبقى {remainingLabel(g.expires_at, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div>
        <PageToolbar
          search={search}
          setSearch={setSearch}
          placeholder="بحث بالصلاحية أو الموظف أو المرجع…"
          onAdd={() => setForm(defaultForm())}
          addLabel="منح جديد"
          canAdd={canGrant}
          filters={
            <select
              className={`${inputCls} h-11 w-auto`}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              aria-label="تصفية بالحالة"
            >
              <option value="live">السارية والمجدولة</option>
              <option value="expired">المنتهية</option>
              <option value="revoked">المسحوبة</option>
              <option value="all">الكل</option>
            </select>
          }
        />

        {rows.length === 0 ? (
          <DataCard>
            <EmptyState
              title="لا توجد منح مطابقة"
              hint="أصدر منحاً مؤقتاً محدد المدة عند الحاجة التشغيلية."
            />
          </DataCard>
        ) : (
          <DataCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-right">
                <thead>
                  <tr>
                    <Th>المستفيد</Th>
                    <Th>الصلاحية</Th>
                    <Th>النوع</Th>
                    <Th>النافذة الزمنية (الرياض)</Th>
                    <Th>الحالة</Th>
                    <Th className="w-24">إجراء</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const st = grantState(g, now);
                    return (
                      <tr key={g.id} className="border-t border-border">
                        <Td>
                          <span className="block font-semibold">
                            {staffName(data.staff, g.grantee_user_id)}
                          </span>
                          <span className="block text-[11px] text-text-muted">
                            بواسطة {g.granted_by_email ?? staffName(data.staff, g.granted_by)}
                          </span>
                        </Td>
                        <Td>
                          <span className="font-mono text-[12px]">{g.permission}</span>
                          <span className="text-caption mt-0.5 block">{g.reason}</span>
                          {g.reference && (
                            <span className="text-caption block">مرجع: {g.reference}</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={g.source === "delegation" ? "info" : "gold"}>
                            {g.source === "delegation" ? "تفويض" : "مؤقت"}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="block text-[12px]">من {formatRiyadh(g.starts_at)}</span>
                          <span className="block text-[12px]">
                            إلى {formatRiyadh(g.expires_at)}
                          </span>
                          {st.label === "سارٍ" && (
                            <span className="text-caption block">
                              يتبقى {remainingLabel(g.expires_at, now)}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {g.revoke_reason && (
                            <span className="text-caption mt-0.5 block">{g.revoke_reason}</span>
                          )}
                        </Td>
                        <Td>
                          {canGrant && !g.revoked_at && new Date(g.expires_at).getTime() > now && (
                            <Btn
                              size="sm"
                              variant="outline"
                              onClick={() => setRevoke({ grant: g, reason: "" })}
                            >
                              <ShieldOff className="h-4 w-4" aria-hidden /> سحب
                            </Btn>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DataCard>
        )}
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="منح صلاحية مؤقتة"
        description="لا يمكن منح صلاحية لا تملكها، ولا تفويض صلاحية حصلت عليها بتفويض."
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="المستفيد">
              <StaffSelect
                value={form.granteeUserId}
                onChange={(v) => setForm({ ...form, granteeUserId: v })}
                staff={data.staff.filter((s) => s.status === "active")}
                exclude={form.source === "delegation" ? data.me.userId : undefined}
              />
            </Field>
            <Field label="نوع المنح" hint="التفويض يُشتق من صلاحياتك الأساسية فقط.">
              <select
                className={inputCls}
                value={form.source}
                onChange={(e) =>
                  setForm({ ...form, source: e.target.value as GrantForm["source"] })
                }
              >
                <option value="temporary">منح مؤقت</option>
                <option value="delegation">تفويض</option>
              </select>
            </Field>
            <Field label="الصلاحية">
              <select
                className={inputCls}
                value={form.permission}
                onChange={(e) => setForm({ ...form, permission: e.target.value })}
                required
              >
                <option value="">اختر صلاحية</option>
                {grantable
                  .filter((p) => form.source !== "delegation" || delegatable.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.id}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="بداية السريان (الرياض)">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </Field>
              <Field label="نهاية السريان (الرياض)">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  required
                />
              </Field>
            </div>
            <Field label="المرجع الإداري" hint="رقم تذكرة أو قرار داخلي (اختياري)">
              <input
                className={inputCls}
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </Field>
            <Field label="السبب" hint="لا يقل عن 10 أحرف — يُسجَّل في سجل التدقيق.">
              <textarea
                className={inputCls}
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={create.isPending}>
                إصدار المنح
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!revoke} onClose={() => setRevoke(null)} title="سحب المنح">
        {revoke && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              revokeMut.mutate();
            }}
          >
            <p className="text-body-sm text-muted-foreground">
              سحب «{revoke.grant.permission}» من{" "}
              {staffName(data.staff, revoke.grant.grantee_user_id)}.
            </p>
            <Field label="سبب السحب">
              <textarea
                className={inputCls}
                rows={3}
                value={revoke.reason}
                onChange={(e) => setRevoke({ ...revoke, reason: e.target.value })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setRevoke(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="danger" loading={revokeMut.isPending}>
                تأكيد السحب
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
