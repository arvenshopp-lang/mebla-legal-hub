/** ملخص حالة الصلاحيات: أرقام تشغيلية وصلاحياتك الفعالة. */
import { SectionCard } from "@/lib/list-utils";
import { KeyValue, PermissionBadges, StatTile, formatRiyadh, type RbacOverview } from "./shared";

export function OverviewPanel({ data }: { data: RbacOverview }) {
  const now = new Date(data.now).getTime();
  const liveGrants = data.grants.filter(
    (g) =>
      !g.revoked_at &&
      new Date(g.expires_at).getTime() > now &&
      new Date(g.starts_at).getTime() <= now,
  ).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="الأدوار"
          value={data.roles.length}
          hint={`${data.roles.filter((r) => r.is_active).length} مفعّل`}
        />
        <StatTile label="الأقسام" value={data.departments.length} />
        <StatTile
          label="الموظفون"
          value={data.staff.length}
          hint={`${data.staff.filter((s) => s.status === "active").length} نشط`}
        />
        <StatTile label="منح سارية" value={liveGrants} />
        <StatTile
          label="طلبات اعتماد معلّقة"
          value={data.approvals.filter((a) => a.status === "pending").length}
        />
        <StatTile label="جلسات نشطة" value={data.sessions.filter((s) => !s.revoked_at).length} />
        <StatTile label="موظفون بقيود" value={data.restrictions.length} />
        <StatTile
          label="جلسات انتحال نشطة"
          value={data.impersonations.filter((i) => i.status === "active").length}
        />
      </div>

      <SectionCard
        title="حسابك"
        description="الصلاحية الفعالة = صلاحيات الدور + الصلاحيات الفردية + المنح السارية."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <KeyValue label="البريد">{data.me.email}</KeyValue>
          <KeyValue label="الصفة">
            {data.me.role === "super_admin" ? "مالك المنصة" : "موظف منصة"}
          </KeyValue>
          <KeyValue label="صلاحيات أساسية">{data.me.basePermissions.length}</KeyValue>
          <KeyValue label="صلاحيات فعالة">{data.me.effectivePermissions.length}</KeyValue>
        </div>
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-text-muted">الصلاحيات الفعالة</p>
          <div className="mt-2">
            <PermissionBadges permissions={data.me.effectivePermissions} max={200} />
          </div>
        </div>
        <p className="text-caption mt-4">آخر تحديث للبيانات: {formatRiyadh(data.now)}</p>
      </SectionCard>
    </div>
  );
}
