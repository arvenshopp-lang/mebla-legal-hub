/**
 * إعدادات مركز الدعم: الفرق، التصنيفات، سياسات المهل، قواعد التصعيد.
 * كل حفظ يمر من دوال الدعم الخادمية، والصلاحية تُفرض هناك لا هنا.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  saveSupportCategory,
  saveSupportPolicy,
  saveSupportRule,
  saveSupportTeam,
  saveSupportTeamMember,
} from "@/lib/support/support.functions";
import {
  TICKET_CHANNELS,
  TICKET_CHANNEL_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS_AR,
  humanMinutes,
  type TicketChannel,
  type TicketPriority,
} from "@/lib/support/support.shared";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  FormField,
  Modal,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import type { SupportConfigData } from "./types";

type Config = SupportConfigData;

const TRIGGER_LABELS: Record<string, string> = {
  sla_breach: "تجاوز المهلة",
  sla_warning: "قرب تجاوز المهلة",
  manual: "تصعيد يدوي",
  no_response: "عدم وجود رد",
  priority: "حسب الأولوية",
};

function useSaved(onDone: () => void) {
  const qc = useQueryClient();
  return () => {
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["support-config"] });
    qc.invalidateQueries({ queryKey: ["support-workspace"] });
    onDone();
  };
}

/* ------------------------------------------------------------------ الفرق */

export function TeamsPanel({ config }: { config: Config }) {
  const [editing, setEditing] = useState<Config["teams"][number] | null>(null);
  const [open, setOpen] = useState(false);
  const canManage = config.permissions.manageSla;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">
          الفرق تحدد صندوق البريد المُرسل منه ومسار التصعيد الأعلى.
        </p>
        {canManage && (
          <Btn
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> فريق جديد
          </Btn>
        )}
      </div>

      {config.teams.length === 0 ? (
        <EmptyState title="لا توجد فرق" hint="أنشئ فريقاً واحداً على الأقل ليُسند إليه التذاكر." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[760px] text-right">
            <thead>
              <tr>
                <Th>الفريق</Th>
                <Th>الرمز</Th>
                <Th>صندوق البريد</Th>
                <Th>المدير</Th>
                <Th>الأعضاء</Th>
                <Th>الحالة</Th>
                {canManage && <Th>إجراء</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {config.teams.map((team) => (
                <tr key={team.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">
                    {team.name_ar}
                    {team.is_default && (
                      <span className="ms-1.5 inline-block">
                        <Badge tone="info">افتراضي</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="text-left text-[12px] text-muted-foreground">{team.code}</Td>
                  <Td className="text-left text-[12px]">{team.mailbox_address ?? "—"}</Td>
                  <Td>{team.manager_name ?? "—"}</Td>
                  <Td className="text-[12.5px]">
                    {team.members.length === 0
                      ? "لا أعضاء"
                      : team.members
                          .map((m) => `${m.name}${m.is_lead ? " (قائد)" : ""}`)
                          .join(" · ")}
                  </Td>
                  <Td>
                    <Badge tone={team.is_active ? "green" : "muted"}>
                      {team.is_active ? "مفعّل" : "معطّل"}
                    </Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(team);
                          setOpen(true);
                        }}
                      >
                        تعديل
                      </Btn>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <TeamModal open={open} onClose={() => setOpen(false)} config={config} team={editing} />
    </div>
  );
}

function TeamModal({
  open,
  onClose,
  config,
  team,
}: {
  open: boolean;
  onClose: () => void;
  config: Config;
  team: Config["teams"][number] | null;
}) {
  const saveFn = useServerFn(saveSupportTeam);
  const memberFn = useServerFn(saveSupportTeamMember);
  const done = useSaved(onClose);
  const [code, setCode] = useState(team?.code ?? "");
  const [nameAr, setNameAr] = useState(team?.name_ar ?? "");
  const [mailboxId, setMailboxId] = useState(team?.mailbox_id ?? "");
  const [managerUserId, setManagerUserId] = useState(team?.manager_user_id ?? "");
  const [escalationTeamId, setEscalationTeamId] = useState(team?.escalation_team_id ?? "");
  const [isDefault, setIsDefault] = useState(team?.is_default ?? false);
  const [isActive, setIsActive] = useState(team?.is_active ?? true);
  const [memberId, setMemberId] = useState("");

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          ...(team ? { id: team.id } : {}),
          code: code.trim(),
          nameAr: nameAr.trim(),
          mailboxId: mailboxId ? mailboxId : null,
          managerUserId: managerUserId ? managerUserId : null,
          escalationTeamId: escalationTeamId ? escalationTeamId : null,
          isDefault,
          isActive,
        },
      }),
    onSuccess: done,
    onError: (error: Error) => toast.error("تعذّر حفظ الفريق", { description: error.message }),
  });

  const addMember = useMutation({
    mutationFn: async (userId: string) =>
      memberFn({ data: { teamId: team!.id, userId, isLead: false } }),
    onSuccess: () => {
      toast.success("تم تحديث أعضاء الفريق");
      setMemberId("");
      done();
    },
    onError: (error: Error) => toast.error("تعذّر تحديث العضوية", { description: error.message }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={team ? `تعديل ${team.name_ar}` : "فريق دعم جديد"}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم الفريق" required>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </FormField>
          <FormField label="الرمز" required hint="حروف إنجليزية صغيرة وأرقام">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </FormField>
          <FormField label="صندوق البريد">
            <select
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className={inputCls}
            >
              <option value="">بدون</option>
              {config.mailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.address}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="مدير الفريق">
            <select
              value={managerUserId}
              onChange={(e) => setManagerUserId(e.target.value)}
              className={inputCls}
            >
              <option value="">بدون</option>
              {config.staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="فريق التصعيد">
            <select
              value={escalationTeamId}
              onChange={(e) => setEscalationTeamId(e.target.value)}
              className={inputCls}
            >
              <option value="">بدون</option>
              {config.teams
                .filter((t) => t.id !== team?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name_ar}
                  </option>
                ))}
            </select>
          </FormField>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              الفريق الافتراضي
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              مفعّل
            </label>
          </div>
        </div>

        {team && (
          <div className="rounded-[var(--radius-m)] border border-border p-3.5">
            <p className="mb-2 text-[13px] font-semibold">أعضاء الفريق</p>
            <p className="mb-2.5 text-[12.5px] text-muted-foreground">
              {team.members.length === 0
                ? "لا أعضاء بعد."
                : team.members.map((m) => m.name).join(" · ")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                aria-label="إضافة عضو"
                className={`${inputCls} w-auto`}
              >
                <option value="">اختر موظفاً…</option>
                {config.staff
                  .filter((s) => !team.members.some((m) => m.user_id === s.user_id))
                  .map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name}
                    </option>
                  ))}
              </select>
              <Btn
                variant="outline"
                size="sm"
                disabled={!memberId}
                loading={addMember.isPending}
                onClick={() => addMember.mutate(memberId)}
              >
                إضافة
              </Btn>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn
            loading={save.isPending}
            disabled={!nameAr.trim() || !code.trim()}
            onClick={() => save.mutate()}
          >
            حفظ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- التصنيفات */

export function CategoriesPanel({ config }: { config: Config }) {
  const [editing, setEditing] = useState<Config["categories"][number] | null>(null);
  const [open, setOpen] = useState(false);
  const canManage = config.permissions.manageCategories;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">
          التصنيف يحدد الأولوية الافتراضية والفريق وسياسة المهل عند فتح التذكرة.
        </p>
        {canManage && (
          <Btn
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> تصنيف جديد
          </Btn>
        )}
      </div>

      {config.categories.length === 0 ? (
        <EmptyState title="لا توجد تصنيفات" hint="أضف تصنيفاً ليُستخدم عند فتح التذاكر." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[720px] text-right">
            <thead>
              <tr>
                <Th>التصنيف</Th>
                <Th>الرمز</Th>
                <Th>الأولوية الافتراضية</Th>
                <Th>الفريق الافتراضي</Th>
                <Th>سياسة المهل</Th>
                <Th>الحالة</Th>
                {canManage && <Th>إجراء</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {config.categories.map((category) => (
                <tr key={category.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{category.name_ar}</Td>
                  <Td className="text-left text-[12px] text-muted-foreground">{category.code}</Td>
                  <Td>
                    {TICKET_PRIORITY_LABELS_AR[category.default_priority as TicketPriority] ??
                      category.default_priority}
                  </Td>
                  <Td>
                    {config.teams.find((t) => t.id === category.default_team_id)?.name_ar ?? "—"}
                  </Td>
                  <Td>
                    {config.policies.find((p) => p.id === category.sla_policy_id)?.name_ar ??
                      "مطابقة تلقائية"}
                  </Td>
                  <Td>
                    <Badge tone={category.is_active ? "green" : "muted"}>
                      {category.is_active ? "مفعّل" : "معطّل"}
                    </Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(category);
                          setOpen(true);
                        }}
                      >
                        تعديل
                      </Btn>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <CategoryModal
        open={open}
        onClose={() => setOpen(false)}
        config={config}
        category={editing}
      />
    </div>
  );
}

function CategoryModal({
  open,
  onClose,
  config,
  category,
}: {
  open: boolean;
  onClose: () => void;
  config: Config;
  category: Config["categories"][number] | null;
}) {
  const saveFn = useServerFn(saveSupportCategory);
  const done = useSaved(onClose);
  const [code, setCode] = useState(category?.code ?? "");
  const [nameAr, setNameAr] = useState(category?.name_ar ?? "");
  const [defaultPriority, setDefaultPriority] = useState<TicketPriority>(
    (category?.default_priority as TicketPriority) ?? "medium",
  );
  const [defaultTeamId, setDefaultTeamId] = useState(category?.default_team_id ?? "");
  const [slaPolicyId, setSlaPolicyId] = useState(category?.sla_policy_id ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(category?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          ...(category ? { id: category.id } : {}),
          code: code.trim(),
          nameAr: nameAr.trim(),
          defaultPriority,
          defaultTeamId: defaultTeamId ? defaultTeamId : null,
          slaPolicyId: slaPolicyId ? slaPolicyId : null,
          sortOrder: Number(sortOrder) || 0,
          isActive,
        },
      }),
    onSuccess: done,
    onError: (error: Error) => toast.error("تعذّر حفظ التصنيف", { description: error.message }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? `تعديل ${category.name_ar}` : "تصنيف جديد"}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم التصنيف" required>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </FormField>
          <FormField label="الرمز" required hint="حروف إنجليزية صغيرة وأرقام">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </FormField>
          <FormField label="الأولوية الافتراضية">
            <select
              value={defaultPriority}
              onChange={(e) => setDefaultPriority(e.target.value as TicketPriority)}
              className={inputCls}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS_AR[p]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الفريق الافتراضي">
            <select
              value={defaultTeamId}
              onChange={(e) => setDefaultTeamId(e.target.value)}
              className={inputCls}
            >
              <option value="">بدون</option>
              {config.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_ar}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="سياسة المهل" hint="اتركها فارغة للمطابقة التلقائية">
            <select
              value={slaPolicyId}
              onChange={(e) => setSlaPolicyId(e.target.value)}
              className={inputCls}
            >
              <option value="">مطابقة تلقائية</option>
              {config.policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_ar}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ترتيب العرض">
            <input
              type="number"
              min={0}
              max={999}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          مفعّل
        </label>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn
            loading={save.isPending}
            disabled={!nameAr.trim() || !code.trim()}
            onClick={() => save.mutate()}
          >
            حفظ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------- سياسات المهل */

export function PoliciesPanel({ config }: { config: Config }) {
  const [editing, setEditing] = useState<Config["policies"][number] | null>(null);
  const [open, setOpen] = useState(false);
  const canManage = config.permissions.manageSla;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">
          تُطبَّق أدق سياسة مطابقة (الباقة ثم الأولوية ثم القناة ثم التصنيف) بتوقيت تقويم العمل.
        </p>
        {canManage && (
          <Btn
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> سياسة جديدة
          </Btn>
        )}
      </div>

      {config.policies.length === 0 ? (
        <EmptyState
          title="لا توجد سياسات"
          hint="أضف سياسة مهل واحدة على الأقل ليُحتسب زمن الاستجابة."
        />
      ) : (
        <DataCard>
          <table className="w-full min-w-[860px] text-right">
            <thead>
              <tr>
                <Th>السياسة</Th>
                <Th>التقويم</Th>
                <Th>الباقة</Th>
                <Th>الأولوية</Th>
                <Th>القناة</Th>
                <Th>أول رد</Th>
                <Th>الحل</Th>
                <Th>الإيقاف عند انتظار العميل</Th>
                <Th>الحالة</Th>
                {canManage && <Th>إجراء</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {config.policies.map((policy) => (
                <tr key={policy.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{policy.name_ar}</Td>
                  <Td>
                    {config.calendars.find((c) => c.id === policy.calendar_id)?.name_ar ?? "—"}
                  </Td>
                  <Td>{policy.plan_code ?? "الكل"}</Td>
                  <Td>
                    {policy.priority
                      ? (TICKET_PRIORITY_LABELS_AR[policy.priority as TicketPriority] ??
                        policy.priority)
                      : "الكل"}
                  </Td>
                  <Td>
                    {policy.channel
                      ? (TICKET_CHANNEL_LABELS[policy.channel as TicketChannel] ?? policy.channel)
                      : "الكل"}
                  </Td>
                  <Td className="tabular-nums">{humanMinutes(policy.first_response_minutes)}</Td>
                  <Td className="tabular-nums">{humanMinutes(policy.resolution_minutes)}</Td>
                  <Td>{policy.pause_on_customer_wait ? "نعم" : "لا"}</Td>
                  <Td>
                    <Badge tone={policy.is_active ? "green" : "muted"}>
                      {policy.is_active ? "مفعّلة" : "معطّلة"}
                    </Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(policy);
                          setOpen(true);
                        }}
                      >
                        تعديل
                      </Btn>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <PolicyModal open={open} onClose={() => setOpen(false)} config={config} policy={editing} />
    </div>
  );
}

function PolicyModal({
  open,
  onClose,
  config,
  policy,
}: {
  open: boolean;
  onClose: () => void;
  config: Config;
  policy: Config["policies"][number] | null;
}) {
  const saveFn = useServerFn(saveSupportPolicy);
  const done = useSaved(onClose);
  const [code, setCode] = useState(policy?.code ?? "");
  const [nameAr, setNameAr] = useState(policy?.name_ar ?? "");
  const [calendarId, setCalendarId] = useState(
    policy?.calendar_id ?? config.calendars[0]?.id ?? "",
  );
  const [planCode, setPlanCode] = useState(policy?.plan_code ?? "");
  const [priority, setPriority] = useState(policy?.priority ?? "");
  const [channel, setChannel] = useState(policy?.channel ?? "");
  const [category, setCategory] = useState(policy?.category ?? "");
  const [firstResponse, setFirstResponse] = useState(String(policy?.first_response_minutes ?? 60));
  const [resolution, setResolution] = useState(String(policy?.resolution_minutes ?? 480));
  const [pause, setPause] = useState(policy?.pause_on_customer_wait ?? true);
  const [warningPercent, setWarningPercent] = useState(String(policy?.warning_percent ?? 75));
  const [criticalPercent, setCriticalPercent] = useState(String(policy?.critical_percent ?? 90));
  const [isActive, setIsActive] = useState(policy?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          ...(policy ? { id: policy.id } : {}),
          code: code.trim(),
          nameAr: nameAr.trim(),
          calendarId,
          planCode: planCode ? planCode.trim() : null,
          priority: priority ? (priority as TicketPriority) : null,
          channel: channel ? (channel as TicketChannel) : null,
          category: category ? category : null,
          firstResponseMinutes: Number(firstResponse),
          resolutionMinutes: Number(resolution),
          pauseOnCustomerWait: pause,
          warningPercent: Number(warningPercent),
          criticalPercent: Number(criticalPercent),
          isActive,
        },
      }),
    onSuccess: done,
    onError: (error: Error) => toast.error("تعذّر حفظ السياسة", { description: error.message }),
  });

  const valid =
    nameAr.trim() &&
    code.trim() &&
    calendarId &&
    Number(firstResponse) >= 5 &&
    Number(resolution) >= 15;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={policy ? `تعديل ${policy.name_ar}` : "سياسة مهل جديدة"}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم السياسة" required>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </FormField>
          <FormField label="الرمز" required hint="حروف إنجليزية صغيرة وأرقام">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </FormField>
          <FormField label="تقويم العمل" required>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className={inputCls}
            >
              {config.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar} ({c.timezone})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="رمز الباقة" hint="اتركه فارغاً لتطبيقها على كل الباقات">
            <input
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </FormField>
          <FormField label="الأولوية">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={inputCls}
            >
              <option value="">كل الأولويات</option>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS_AR[p]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="القناة">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={inputCls}
            >
              <option value="">كل القنوات</option>
              {TICKET_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="التصنيف">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              <option value="">كل التصنيفات</option>
              {config.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="مهلة أول رد (دقيقة)" required>
            <input
              type="number"
              min={5}
              value={firstResponse}
              onChange={(e) => setFirstResponse(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="مهلة الحل (دقيقة)" required>
            <input
              type="number"
              min={15}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="حد التحذير (%)">
            <input
              type="number"
              min={10}
              max={99}
              value={warningPercent}
              onChange={(e) => setWarningPercent(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="حد الخطر (%)">
            <input
              type="number"
              min={20}
              max={100}
              value={criticalPercent}
              onChange={(e) => setCriticalPercent(e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} />
            إيقاف العدّاد أثناء انتظار العميل
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            مفعّلة
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            حفظ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- قواعد التصعيد */

export function RulesPanel({ config }: { config: Config }) {
  const [editing, setEditing] = useState<Config["rules"][number] | null>(null);
  const [open, setOpen] = useState(false);
  const canManage = config.permissions.manageSla;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">
          تُقيَّم القواعد بالترتيب، وأول قاعدة مطابقة ترفع مستوى التصعيد وتُخطر المسؤول.
        </p>
        {canManage && (
          <Btn
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> قاعدة جديدة
          </Btn>
        )}
      </div>

      {config.rules.length === 0 ? (
        <EmptyState
          title="لا توجد قواعد تصعيد"
          hint="أضف قاعدة لتصعيد التذاكر المتأخرة تلقائياً."
        />
      ) : (
        <DataCard>
          <table className="w-full min-w-[820px] text-right">
            <thead>
              <tr>
                <Th>القاعدة</Th>
                <Th>المُحفّز</Th>
                <Th>النطاق</Th>
                <Th>المستوى</Th>
                <Th>الجهة المستهدفة</Th>
                <Th>إخطار المدير</Th>
                <Th>الحالة</Th>
                {canManage && <Th>إجراء</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {config.rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{rule.name_ar}</Td>
                  <Td>{TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}</Td>
                  <Td className="text-[12.5px]">
                    {[
                      rule.priority
                        ? TICKET_PRIORITY_LABELS_AR[rule.priority as TicketPriority]
                        : null,
                      rule.channel ? TICKET_CHANNEL_LABELS[rule.channel as TicketChannel] : null,
                      rule.category
                        ? (config.categories.find((c) => c.code === rule.category)?.name_ar ??
                          rule.category)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "الكل"}
                  </Td>
                  <Td className="tabular-nums">
                    {rule.from_level} ← {rule.to_level}
                  </Td>
                  <Td className="text-[12.5px]">
                    {config.teams.find((t) => t.id === rule.target_team_id)?.name_ar ??
                      config.staff.find((s) => s.user_id === rule.target_user_id)?.full_name ??
                      "—"}
                  </Td>
                  <Td>{rule.notify_manager ? "نعم" : "لا"}</Td>
                  <Td>
                    <Badge tone={rule.is_active ? "green" : "muted"}>
                      {rule.is_active ? "مفعّلة" : "معطّلة"}
                    </Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(rule);
                          setOpen(true);
                        }}
                      >
                        تعديل
                      </Btn>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <RuleModal open={open} onClose={() => setOpen(false)} config={config} rule={editing} />
    </div>
  );
}

function RuleModal({
  open,
  onClose,
  config,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  config: Config;
  rule: Config["rules"][number] | null;
}) {
  const saveFn = useServerFn(saveSupportRule);
  const done = useSaved(onClose);
  const [nameAr, setNameAr] = useState(rule?.name_ar ?? "");
  const [triggerType, setTriggerType] = useState(rule?.trigger_type ?? "sla_breach");
  const [priority, setPriority] = useState(rule?.priority ?? "");
  const [channel, setChannel] = useState(rule?.channel ?? "");
  const [category, setCategory] = useState(rule?.category ?? "");
  const [fromLevel, setFromLevel] = useState(String(rule?.from_level ?? 0));
  const [toLevel, setToLevel] = useState(String(rule?.to_level ?? 1));
  const [targetTeamId, setTargetTeamId] = useState(rule?.target_team_id ?? "");
  const [targetUserId, setTargetUserId] = useState(rule?.target_user_id ?? "");
  const [notifyManager, setNotifyManager] = useState(rule?.notify_manager ?? true);
  const [sortOrder, setSortOrder] = useState(String(rule?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          ...(rule ? { id: rule.id } : {}),
          nameAr: nameAr.trim(),
          triggerType: triggerType as
            | "sla_breach"
            | "sla_warning"
            | "manual"
            | "no_response"
            | "priority",
          priority: priority ? (priority as TicketPriority) : null,
          channel: channel ? (channel as TicketChannel) : null,
          category: category ? category : null,
          fromLevel: Number(fromLevel) || 0,
          toLevel: Number(toLevel) || 1,
          targetTeamId: targetTeamId ? targetTeamId : null,
          targetUserId: targetUserId ? targetUserId : null,
          notifyManager,
          sortOrder: Number(sortOrder) || 0,
          isActive,
        },
      }),
    onSuccess: done,
    onError: (error: Error) => toast.error("تعذّر حفظ القاعدة", { description: error.message }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? `تعديل ${rule.name_ar}` : "قاعدة تصعيد جديدة"}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم القاعدة" required>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </FormField>
          <FormField label="المُحفّز" required>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className={inputCls}
            >
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الأولوية">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={inputCls}
            >
              <option value="">كل الأولويات</option>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS_AR[p]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="القناة">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={inputCls}
            >
              <option value="">كل القنوات</option>
              {TICKET_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="التصنيف">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              <option value="">كل التصنيفات</option>
              {config.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ترتيب التقييم">
            <input
              type="number"
              min={0}
              max={999}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="من مستوى">
            <input
              type="number"
              min={0}
              max={9}
              value={fromLevel}
              onChange={(e) => setFromLevel(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="إلى مستوى">
            <input
              type="number"
              min={1}
              max={10}
              value={toLevel}
              onChange={(e) => setToLevel(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="الفريق المستهدف">
            <select
              value={targetTeamId}
              onChange={(e) => setTargetTeamId(e.target.value)}
              className={inputCls}
            >
              <option value="">بدون</option>
              {config.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_ar}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الموظف المستهدف">
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className={inputCls}
            >
              <option value="">بدون</option>
              {config.staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={notifyManager}
              onChange={(e) => setNotifyManager(e.target.checked)}
            />
            إخطار مدير الفريق
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            مفعّلة
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn loading={save.isPending} disabled={!nameAr.trim()} onClick={() => save.mutate()}>
            حفظ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
