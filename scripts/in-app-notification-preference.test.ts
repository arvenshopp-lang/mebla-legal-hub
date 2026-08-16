import { describe, expect, it } from "vitest";
import { isInAppNotificationsEnabled } from "../src/lib/notifications/in-app-preference";

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
