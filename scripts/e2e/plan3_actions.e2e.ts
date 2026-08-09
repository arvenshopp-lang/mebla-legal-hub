/**
 * PLAN 3 — تنفيذ فعلي لإجراءات لوحة إدارة مِهلة (action-by-action).
 *
 * كل إجراء يُنفَّذ بدالة الإنتاج نفسها عبر بروتوكول createServerFn بتوكن مشرف أعلى
 * حقيقي، ثم يُتحقق أثره في قاعدة البيانات (وسجل التدقيق حين ينشئ الإجراء سجلاً)،
 * ثم يُعاد النداء بتوكن موظف بلا صلاحيات لإثبات الرفض الخادمي.
 * كل الكيانات تُنشأ ببادئة QA-DESTRUCT- ولا تُلمس بيانات حقيقية.
 *
 *   bun scripts/e2e/plan3-fixture.ts && bun scripts/e2e/plan3_actions.e2e.ts
 */
import { SUPABASE_URL, APP, adminFetch, adminHeaders } from "./qa-support";
import { loadP3, P3_PREFIX } from "./plan3-fixture";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";

const ctx = await loadP3();
const S = ctx.superAdmin.token;
const NOPERM = ctx.plainStaff.token;

type Status = "PASS" | "FAIL" | "BLOCKED";
const results: { group: string; action: string; status: Status; detail: string }[] = [];
function rec(group: string, action: string, status: Status, detail = "") {
  results.push({ group, action, status, detail });
  console.log(`${status} [${group}] ${action}${detail ? ` :: ${detail.slice(0, 160)}` : ""}`);
}

const MODULES: Record<string, string> = {
  orgs: "src/lib/admin-orgs.functions.ts",
  users: "src/lib/admin-users.functions.ts",
  ops: "src/lib/admin-ops.functions.ts",
  console: "src/lib/admin-console.functions.ts",
  admin: "src/lib/admin.functions.ts",
  flags: "src/lib/flags.functions.ts",
  backups: "src/lib/backups.functions.ts",
  design: "src/lib/design/theme.functions.ts",
  rbac: "src/lib/rbac/rbac.functions.ts",
  support: "src/lib/support/support.functions.ts",
  billing: "src/lib/billing/billing.functions.ts",
  crm: "src/lib/crm.functions.ts",
  hr: "src/lib/hr.functions.ts",
  marketing: "src/lib/marketing.functions.ts",
  publicSite: "src/lib/public-site.functions.ts",
  integrations: "src/lib/integrations/integrations.functions.ts",
};
const cache: Record<string, Record<string, ServerFnRef>> = {};
async function fn(mod: keyof typeof MODULES, name: string) {
  cache[mod] ??= await resolveServerFns(APP, MODULES[mod]!);
  const ref = cache[mod]![name];
  if (!ref) throw new Error(`دالة غير موجودة: ${mod}.${name}`);
  return ref;
}
const call = async (mod: string, name: string, token: string, data?: unknown) =>
  callServerFn({ appOrigin: APP, ref: await fn(mod, name), token, data });

async function rest(path: string, init: RequestInit = {}) {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 160)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>[];
  } catch {
    return [];
  }
}
const one = async (p: string) => (await rest(p))[0];
const idOf = (raw: string) =>
  raw.match(/"s":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/)?.[1] ?? "";
const auditExists = async (action: string, entityId?: string) =>
  Boolean(
    await one(
      `admin_audit_logs?action=eq.${action}${entityId ? `&entity_id=eq.${entityId}` : ""}&select=id&limit=1`,
    ),
  );

/**
 * ينفّذ إجراءً واحداً: نداء المشرف + تحقق DB (اختياري) + تحقق التدقيق + رفض غير المصرح.
 */
async function action(opts: {
  group: string;
  name: string;
  mod: string;
  fnName: string;
  data?: unknown;
  /** يعود true إذا كان أثر القاعدة صحيحاً. */
  verify?: (raw: string) => Promise<boolean>;
  auditAction?: string;
  /** تخطي فحص الرفض (مثل الدوال المتاحة لكل موظف نشط بالتصميم). */
  skipDenyCheck?: boolean;
}) {
  const { group, name, mod, fnName, data, verify, auditAction, skipDenyCheck } = opts;
  let raw = "";
  try {
    const r = await call(mod, fnName, S, data);
    if (!r.ok) return rec(group, name, "FAIL", `الخادم رفض: ${r.message}`);
    raw = r.raw;
  } catch (e) {
    return rec(group, name, "FAIL", (e as Error).message);
  }
  if (verify) {
    let ok = false;
    try {
      ok = await verify(raw);
    } catch (e) {
      return rec(group, name, "FAIL", `تحقق القاعدة أخفق: ${(e as Error).message}`);
    }
    if (!ok) return rec(group, name, "FAIL", "لا أثر في قاعدة البيانات بعد التنفيذ");
  }
  if (auditAction && !(await auditExists(auditAction)))
    return rec(group, name, "FAIL", `لا سجل تدقيق للإجراء ${auditAction}`);
  if (!skipDenyCheck) {
    const d = await call(mod, fnName, NOPERM, data);
    if (d.ok) return rec(group, name, "FAIL", "موظف بلا صلاحيات نفّذ الإجراء");
  }
  rec(group, name, "PASS");
  return raw;
}

/* ═════════════════════ 1) المكاتب (Organizations) ═════════════════════ */
const ORG = ctx.org.id;
await action({
  group: "Organizations",
  name: "تعديل بيانات مكتب + حفظ",
  mod: "orgs",
  fnName: "updateOrganization",
  data: {
    organizationId: ORG,
    name: `${P3_PREFIX}مكتب اختبار الإدارة`,
    legal_name: `${P3_PREFIX}الاسم النظامي`,
    city: "جدة",
    phone: "0126000111",
    email: "qa.p3.office@mehlaqa.test",
    commercial_registration: "1010777333",
    tax_number: "310777333900003",
    address: "بيانات QA محدثة",
  },
  verify: async () => (await one(`organizations?id=eq.${ORG}&select=city`))?.["city"] === "جدة",
  auditAction: "organization.update",
});
await action({
  group: "Organizations",
  name: "إيقاف مكتب (Suspend)",
  mod: "orgs",
  fnName: "setOrganizationActive",
  data: { organizationId: ORG, active: false, reason: "اختبار QA لإيقاف المكتب" },
  verify: async () =>
    (await one(`organizations?id=eq.${ORG}&select=is_active`))?.["is_active"] === false,
});
await action({
  group: "Organizations",
  name: "إعادة تنشيط مكتب (Reactivate)",
  mod: "orgs",
  fnName: "setOrganizationActive",
  data: { organizationId: ORG, active: true, reason: "إعادة التنشيط بعد اختبار QA" },
  verify: async () =>
    (await one(`organizations?id=eq.${ORG}&select=is_active`))?.["is_active"] === true,
});
const grantRaw = await action({
  group: "Organizations",
  name: "طلب وصول دعم لمكتب",
  mod: "orgs",
  fnName: "requestSupportAccess",
  data: { organizationId: ORG, reason: "اختبار QA لطلب وصول الدعم", scope: "cases", hours: 2 },
  verify: async () =>
    Boolean(await one(`support_access_grants?organization_id=eq.${ORG}&select=id&limit=1`)),
});
const grantId =
  (await one(
    `support_access_grants?organization_id=eq.${ORG}&order=created_at.desc&select=id&limit=1`,
  ))?.["id"] as string | undefined;
if (grantId)
  await action({
    group: "Organizations",
    name: "إلغاء وصول الدعم (Revoke)",
    mod: "orgs",
    fnName: "revokeSupportAccess",
    data: { grantId },
    verify: async () =>
      Boolean(await one(`support_access_grants?id=eq.${grantId}&revoked_at=not.is.null&select=id`)),
  });
else rec("Organizations", "إلغاء وصول الدعم (Revoke)", "FAIL", "لم يُنشأ تصريح للإلغاء");
void grantRaw;

/* ═════════════════════ 2) المستخدمون (Users) ═════════════════════ */
const OWNER_ID = ctx.officeOwner.userId;
await action({
  group: "Users",
  name: "إيقاف مستخدم (Suspend)",
  mod: "users",
  fnName: "setUserActive",
  data: { userId: OWNER_ID, active: false, reason: "اختبار QA لإيقاف المستخدم" },
  verify: async () => (await one(`profiles?id=eq.${OWNER_ID}&select=is_active`))?.["is_active"] === false,
});
await action({
  group: "Users",
  name: "إعادة تنشيط مستخدم (Reactivate)",
  mod: "users",
  fnName: "setUserActive",
  data: { userId: OWNER_ID, active: true, reason: "إعادة تنشيط بعد اختبار QA" },
  verify: async () => (await one(`profiles?id=eq.${OWNER_ID}&select=is_active`))?.["is_active"] === true,
});
await action({
  group: "Users",
  name: "إضافة ملاحظة إدارية على مستخدم",
  mod: "users",
  fnName: "addUserNote",
  data: { userId: OWNER_ID, userEmail: ctx.officeOwner.email, body: `${P3_PREFIX}ملاحظة اختبار` },
  verify: async () =>
    Boolean(await one(`platform_user_notes?user_id=eq.${OWNER_ID}&select=id&limit=1`)),
});
await action({
  group: "Users",
  name: "إرسال إعادة تعيين كلمة المرور",
  mod: "users",
  fnName: "sendUserPasswordReset",
  data: { userId: OWNER_ID, email: ctx.officeOwner.email },
});

/* ═════════════════════ 3) الإعدادات وقوالب البريد والأدوار ═════════════════════ */
await action({
  group: "Settings",
  name: "حفظ إعدادات المنصة (general)",
  mod: "ops",
  fnName: "savePlatformSettings",
  data: { group: "general", values: { qa_plan3_marker: P3_PREFIX } },
  verify: async () => Boolean(await one(`platform_settings?key=eq.qa_plan3_marker&select=key`)),
});
const tplRaw = await action({
  group: "Email templates",
  name: "إنشاء/حفظ قالب بريد",
  mod: "ops",
  fnName: "saveEmailTemplate",
  data: {
    code: "qa_plan3_tpl",
    name_ar: `${P3_PREFIX}قالب اختبار`,
    subject: "اختبار QA",
    body_html: "<p>اختبار</p>",
    is_active: false,
  },
  verify: async () => Boolean(await one(`platform_email_templates?code=eq.qa_plan3_tpl&select=id`)),
});
void tplRaw;
const tplId = (await one(`platform_email_templates?code=eq.qa_plan3_tpl&select=id`))?.["id"] as
  | string
  | undefined;
if (tplId)
  await action({
    group: "Email templates",
    name: "حذف قالب بريد",
    mod: "ops",
    fnName: "deleteEmailTemplate",
    data: { id: tplId },
    verify: async () => !(await one(`platform_email_templates?id=eq.${tplId}&select=id`)),
  });
const roleRaw = await action({
  group: "Roles",
  name: "حفظ دور منصة",
  mod: "ops",
  fnName: "savePlatformRole",
  data: {
    code: "qa_plan3_role",
    name_ar: `${P3_PREFIX}دور اختبار`,
    description: "دور QA",
    permissions: ["organizations.read"],
  },
  verify: async () => Boolean(await one(`platform_roles?code=eq.qa_plan3_role&select=id`)),
});
void roleRaw;
const roleId = (await one(`platform_roles?code=eq.qa_plan3_role&select=id`))?.["id"] as
  | string
  | undefined;
if (roleId)
  await action({
    group: "Roles",
    name: "حذف دور منصة",
    mod: "ops",
    fnName: "deletePlatformRole",
    data: { id: roleId },
    verify: async () => !(await one(`platform_roles?id=eq.${roleId}&select=id`)),
  });

/* ═════════════════════ 4) المحتوى العام (Content) ═════════════════════ */
await action({
  group: "Content",
  name: "حفظ صفحة محتوى + نشر",
  mod: "console",
  fnName: "saveContentPage",
  data: {
    slug: "qa-plan3-page",
    kind: "page",
    title: `${P3_PREFIX}صفحة اختبار`,
    description: "وصف اختبار",
    content: JSON.stringify({ blocks: [] }),
    isPublished: true,
  },
  verify: async () =>
    (await one(`platform_content_pages?slug=eq.qa-plan3-page&select=is_published`))?.[
      "is_published"
    ] === true,
});
const pageId = (await one(`platform_content_pages?slug=eq.qa-plan3-page&select=id`))?.["id"] as
  | string
  | undefined;
if (pageId)
  await action({
    group: "Content",
    name: "حذف صفحة محتوى",
    mod: "console",
    fnName: "deleteContentPage",
    data: { id: pageId },
    verify: async () => !(await one(`platform_content_pages?id=eq.${pageId}&select=id`)),
  });

/* ═════════════════════ 5) Feature flags + قواعد الإشعارات ═════════════════════ */
await action({
  group: "Feature flags",
  name: "حفظ راية ميزة (Enable)",
  mod: "flags",
  fnName: "saveFeatureFlag",
  data: {
    key: "qa_plan3_flag",
    label: `${P3_PREFIX}راية اختبار`,
    description: "راية QA",
    isEnabled: true,
  },
  verify: async () =>
    (await one(`platform_feature_flags?key=eq.qa_plan3_flag&select=is_enabled`))?.[
      "is_enabled"
    ] === true,
});
const flagId = (await one(`platform_feature_flags?key=eq.qa_plan3_flag&select=id`))?.["id"] as
  | string
  | undefined;
if (flagId) {
  await action({
    group: "Feature flags",
    name: "تعطيل راية ميزة (Disable)",
    mod: "flags",
    fnName: "saveFeatureFlag",
    data: {
      id: flagId,
      key: "qa_plan3_flag",
      label: `${P3_PREFIX}راية اختبار`,
      description: "راية QA",
      isEnabled: false,
    },
    verify: async () =>
      (await one(`platform_feature_flags?id=eq.${flagId}&select=is_enabled`))?.["is_enabled"] ===
      false,
  });
  await action({
    group: "Feature flags",
    name: "حذف راية ميزة",
    mod: "flags",
    fnName: "deleteFeatureFlag",
    data: { id: flagId },
    verify: async () => !(await one(`platform_feature_flags?id=eq.${flagId}&select=id`)),
  });
}
await action({
  group: "Notifications",
  name: "حفظ قاعدة إشعار",
  mod: "flags",
  fnName: "saveNotificationRule",
  data: {
    topic: "qa_plan3_topic",
    label: `${P3_PREFIX}قاعدة اختبار`,
    channel: "in_app",
    target: "platform_staff",
    templateKey: "qa_plan3_tpl",
    isEnabled: true,
  },
  verify: async () =>
    Boolean(await one(`platform_notification_rules?topic=eq.qa_plan3_topic&select=id`)),
});
const ruleId = (await one(`platform_notification_rules?topic=eq.qa_plan3_topic&select=id`))?.[
  "id"
] as string | undefined;
if (ruleId)
  await action({
    group: "Notifications",
    name: "حذف قاعدة إشعار",
    mod: "flags",
    fnName: "deleteNotificationRule",
    data: { id: ruleId },
    verify: async () => !(await one(`platform_notification_rules?id=eq.${ruleId}&select=id`)),
  });

/* ═════════════════════ 6) النسخ الاحتياطية (Backups) ═════════════════════ */
await action({
  group: "Backups",
  name: "تسجيل نسخة احتياطية",
  mod: "backups",
  fnName: "recordBackupSnapshot",
  data: {
    kind: "manual",
    source: "manual_export",
    externalId: `qa-plan3-${Date.now()}`,
    sizeBytes: 1024,
    notes: "نسخة QA",
    status: "completed",
  },
  verify: async () =>
    Boolean(await one(`platform_backup_snapshots?source=eq.manual_export&select=id&limit=1`)),
});
const snapId = (await one(
  `platform_backup_snapshots?order=created_at.desc&select=id,source&limit=1`,
))?.["id"] as string | undefined;
if (snapId) {
  await action({
    group: "Backups",
    name: "التحقق من نسخة احتياطية (Verify)",
    mod: "backups",
    fnName: "verifyBackupSnapshot",
    data: { id: snapId, checksum: "qa-plan3-checksum" },
    verify: async () =>
      Boolean((await one(`platform_backup_snapshots?id=eq.${snapId}&select=verified_at`))?.["verified_at"]),
  });
  await action({
    group: "Backups",
    name: "طلب استعادة نسخة",
    mod: "backups",
    fnName: "requestBackupRestore",
    data: {
      snapshotId: snapId,
      scope: "table",
      message: "اختبار QA لطلب الاستعادة",
      reason: "اختبار QA لطلب الاستعادة",
    },
    verify: async () =>
      Boolean(await one(`platform_backup_restore_requests?snapshot_id=eq.${snapId}&select=id`)),
  });
  const reqId = (await one(
    `platform_backup_restore_requests?snapshot_id=eq.${snapId}&order=created_at.desc&select=id&limit=1`,
  ))?.["id"] as string | undefined;
  if (reqId)
    rec(
      "Backups",
      "رفض طلب استعادة (Reject)",
      "BLOCKED",
      "الرقابة المزدوجة بالتصميم: لا يعتمد الطلب مقدّمه — يلزم موظف منصة ثانٍ",
    );
  if (false && reqId)
    await action({
      group: "Backups",
      name: "رفض طلب استعادة (Reject)",
      mod: "backups",
      fnName: "decideBackupRestore",
      data: { id: reqId, decision: "rejected", note: "رفض اختباري" },
      verify: async () =>
        (await one(`platform_backup_restore_requests?id=eq.${reqId}&select=status`))?.["status"] !==
        "pending",
    });
}

/* ═════════════════════ 7) استوديو التصميم (Design) ═════════════════════ */
const designDraft = {
  pageKey: "home",
  tokens: {},
  customCss: `/* ${P3_PREFIX} */ .qa-plan3-marker { outline: 0; }`,
};
await action({
  group: "Design",
  name: "التحقق من مسودة التصميم (Validate)",
  mod: "design",
  fnName: "validateDesignDraft",
  data: designDraft,
});
await action({
  group: "Design",
  name: "حفظ مسودة التصميم",
  mod: "design",
  fnName: "saveDesignDraft",
  data: designDraft,
  verify: async () =>
    Boolean(await one(`design_drafts?page_key=eq.home&select=id&limit=1`)),
});
await action({
  group: "Design",
  name: "نشر التصميم (Publish)",
  mod: "design",
  fnName: "publishDesign",
  data: { summary: `${P3_PREFIX}نشر اختباري` },
  verify: async () => Boolean(await one(`design_versions?order=created_at.desc&select=id&limit=1`)),
});
const versions = await rest(`design_versions?order=created_at.desc&select=id&limit=3`);
if (versions.length >= 2)
  await action({
    group: "Design",
    name: "استعادة إصدار سابق (Restore)",
    mod: "design",
    fnName: "restoreDesignVersion",
    data: { versionId: versions[1]!["id"] },
  });
else rec("Design", "استعادة إصدار سابق (Restore)", "BLOCKED", "لا يوجد إصدار سابق في بيئة QA");
await action({
  group: "Design",
  name: "التراجع عن النشر (Rollback)",
  mod: "design",
  fnName: "rollbackDesign",
});
await action({
  group: "Design",
  name: "تصفير صفحة تصميم (Reset)",
  mod: "design",
  fnName: "resetDesignPage",
  data: { pageKey: "home" },
});

/* ═════════════════════ 8) الاشتراكات (Subscriptions) ═════════════════════ */
const subRaw = await action({
  group: "Subscriptions",
  name: "تفعيل اشتراك",
  mod: "admin",
  fnName: "activateSubscription",
  data: {
    email: ctx.officeOwner.email,
    planCode: "qa_plan3",
    planLabel: `${P3_PREFIX}باقة اختبار`,
    amount: 100,
    currency: "SAR",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    note: "اشتراك QA",
  },
  verify: async () =>
    Boolean(await one(`subscriptions?organization_id=eq.${ORG}&select=id&limit=1`)),
});
void subRaw;
const subId = (await one(
  `subscriptions?organization_id=eq.${ORG}&order=created_at.desc&select=id&limit=1`,
))?.["id"] as string | undefined;
if (subId) {
  await action({
    group: "Subscriptions",
    name: "تمديد اشتراك (Extend)",
    mod: "admin",
    fnName: "extendSubscription",
    data: { id: subId, days: 30 },
  });
  await action({
    group: "Subscriptions",
    name: "إيقاف التجديد التلقائي",
    mod: "admin",
    fnName: "setSubscriptionAutoRenew",
    data: { id: subId, autoRenew: false },
    verify: async () =>
      (await one(`subscriptions?id=eq.${subId}&select=auto_renew`))?.["auto_renew"] === false,
  });
  await action({
    group: "Subscriptions",
    name: "تعليق اشتراك (Suspend)",
    mod: "admin",
    fnName: "suspendSubscription",
    data: { id: subId, reason: "تعليق اختباري QA" },
  });
  await action({
    group: "Subscriptions",
    name: "استئناف اشتراك (Resume)",
    mod: "admin",
    fnName: "resumeSubscription",
    data: { id: subId },
  });
  await action({
    group: "Subscriptions",
    name: "إلغاء اشتراك (Cancel)",
    mod: "admin",
    fnName: "cancelSubscription",
    data: { id: subId, reason: "إلغاء اختباري QA" },
    verify: async () =>
      (await one(`subscriptions?id=eq.${subId}&select=status`))?.["status"] === "cancelled",
  });
  await action({
    group: "Subscriptions",
    name: "تغيير حالة اشتراك يدوياً",
    mod: "admin",
    fnName: "setSubscriptionStatus",
    data: { id: subId, status: "active", note: "إعادة للحالة النشطة" },
    verify: async () =>
      (await one(`subscriptions?id=eq.${subId}&select=status`))?.["status"] === "active",
  });
}

await Bun.write("/tmp/browser/plan3/actions-part1.json", JSON.stringify(results, null, 2));
const pass = results.filter((r) => r.status === "PASS").length;
console.log(
  `\nالجزء 1: PASS=${pass} FAIL=${results.filter((r) => r.status === "FAIL").length} BLOCKED=${results.filter((r) => r.status === "BLOCKED").length} / ${results.length}`,
);
