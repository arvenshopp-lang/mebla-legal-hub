/**
 * منطق دورة حياة حساب المستخدم عند الحذف من لوحة إدارة المنصة.
 *
 * قاعدة الملكية: ملكية المكتب في مِهلة تُحدَّد بعضوية بدور owner داخل
 * organization_members (وهي أساس RBAC وسياسات RLS)، ومرجع organizations.created_by
 * مرجع مسؤولية دائم بقيد ON DELETE RESTRICT. لذلك لا يجوز حذف حساب يملك مكتباً
 * قبل نقل الملكية إلى عضو نشط آخر، وإلا بقي المكتب بلا مالك (تعطّل الإدارة
 * والدعوات وإدارة الاشتراك).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export type OwnershipBlocker = {
  organizationId: string;
  organizationName: string;
  reason: "sole_owner" | "creator_reference";
  eligibleMembers: { userId: string; fullName: string; role: string }[];
};

/** المكاتب التي يمنع ارتباط المستخدم بها حذفه قبل نقل الملكية. */
export async function ownershipBlockers(db: Db, userId: string): Promise<OwnershipBlocker[]> {
  const [{ data: owned }, { data: created }] = await Promise.all([
    db
      .from("organization_members")
      .select("organization_id, organizations(name)")
      .eq("user_id", userId)
      .eq("role", "owner"),
    db.from("organizations").select("id, name").eq("created_by", userId),
  ]);

  const orgs = new Map<string, { name: string; owner: boolean }>();
  for (const row of owned ?? []) {
    const r = row as unknown as { organization_id: string; organizations: { name: string } | null };
    orgs.set(r.organization_id, { name: r.organizations?.name ?? "—", owner: true });
  }
  for (const row of created ?? []) {
    const r = row as { id: string; name: string };
    if (!orgs.has(r.id)) orgs.set(r.id, { name: r.name, owner: false });
  }
  if (orgs.size === 0) return [];

  const ids = [...orgs.keys()];
  const { data: members } = await db
    .from("organization_members")
    .select("organization_id, user_id, role, status, profiles(full_name, is_active)")
    .in("organization_id", ids);

  const rows = (members ?? []) as unknown as {
    organization_id: string;
    user_id: string;
    role: string;
    status: string;
    profiles: { full_name: string; is_active: boolean } | null;
  }[];

  const blockers: OwnershipBlocker[] = [];
  for (const [orgId, meta] of orgs) {
    const orgMembers = rows.filter((m) => m.organization_id === orgId);
    const otherOwners = orgMembers.filter(
      (m) => m.role === "owner" && m.user_id !== userId && m.status === "active",
    );
    const eligible = orgMembers
      .filter(
        (m) =>
          m.user_id !== userId &&
          m.status === "active" &&
          m.profiles?.is_active !== false &&
          ["owner", "admin", "lawyer"].includes(m.role),
      )
      .map((m) => ({
        userId: m.user_id,
        fullName: m.profiles?.full_name ?? "—",
        role: m.role,
      }));

    if (meta.owner && otherOwners.length === 0) {
      blockers.push({
        organizationId: orgId,
        organizationName: meta.name,
        reason: "sole_owner",
        eligibleMembers: eligible,
      });
    } else if (!meta.owner) {
      blockers.push({
        organizationId: orgId,
        organizationName: meta.name,
        reason: "creator_reference",
        eligibleMembers: eligible,
      });
    }
  }
  return blockers;
}

/**
 * جرد المراجع قبل الحذف. يُخزَّن في سجل تدقيق المنصة (before_data) لأن حقول
 * التأليف التاريخي في جداول الأعمال تُفرَّغ بقيد SET NULL ولا تحفظ الهوية بنفسها.
 */
export async function referenceInventory(db: Db, userId: string) {
  const targets: { table: keyof Database["public"]["Tables"]; column: string; kind: string }[] = [
    { table: "cases", column: "assigned_lawyer_id", kind: "operational" },
    { table: "cases", column: "created_by", kind: "historical" },
    { table: "case_updates", column: "created_by", kind: "historical" },
    { table: "clients", column: "created_by", kind: "historical" },
    { table: "hearings", column: "created_by", kind: "historical" },
    { table: "deadlines", column: "created_by", kind: "historical" },
    { table: "deadlines", column: "responsible_user_id", kind: "operational" },
    { table: "tasks", column: "assigned_to", kind: "operational" },
    { table: "tasks", column: "created_by", kind: "historical" },
    { table: "documents", column: "uploaded_by", kind: "historical" },
    { table: "document_requests", column: "created_by", kind: "historical" },
    { table: "document_access_tokens", column: "created_by", kind: "historical" },
    { table: "activity_logs", column: "user_id", kind: "audit" },
    { table: "print_audit_logs", column: "user_id", kind: "audit" },
    { table: "document_access_logs", column: "user_id", kind: "audit" },
  ];

  const entries = await Promise.all(
    targets.map(async (t) => {
      const { count } = await db
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .eq(t.column, userId);
      return { ref: `${t.table}.${t.column}`, kind: t.kind, count: count ?? 0 };
    }),
  );
  return entries.filter((e) => e.count > 0);
}

/** نقل ملكية مكتب إلى عضو نشط مؤهّل، مع تحديث مرجع المسؤولية. */
export async function transferOwnership(
  db: Db,
  input: { organizationId: string; fromUserId: string; toUserId: string },
) {
  const { data: target } = await db
    .from("organization_members")
    .select("user_id, role, status")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.toUserId)
    .maybeSingle();
  if (!target || target.status !== "active")
    throw new Error("المالك الجديد يجب أن يكون عضواً نشطاً في المكتب.");

  const { error: upErr } = await db
    .from("organization_members")
    .update({ role: "owner" })
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.toUserId);
  if (upErr) throw new Error("تعذّر ترقية العضو إلى مالك المكتب.");

  await db
    .from("organization_members")
    .update({ role: "admin" })
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.fromUserId)
    .eq("role", "owner");

  const { error: orgErr } = await db
    .from("organizations")
    .update({ created_by: input.toUserId })
    .eq("id", input.organizationId)
    .eq("created_by", input.fromUserId);
  if (orgErr) throw new Error("تعذّر تحديث مرجع مسؤولية المكتب.");

  return { previousRole: target.role };
}
