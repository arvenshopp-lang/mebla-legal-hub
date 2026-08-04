/**
 * فرض صلاحيات بيانات أطراف القضية — خادم فقط.
 * القراءة والكتابة منفصلتان تماماً، والتحقق يتم عبر دالة قاعدة البيانات
 * `private.has_case_party_permission` بهوية المستخدم الموقّع (نفس منطق RLS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const CASE_PARTY_PERMISSIONS = [
  "case_parties.read",
  "case_parties.create",
  "case_parties.update",
  "case_parties.delete",
] as const;

export type CasePartyPermission = (typeof CASE_PARTY_PERMISSIONS)[number];

const DENIED_MESSAGE: Record<CasePartyPermission, string> = {
  "case_parties.read": "لا تملك صلاحية الاطلاع على بيانات أطراف القضية.",
  "case_parties.create": "لا تملك صلاحية إضافة أطراف للقضية.",
  "case_parties.update": "لا تملك صلاحية تعديل بيانات أطراف القضية.",
  "case_parties.delete": "لا تملك صلاحية حذف أطراف القضية.",
};

/** يُرجع خريطة الصلاحيات الفعّالة للمستخدم الحالي في المكتب المحدد. */
export async function casePartyPermissions(
  supabase: Client,
  organizationId: string,
): Promise<Record<CasePartyPermission, boolean>> {
  const { data, error } = await supabase.rpc("my_case_party_permissions", {
    _organization_id: organizationId,
  });
  if (error) throw new Error("تعذّر التحقق من صلاحيات أطراف القضية.");
  const map = Object.fromEntries(CASE_PARTY_PERMISSIONS.map((p) => [p, false])) as Record<
    CasePartyPermission,
    boolean
  >;
  for (const row of (data ?? []) as { permission: CasePartyPermission; allowed: boolean }[]) {
    if (row.permission in map) map[row.permission] = row.allowed === true;
  }
  return map;
}

/** يرفض العملية فوراً إذا لم تكن الصلاحية المحددة سارية. */
export async function requireCasePartyPermission(
  supabase: Client,
  organizationId: string,
  permission: CasePartyPermission,
): Promise<void> {
  const map = await casePartyPermissions(supabase, organizationId);
  if (!map[permission]) throw new Error(DENIED_MESSAGE[permission]);
}
