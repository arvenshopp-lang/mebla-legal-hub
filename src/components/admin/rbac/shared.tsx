/**
 * أنواع ومساعدات مشتركة لواجهات مركز الأدوار والصلاحيات.
 * كل التواريخ تُعرض وتُدخل بتوقيت الرياض (UTC+3) وتُخزّن UTC.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { ADMIN_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/admin-permissions";
import { Badge, inputCls } from "@/lib/list-utils";
import { RIYADH_OFFSET_MINUTES, WEEKDAY_LABELS } from "@/lib/rbac/rbac.shared";
import { cn } from "@/lib/utils";

export type RbacRole = {
  id: string;
  code: string;
  name_ar: string;
  description: string | null;
  permissions: string[] | null;
  is_system: boolean;
  is_active: boolean;
};

export type RbacDepartment = {
  id: string;
  code: string;
  name_ar: string;
  description: string | null;
  parent_department_id: string | null;
  manager_user_id: string | null;
  default_role_id: string | null;
  is_active: boolean;
};

export type RbacStaffRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  role: "super_admin" | "staff";
  status: "active" | "suspended";
  permissions: string[] | null;
  role_id: string | null;
  department_id: string | null;
  manager_user_id: string | null;
};

export type RbacGrant = {
  id: string;
  grantee_user_id: string;
  permission: string;
  source: "temporary" | "delegation";
  granted_by: string;
  granted_by_email: string | null;
  reason: string;
  reference: string | null;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
};

export type RbacApproval = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown> | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired" | "executed";
  requested_by: string;
  requested_by_email: string | null;
  requested_at: string;
  expires_at: string;
  decided_by: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  executed_at: string | null;
};

export type RbacSession = {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  first_seen_at: string;
  last_seen_at: string;
  requests_count: number;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export type RbacRestriction = {
  user_id: string;
  ip_enforced: boolean;
  allowed_ips: string[];
  denied_ips: string[];
  device_enforced: boolean;
  trusted_devices: string[];
  blocked_devices: string[];
  time_enforced: boolean;
  work_start_minute: number;
  work_end_minute: number;
  allowed_weekdays: number[];
  reason: string | null;
  effective_from: string | null;
  effective_to: string | null;
};

export type RbacImpersonation = {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  target_user_id: string;
  target_email: string | null;
  reason: string;
  status: "pending" | "active" | "ended" | "rejected" | "expired";
  approval_request_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  expires_at: string;
  ended_at: string | null;
  end_reason: string | null;
  read_only: boolean;
  created_at: string;
};

export type RbacAuditRow = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  ip: string | null;
  device: string | null;
  browser: string | null;
};

export type RbacOverview = {
  me: {
    userId: string;
    email: string;
    role: "super_admin" | "staff";
    basePermissions: string[];
    effectivePermissions: string[];
    liveGrants: { permission: string; source: string; expires_at: string; granted_by: string }[];
    impersonation: {
      id: string;
      target_user_id: string;
      target_email: string | null;
      expires_at: string;
    } | null;
    facts: { ip: string; device: string | null; browser: string | null; fingerprint: string };
  };
  now: string;
  roles: RbacRole[];
  departments: RbacDepartment[];
  staff: RbacStaffRow[];
  grants: RbacGrant[];
  approvals: RbacApproval[];
  sessions: RbacSession[];
  restrictions: RbacRestriction[];
  impersonations: RbacImpersonation[];
  audit: RbacAuditRow[];
};

/* ------------------------------ التواريخ ------------------------------ */

const AR_DATE = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: "Asia/Riyadh",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatRiyadh(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return AR_DATE.format(d);
}

/** قيمة حقل datetime-local تُقرأ كتوقيت رياض وتُحوَّل إلى UTC. */
export function riyadhLocalToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m as unknown as [string, string, string, string, string, string];
  const ms =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) -
    RIYADH_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString();
}

export function isoToRiyadhLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const shifted = new Date(d.getTime() + RIYADH_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function remainingLabel(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return "انتهت";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعة و${mins % 60} دقيقة`;
  const days = Math.floor(hours / 24);
  return `${days} يوم و${hours % 24} ساعة`;
}

export function grantState(
  g: RbacGrant,
  now = Date.now(),
): { label: string; tone: "green" | "red" | "muted" | "gold" } {
  if (g.revoked_at) return { label: "مسحوب", tone: "red" };
  if (new Date(g.expires_at).getTime() <= now) return { label: "منتهي", tone: "muted" };
  if (new Date(g.starts_at).getTime() > now) return { label: "لم يبدأ بعد", tone: "gold" };
  return { label: "سارٍ", tone: "green" };
}

export const WEEKDAYS = WEEKDAY_LABELS;

/* ------------------------------- مكونات ------------------------------- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-label mb-1.5 block text-foreground">{label}</span>
      {children}
      {hint && <span className="text-caption mt-1 block">{hint}</span>}
    </label>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-text-muted">{label}</p>
      <p className="mt-0.5 break-words text-[13px] font-medium text-foreground">{children}</p>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-m)] border border-border bg-surface p-4">
      <p className="text-[11px] font-semibold text-text-muted">{label}</p>
      <p className="mt-1 text-h4 tabular-nums">{value}</p>
      {hint && <p className="text-caption mt-1">{hint}</p>}
    </div>
  );
}

export function PermissionBadges({
  permissions,
  max = 6,
}: {
  permissions: string[];
  max?: number;
}) {
  const shown = permissions.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((p) => (
        <span
          key={p}
          className="rounded-[var(--radius-s)] bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {p}
        </span>
      ))}
      {permissions.length > max && <Badge tone="muted">+{permissions.length - max}</Badge>}
      {permissions.length === 0 && <span className="text-caption">لا توجد صلاحيات</span>}
    </div>
  );
}

/**
 * منتقي الصلاحيات: تجميع حسب المورد، بحث، تحديد الكل ضمن مورد،
 * وتعطيل أي صلاحية لا يملكها المستخدم الحالي مع بيان السبب.
 */
export function PermissionPicker({
  selected,
  onChange,
  holderPermissions,
  isSuperAdmin,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  holderPermissions: string[];
  isSuperAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const allowed = useMemo(() => new Set(holderPermissions), [holderPermissions]);
  const may = (id: string) => isSuperAdmin || allowed.has(id);

  const groups = useMemo(() => {
    const q = query.trim();
    return PERMISSION_GROUPS.map((group) => ({
      group,
      items: ADMIN_PERMISSIONS.filter(
        (p) =>
          p.group === group &&
          (!q || p.label.includes(q) || p.id.includes(q) || p.description.includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);

  const toggleGroup = (group: string, checked: boolean) => {
    const ids = ADMIN_PERMISSIONS.filter((p) => p.group === group && may(p.id)).map(
      (p) => p.id as string,
    );
    const next = new Set(selected);
    for (const id of ids) checked ? next.add(id) : next.delete(id);
    onChange(Array.from(next));
  };

  return (
    <div>
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في الصلاحيات (resource.action)…"
          className={cn(inputCls, "pr-10")}
        />
      </div>

      {!isSuperAdmin && (
        <p className="mb-3 rounded-[var(--radius-m)] bg-warning-soft px-3 py-2 text-[12px] text-warning">
          الصلاحيات المعطّلة أدناه لا تملكها أنت، ولا يمكن منح صلاحية أعلى من صلاحياتك.
        </p>
      )}

      <div className="max-h-[46vh] space-y-4 overflow-y-auto pe-1">
        {groups.length === 0 && <p className="text-caption">لا نتائج مطابقة.</p>}
        {groups.map(({ group, items }) => {
          const selectable = items.filter((p) => may(p.id));
          const allOn = selectable.length > 0 && selectable.every((p) => selected.includes(p.id));
          return (
            <fieldset key={group} className="rounded-[var(--radius-m)] border border-border p-3">
              <legend className="flex items-center gap-2 px-1 text-[12px] font-semibold">
                {group}
                {selectable.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group, !allOn)}
                    className="text-[11px] font-medium text-primary underline underline-offset-2"
                  >
                    {allOn ? "إلغاء تحديد الكل" : "تحديد الكل"}
                  </button>
                )}
              </legend>
              <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                {items.map((p) => {
                  const disabled = !may(p.id);
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-[var(--radius-s)] p-2 hover:bg-surface-muted",
                          disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
                        )}
                        title={disabled ? "لا تملك هذه الصلاحية فلا يمكنك منحها" : p.description}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                          checked={selected.includes(p.id)}
                          disabled={disabled}
                          onChange={() => toggle(p.id)}
                        />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">{p.label}</span>
                          <span className="block font-mono text-[11px] text-text-muted">
                            {p.id}
                          </span>
                          {disabled && (
                            <span className="block text-[11px] text-danger">غير متاحة لك</span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
      <p className="text-caption mt-2">المحدد: {selected.length} صلاحية</p>
    </div>
  );
}

export function StaffSelect({
  value,
  onChange,
  staff,
  placeholder = "اختر موظفاً",
  exclude,
}: {
  value: string;
  onChange: (v: string) => void;
  staff: RbacStaffRow[];
  placeholder?: string;
  exclude?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{placeholder}</option>
      {staff
        .filter((s) => s.user_id !== exclude)
        .map((s) => (
          <option key={s.user_id} value={s.user_id}>
            {s.full_name} — {s.email}
          </option>
        ))}
    </select>
  );
}

export function staffName(staff: RbacStaffRow[], userId: string | null | undefined): string {
  if (!userId) return "—";
  return staff.find((s) => s.user_id === userId)?.full_name ?? userId.slice(0, 8);
}
