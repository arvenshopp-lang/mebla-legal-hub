/**
 * تفضيل التنبيهات داخل التطبيق: يُحسب من صف تفضيلات المستخدم للمكتب النشط.
 * غياب الصف يعني التفعيل الافتراضي (سلوك المنصة الحالي)، ولا يؤثر هذا على قناة البريد.
 */
export type InAppPreferenceRow = { in_app_enabled: boolean | null } | null | undefined;

export function isInAppNotificationsEnabled(row: InAppPreferenceRow): boolean {
  if (!row) return true;
  return row.in_app_enabled !== false;
}
