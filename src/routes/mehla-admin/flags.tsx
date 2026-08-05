import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  deleteFeatureFlag,
  deleteNotificationRule,
  listFeatureFlags,
  listNotificationRules,
  saveFeatureFlag,
  saveNotificationRule,
  type FeatureFlag,
  type NotificationRule,
} from "@/lib/flags.functions";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";

export const Route = createFileRoute("/mehla-admin/flags")({
  head: () => ({
    meta: [
      { title: "مفاتيح التشغيل وقواعد الإشعارات · إدارة مِهلة" },
      { name: "description", content: "إدارة مفاتيح تفعيل الميزات وقواعد إرسال الإشعارات في منصة مِهلة." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FlagsPage,
});

const TABS = [
  { id: "flags", label: "مفاتيح الميزات" },
  { id: "rules", label: "قواعد الإشعارات" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type FlagForm = { id?: string; key: string; label: string; description: string; isEnabled: boolean };
const EMPTY_FLAG: FlagForm = { key: "", label: "", description: "", isEnabled: false };

type RuleForm = {
  id?: string;
  topic: string;
  label: string;
  channel: "email" | "sms" | "internal" | "webhook";
  target: string;
  templateKey: string;
  isEnabled: boolean;
};
const EMPTY_RULE: RuleForm = { topic: "", label: "", channel: "internal", target: "", templateKey: "", isEnabled: true };

const CHANNEL_LABELS: Record<RuleForm["channel"], string> = {
  email: "بريد إلكتروني",
  sms: "رسالة نصية",
  internal: "إشعار داخلي",
  webhook: "Webhook",
};

function FlagsPage() {
  const { can } = usePlatformAdmin();
  const canManage = can("feature_flags.manage");
  const [tab, setTab] = useState<TabId>("flags");

  return (
    <AdminShell
      title="مفاتيح التشغيل وقواعد الإشعارات"
      description="التحكم في تفعيل الميزات تدريجياً وتوجيه قواعد إرسال الإشعارات التشغيلية."
    >
      <div className="mb-5 overflow-x-auto">
        <div role="tablist" aria-label="أقسام مفاتيح التشغيل" className="flex min-w-max gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-[var(--radius-m)] px-3.5 py-2 text-[13px] font-medium transition",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "flags" ? <FeatureFlagsPanel canManage={canManage} /> : <NotificationRulesPanel canManage={canManage} />}
    </AdminShell>
  );
}

function FeatureFlagsPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listFeatureFlags);
  const saveFn = useServerFn(saveFeatureFlag);
  const deleteFn = useServerFn(deleteFeatureFlag);

  const [editing, setEditing] = useState<FlagForm | null>(null);
  const [toDelete, setToDelete] = useState<FeatureFlag | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: () => listFn({ data: undefined }),
  });

  const save = useMutation({
    mutationFn: (f: FlagForm) =>
      saveFn({
        data: {
          id: f.id ?? null,
          key: f.key.trim(),
          label: f.label.trim(),
          description: f.description.trim() || null,
          isEnabled: f.isEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ مفتاح التشغيل");
      void qc.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      setEditing(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف المفتاح");
      void qc.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Btn
            onClick={() => {
              setError(null);
              setEditing(EMPTY_FLAG);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> مفتاح جديد
          </Btn>
        </div>
      )}

      {query.isLoading ? (
        <LoadingBlock rows={4} cols={4} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل مفاتيح التشغيل." />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState title="لا توجد مفاتيح تشغيل" hint="أنشئ مفتاحاً للتحكم في تفعيل ميزة جديدة تدريجياً." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[720px] text-right">
            <thead>
              <tr>
                <Th>المفتاح</Th>
                <Th>التسمية</Th>
                <Th>الوصف</Th>
                <Th>الحالة</Th>
                <Th>آخر تحديث</Th>
                {canManage && <Th className="text-left">إجراءات</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data!.map((f) => (
                <tr key={f.id} className="hover:bg-surface-muted/60">
                  <Td className="text-left font-mono text-[12px]">
                    <span dir="ltr">{f.key}</span>
                  </Td>
                  <Td className="font-medium">{f.label}</Td>
                  <Td className="max-w-[280px] truncate text-muted-foreground">{f.description ?? "—"}</Td>
                  <Td>
                    <Badge tone={f.is_enabled ? "green" : "muted"}>{f.is_enabled ? "مُفعَّل" : "معطَّل"}</Badge>
                  </Td>
                  <Td className="text-[12px] text-muted-foreground">{fmtDateTime(f.updated_at)}</Td>
                  {canManage && (
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="تعديل"
                          aria-label={`تعديل مفتاح ${f.label}`}
                          onClick={() => {
                            setError(null);
                            setEditing({
                              id: f.id,
                              key: f.key,
                              label: f.label,
                              description: f.description ?? "",
                              isEnabled: f.is_enabled,
                            });
                          }}
                        >
                          <Settings2 className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          tone="danger"
                          title="حذف"
                          aria-label={`حذف مفتاح ${f.label}`}
                          onClick={() => setToDelete(f)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل مفتاح تشغيل" : "مفتاح تشغيل جديد"}
        description="المفتاح يقبل حروفاً لاتينية صغيرة وأرقاماً وشرطة فقط."
      >
        {editing && (
          <div className="space-y-4">
            <FormField label="المفتاح" required hint="مثال: new-invoice-flow">
              <input
                dir="ltr"
                className={cn(inputCls, "text-left")}
                value={editing.key}
                onChange={(e) => setEditing({ ...editing, key: e.target.value })}
              />
            </FormField>
            <FormField label="التسمية" required>
              <input className={inputCls} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </FormField>
            <FormField label="الوصف">
              <textarea
                className={inputCls}
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </FormField>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={editing.isEnabled}
                onChange={(e) => setEditing({ ...editing, isEnabled: e.target.checked })}
              />
              تفعيل المفتاح
            </label>
            {error && (
              <p role="alert" className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                إلغاء
              </Btn>
              <Btn
                loading={save.isPending}
                onClick={() => {
                  setError(null);
                  if (!editing.key.trim() || !editing.label.trim()) {
                    setError("المفتاح والتسمية مطلوبان.");
                    return;
                  }
                  save.mutate(editing);
                }}
              >
                حفظ
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="حذف مفتاح التشغيل"
        message={`هل تريد حذف مفتاح «${toDelete?.label ?? ""}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        loading={remove.isPending}
      />
    </div>
  );
}

function NotificationRulesPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationRules);
  const saveFn = useServerFn(saveNotificationRule);
  const deleteFn = useServerFn(deleteNotificationRule);

  const [editing, setEditing] = useState<RuleForm | null>(null);
  const [toDelete, setToDelete] = useState<NotificationRule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-notification-rules"],
    queryFn: () => listFn({ data: undefined }),
  });

  const save = useMutation({
    mutationFn: (f: RuleForm) =>
      saveFn({
        data: {
          id: f.id ?? null,
          topic: f.topic.trim(),
          label: f.label.trim(),
          channel: f.channel,
          target: f.target.trim(),
          templateKey: f.templateKey.trim() || null,
          isEnabled: f.isEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ قاعدة الإشعار");
      void qc.invalidateQueries({ queryKey: ["admin-notification-rules"] });
      setEditing(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف القاعدة");
      void qc.invalidateQueries({ queryKey: ["admin-notification-rules"] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Btn
            onClick={() => {
              setError(null);
              setEditing(EMPTY_RULE);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> قاعدة جديدة
          </Btn>
        </div>
      )}

      {query.isLoading ? (
        <LoadingBlock rows={4} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل قواعد الإشعارات." />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState title="لا توجد قواعد إشعارات" hint="أنشئ قاعدة لتوجيه إشعارات موضوع تشغيلي معيّن." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[760px] text-right">
            <thead>
              <tr>
                <Th>الموضوع</Th>
                <Th>التسمية</Th>
                <Th>القناة</Th>
                <Th>الوجهة</Th>
                <Th>الحالة</Th>
                <Th>آخر تحديث</Th>
                {canManage && <Th className="text-left">إجراءات</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data!.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/60">
                  <Td className="font-mono text-[12px]">
                    <span dir="ltr">{r.topic}</span>
                  </Td>
                  <Td className="font-medium">{r.label}</Td>
                  <Td>
                    <Badge tone="info">{CHANNEL_LABELS[r.channel as RuleForm["channel"]] ?? r.channel}</Badge>
                  </Td>
                  <Td className="max-w-[220px] truncate text-left text-[12px] text-muted-foreground">
                    <span dir="ltr">{r.target}</span>
                  </Td>
                  <Td>
                    <Badge tone={r.is_enabled ? "green" : "muted"}>{r.is_enabled ? "مُفعَّلة" : "معطَّلة"}</Badge>
                  </Td>
                  <Td className="text-[12px] text-muted-foreground">{fmtDateTime(r.updated_at)}</Td>
                  {canManage && (
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="تعديل"
                          aria-label={`تعديل قاعدة ${r.label}`}
                          onClick={() => {
                            setError(null);
                            setEditing({
                              id: r.id,
                              topic: r.topic,
                              label: r.label,
                              channel: r.channel as RuleForm["channel"],
                              target: r.target,
                              templateKey: r.template_key ?? "",
                              isEnabled: r.is_enabled,
                            });
                          }}
                        >
                          <Settings2 className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          tone="danger"
                          title="حذف"
                          aria-label={`حذف قاعدة ${r.label}`}
                          onClick={() => setToDelete(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل قاعدة إشعار" : "قاعدة إشعار جديدة"}
        size="lg"
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="الموضوع" required hint="مثال: invoice.overdue">
                <input
                  dir="ltr"
                  className={cn(inputCls, "text-left")}
                  value={editing.topic}
                  onChange={(e) => setEditing({ ...editing, topic: e.target.value })}
                />
              </FormField>
              <FormField label="التسمية" required>
                <input className={inputCls} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </FormField>
              <FormField label="القناة" required>
                <select
                  className={inputCls}
                  value={editing.channel}
                  onChange={(e) => setEditing({ ...editing, channel: e.target.value as RuleForm["channel"] })}
                >
                  {Object.entries(CHANNEL_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="الوجهة" required hint="بريد إلكتروني، رقم جوال، أو رابط Webhook">
                <input
                  dir="ltr"
                  className={cn(inputCls, "text-left")}
                  value={editing.target}
                  onChange={(e) => setEditing({ ...editing, target: e.target.value })}
                />
              </FormField>
              <FormField label="مفتاح القالب" hint="اختياري">
                <input
                  dir="ltr"
                  className={cn(inputCls, "text-left")}
                  value={editing.templateKey}
                  onChange={(e) => setEditing({ ...editing, templateKey: e.target.value })}
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={editing.isEnabled}
                onChange={(e) => setEditing({ ...editing, isEnabled: e.target.checked })}
              />
              تفعيل القاعدة
            </label>
            {error && (
              <p role="alert" className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                إلغاء
              </Btn>
              <Btn
                loading={save.isPending}
                onClick={() => {
                  setError(null);
                  if (!editing.topic.trim() || !editing.label.trim() || !editing.target.trim()) {
                    setError("الموضوع والتسمية والوجهة حقول مطلوبة.");
                    return;
                  }
                  save.mutate(editing);
                }}
              >
                حفظ
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="حذف قاعدة الإشعار"
        message={`هل تريد حذف قاعدة «${toDelete?.label ?? ""}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        loading={remove.isPending}
      />
    </div>
  );
}
