/**
 * فحص هادف (بلا شبكة وبلا قاعدة): إعدادات التنبيهات لا تعرض خيار "قضايا خاملة"
 * غير المُنفّذ، مع بقاء بقية الخيارات والحقل الداخلي inactive_cases كما هو.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");

describe("notification settings visibility", () => {
  it("hides the undefined inactive-cases preference", () => {
    expect(src).not.toContain("قضايا خاملة");
    expect(src).not.toContain('Tog k="inactive_cases"');
  });

  it("keeps overdue task control visible", () => {
    expect(src).toContain('Tog k="task_overdue" l="مهام متأخرة"');
  });

  it("keeps hearing controls visible", () => {
    for (const k of ["hearing_7_days", "hearing_3_days", "hearing_1_day", "hearing_same_day"]) {
      expect(src).toContain(`Tog k="${k}"`);
    }
  });

  it("keeps deadline controls visible", () => {
    for (const k of ["deadline_7_days", "deadline_3_days", "deadline_1_day", "deadline_same_day"]) {
      expect(src).toContain(`Tog k="${k}"`);
    }
  });

  it("keeps channel controls visible", () => {
    expect(src).toContain('Tog k="email_enabled"');
    expect(src).toContain('Tog k="in_app_enabled"');
  });

  it("preserves inactive_cases internally and saves the loaded row values", () => {
    expect(src).toContain("inactive_cases: true");
    // النموذج يُهيّأ من صف القاعدة نفسه، والحفظ ينشر ...form فلا يُصفَّر أي حقل مخزّن.
    expect(src).toContain("setForm(\n      data ?? {");
    expect(src).toContain("...form,");
  });
});
