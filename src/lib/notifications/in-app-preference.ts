/**
 * تفضيل التنبيهات داخل التطبيق: يُحسب من صف تفضيلات المستخدم للمكتب النشط.
 * غياب الصف يعني التفعيل الافتراضي (سلوك المنصة الحالي)، ولا يؤثر هذا على قناة البريد.
 */
export type InAppPreferenceRow = { in_app_enabled: boolean | null } | null | undefined;

export function isInAppNotificationsEnabled(row: InAppPreferenceRow): boolean {
  if (!row) return true;
  return row.in_app_enabled !== false;
}

/**
 * نطاق التنبيهات داخل التطبيق: المستخدم الحالي + المكتب النشط فقط.
 * تُستخدم هذه الدوال في مفتاح الاستعلام وقناة Realtime لضمان عزل المكاتب.
 */
export function notificationsQueryKey(
  userId: string | null | undefined,
  activeOrgId: string | null | undefined,
): readonly [string, string, string] {
  return ["notifications", userId ?? "anon", activeOrgId ?? "no-org"] as const;
}

export function notificationsRealtimeChannelName(userId: string, activeOrgId: string): string {
  return `notifications-${userId}-${activeOrgId}`;
}

export function notificationsRealtimeFilter(activeOrgId: string): string {
  return `organization_id=eq.${activeOrgId}`;
}

export function shouldQueryNotifications(args: {
  userId: string | null | undefined;
  activeOrgId: string | null | undefined;
  preferenceLoading: boolean;
  inAppEnabled: boolean;
}): boolean {
  return !!args.userId && !!args.activeOrgId && !args.preferenceLoading && args.inAppEnabled;
}
