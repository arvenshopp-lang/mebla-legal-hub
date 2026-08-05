/**
 * مكتبة قوالب الأدوار التشغيلية.
 * القالب مرجع جاهز يُنسخ إلى دور فعلي قابل للتعديل؛ لا يُسند لأي موظف تلقائياً،
 * ويمر عند النسخ بنفس حراسة عدم التصعيد على الخادم.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, GitCompare, Layers, ShieldAlert } from "lucide-react";
import { Badge, Btn, DataCard, EmptyState, Modal, inputCls } from "@/lib/list-utils";
import { PERMISSION_LABELS, isHighRiskPermission } from "@/lib/admin-permissions";
import {
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_TIER_LABELS,
  diffTemplates,
  type RoleTemplate,
  type RoleTemplateTier,
} from "@/lib/rbac/role-templates";
import { createRoleFromTemplate } from "@/lib/rbac/rbac.functions";
import { Field, type RbacOverview } from "./shared";
import { cn } from "@/lib/utils";

const TIERS: RoleTemplateTier[] = ["operations", "commercial", "governance", "readonly"];

function PermissionList({ permissions, holder }: { permissions: string[]; holder: Set<string> | null }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {permissions.map((p) => {
        const missing = holder && !holder.has(p);
        return (
          <li
            key={p}
            className={cn(
              "flex items-start gap-2 rounded-[var(--radius-s)] px-2 py-1.5 text-[12.5px]",
              missing ? "bg-danger/5 text-danger" : "bg-surface-muted",
            )}
          >
            {isHighRiskPermission(p) ? (
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
            )}
            <span className="flex-1">
              {PERMISSION_LABELS[p] ?? p}
              <span className="block font-mono text-[10.5px] text-text-muted">{p}</span>
            </span>
            {missing && <span className="shrink-0 text-[10.5px]">لا تملكها</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function TemplatesPanel({
  data,
  canManage,
  refresh,
}: {
  data: RbacOverview;
  canManage: boolean;
  refresh: () => void;
}) {
  const isSuper = data.me.role === "super_admin";
  const holder = useMemo(
    () => (isSuper ? null : new Set(data.me.effectivePermissions)),
    [isSuper, data.me.effectivePermissions],
  );

  const [tier, setTier] = useState<RoleTemplateTier | "all">("all");
  const [preview, setPreview] = useState<RoleTemplate | null>(null);
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null);
  const [apply, setApply] = useState<{ template: RoleTemplate; code: string; name_ar: string } | null>(null);

  const applyFn = useServerFn(createRoleFromTemplate);
  const applyMut = useMutation({
    mutationFn: () =>
      applyFn({
        data: { templateCode: apply!.template.code, code: apply!.code, name_ar: apply!.name_ar },
      }),
    onSuccess: () => {
      toast.success("تم إنشاء الدور من القالب. يمكنك تعديله من تبويب الأدوار.");
      setApply(null);
      setPreview(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const existingCodes = useMemo(() => new Set(data.roles.map((r) => r.code)), [data.roles]);
  const templates = useMemo(
    () => (tier === "all" ? ROLE_TEMPLATES : ROLE_TEMPLATES.filter((t) => t.tier === tier)),
    [tier],
  );

  const cmp = useMemo(() => {
    if (!compare) return null;
    const a = ROLE_TEMPLATES.find((t) => t.code === compare.a);
    const b = ROLE_TEMPLATES.find((t) => t.code === compare.b);
    if (!a || !b) return null;
    return { a, b, ...diffTemplates(a, b) };
  }, [compare]);

  return (
    <div className="space-y-5">
      <DataCard>
        <div className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-text-muted">
            القوالب مراجع تشغيلية جاهزة وليست أدواراً إلزامية. عند الاعتماد يُنسخ القالب إلى دور عادي في
            «الأدوار والصلاحيات» قابل للتعديل والحذف، ولا يُسند لأي موظف تلقائياً. لا يمكنك نسخ صلاحية لا
            تملكها — ستُرفض العملية على الخادم وتُسجَّل في سجل التدقيق.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="تصفية القوالب" className="flex flex-wrap gap-1.5">
              {(["all", ...TIERS] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tier === t}
                  onClick={() => setTier(t)}
                  className={cn(
                    "rounded-[var(--radius-m)] px-3 py-1.5 text-[12.5px] font-medium transition",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    tier === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-muted text-foreground hover:bg-surface",
                  )}
                >
                  {t === "all" ? "كل القوالب" : ROLE_TEMPLATE_TIER_LABELS[t]}
                </button>
              ))}
            </div>
            <Btn
              size="sm"
              variant="outline"
              onClick={() => setCompare({ a: ROLE_TEMPLATES[0]!.code, b: ROLE_TEMPLATES[1]!.code })}
            >
              <GitCompare className="me-1.5 h-4 w-4" aria-hidden />
              مقارنة قالبين
            </Btn>
          </div>
        </div>
      </DataCard>

      {templates.length === 0 ? (
        <DataCard>
          <EmptyState title="لا توجد قوالب في هذه الفئة" hint="اختر فئة أخرى." />
        </DataCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const blocked = holder ? t.permissions.filter((p) => !holder.has(p)).length : 0;
            return (
              <DataCard key={t.code}>
                <div className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[15px] font-semibold">{t.name_ar}</h3>
                      <p className="font-mono text-[11px] text-text-muted">{t.name_en}</p>
                    </div>
                    <Badge tone="info">{ROLE_TEMPLATE_TIER_LABELS[t.tier]}</Badge>
                  </div>
                  <p className="flex-1 text-[12.5px] leading-relaxed text-text-muted">{t.summary}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    <Badge tone="muted">
                      <Layers className="me-1 inline h-3 w-3" aria-hidden />
                      {t.permissions.length} صلاحية
                    </Badge>
                    {t.permissions.some(isHighRiskPermission) && <Badge tone="warn">يتضمن صلاحيات حساسة</Badge>}
                    {blocked > 0 && <Badge tone="red">{blocked} خارج صلاحياتك</Badge>}
                    {existingCodes.has(t.code) && <Badge tone="green">مُطبَّق سابقاً</Badge>}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Btn size="sm" variant="outline" onClick={() => setPreview(t)} className="flex-1">
                      معاينة الصلاحيات
                    </Btn>
                    <Btn
                      size="sm"
                      className="flex-1"
                      disabled={!canManage}
                      onClick={() =>
                        setApply({
                          template: t,
                          code: existingCodes.has(t.code) ? `${t.code}_2` : t.code,
                          name_ar: t.name_ar,
                        })
                      }
                    >
                      اعتماد كدور
                    </Btn>
                  </div>
                </div>
              </DataCard>
            );
          })}
        </div>
      )}

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `صلاحيات قالب «${preview.name_ar}»` : ""}
        description="الصلاحيات المعلّمة بالأحمر خارج نطاق صلاحياتك ولن تُنسخ."
        size="lg"
      >
        {preview && <PermissionList permissions={preview.permissions} holder={holder} />}
      </Modal>

      <Modal open={!!compare} onClose={() => setCompare(null)} title="مقارنة قالبين" size="lg">
        {compare && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="القالب الأول">
                <select
                  className={inputCls}
                  value={compare.a}
                  onChange={(e) => setCompare({ ...compare, a: e.target.value })}
                >
                  {ROLE_TEMPLATES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="القالب الثاني">
                <select
                  className={inputCls}
                  value={compare.b}
                  onChange={(e) => setCompare({ ...compare, b: e.target.value })}
                >
                  {ROLE_TEMPLATES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {cmp && (
              <div className="space-y-4">
                <section>
                  <h4 className="mb-2 text-[13px] font-semibold">
                    في «{cmp.a.name_ar}» فقط ({cmp.onlyA.length})
                  </h4>
                  {cmp.onlyA.length === 0 ? (
                    <p className="text-caption">لا شيء.</p>
                  ) : (
                    <PermissionList permissions={cmp.onlyA} holder={null} />
                  )}
                </section>
                <section>
                  <h4 className="mb-2 text-[13px] font-semibold">
                    في «{cmp.b.name_ar}» فقط ({cmp.onlyB.length})
                  </h4>
                  {cmp.onlyB.length === 0 ? (
                    <p className="text-caption">لا شيء.</p>
                  ) : (
                    <PermissionList permissions={cmp.onlyB} holder={null} />
                  )}
                </section>
                <section>
                  <h4 className="mb-2 text-[13px] font-semibold">مشترك ({cmp.shared.length})</h4>
                  {cmp.shared.length === 0 ? (
                    <p className="text-caption">لا شيء.</p>
                  ) : (
                    <PermissionList permissions={cmp.shared} holder={null} />
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!apply}
        onClose={() => setApply(null)}
        title={apply ? `اعتماد قالب «${apply.template.name_ar}»` : ""}
        description="سيُنشأ دور جديد بصلاحيات القالب، ويمكنك تعديله بعد الإنشاء."
      >
        {apply && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              applyMut.mutate();
            }}
          >
            <Field label="رمز الدور" hint="حروف لاتينية صغيرة وأرقام وشرطة سفلية">
              <input
                className={inputCls}
                value={apply.code}
                onChange={(e) => setApply({ ...apply, code: e.target.value })}
                required
              />
            </Field>
            <Field label="اسم الدور بالعربية">
              <input
                className={inputCls}
                value={apply.name_ar}
                onChange={(e) => setApply({ ...apply, name_ar: e.target.value })}
                required
              />
            </Field>
            {existingCodes.has(apply.code) && (
              <p className="text-[12.5px] text-danger">هذا الرمز مستخدم بالفعل. اختر رمزاً آخر.</p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setApply(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={applyMut.isPending} disabled={existingCodes.has(apply.code)}>
                إنشاء الدور
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
