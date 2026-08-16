import { describe, expect, it } from "vitest";
import {
  isInAppNotificationsEnabled,
  notificationsQueryKey,
  notificationsRealtimeChannelName,
  notificationsRealtimeFilter,
  shouldQueryNotifications,
} from "../src/lib/notifications/in-app-preference";

describe("in-app notification preference", () => {
  it("افتراضياً مفعّل عند غياب صف التفضيلات", () => {
    expect(isInAppNotificationsEnabled(null)).toBe(true);
    expect(isInAppNotificationsEnabled(undefined)).toBe(true);
  });

  it("يُوقف التنبيهات داخل التطبيق عند false", () => {
    expect(isInAppNotificationsEnabled({ in_app_enabled: false })).toBe(false);
  });

  it("يبقى مفعّلاً عند true أو null داخل الصف", () => {
    expect(isInAppNotificationsEnabled({ in_app_enabled: true })).toBe(true);
    expect(isInAppNotificationsEnabled({ in_app_enabled: null })).toBe(true);
  });
});

describe("عزل التنبيهات بالمكتب النشط", () => {
  const user = "user-1";
  const orgA = "org-a";
  const orgB = "org-b";

  it("مفتاح الاستعلام يتغير بتغير المكتب النشط", () => {
    expect(notificationsQueryKey(user, orgA)).toEqual(["notifications", user, orgA]);
    expect(notificationsQueryKey(user, orgB)).not.toEqual(notificationsQueryKey(user, orgA));
  });

  it("مرشّح Realtime وقناته مرتبطان بالمكتب النشط", () => {
    expect(notificationsRealtimeFilter(orgA)).toBe(`organization_id=eq.${orgA}`);
    expect(notificationsRealtimeFilter(orgB)).not.toBe(notificationsRealtimeFilter(orgA));
    expect(notificationsRealtimeChannelName(user, orgA)).toBe(`notifications-${user}-${orgA}`);
    expect(notificationsRealtimeChannelName(user, orgB)).not.toBe(
      notificationsRealtimeChannelName(user, orgA),
    );
  });

  it("لا يعمل الاستعلام دون مستخدم أو مكتب نشط أو قبل حسم التفضيل", () => {
    const base = { userId: user, activeOrgId: orgA, preferenceLoading: false, inAppEnabled: true };
    expect(shouldQueryNotifications(base)).toBe(true);
    expect(shouldQueryNotifications({ ...base, activeOrgId: null })).toBe(false);
    expect(shouldQueryNotifications({ ...base, userId: undefined })).toBe(false);
    expect(shouldQueryNotifications({ ...base, preferenceLoading: true })).toBe(false);
    expect(shouldQueryNotifications({ ...base, inAppEnabled: false })).toBe(false);
  });
});
