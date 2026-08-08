/**
 * اختبار RBAC خادمي حقيقي — بلا Stub وبلا محاكاة واجهة.
 *
 * يُنشئ حسابات QA مؤقتة بأدوار منصة فعلية، يسجّل الدخول بها فعلياً للحصول على
 * توكن جلسة حقيقي، ثم يستدعي دوال الخادم (createServerFn) عبر مسارها الحقيقي
 * ويتحقق أن المسموح يمرّ والممنوع يُرفض. كما يحاول قراءة الجداول الحساسة
 * مباشرة عبر Data API للتأكد من أن المنح مسحوبة.
 *
 * التشغيل: bun scripts/e2e/rbac_server_e2e.ts
 * يتطلب: SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY، SUPABASE_PUBLISHABLE_KEY.
 */

import { toJSONAsync } from "seroval";

const APP = process.env["APP_ORIGIN"] ?? "http://localhost:8080";
const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const PUBLISHABLE =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE) {
  console.error("مفاتيح الاتصال غير متاحة في البيئة.");
  process.exit(1);
}

const PREFIX = "QA-E2E-20260808";
const PASSWORD = `Qa!${crypto.randomUUID().slice(0, 18)}`;

/* ------------------------------------------------------------ أدوات مساعدة */

const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function rest(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const token = init.token;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: token ? PUBLISHABLE : SERVICE_KEY,
      Authorization: `Bearer ${token ?? SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* نص خام */
  }
  return { status: res.status, body };
}

/** معرّف دالة الخادم كما يبنيه مُحوّل TanStack Start. */
function fnId(file: string, exportName: string): string {
  const payload = JSON.stringify({
    file: `/src/lib/${file}?tss-serverfn-split`,
    export: `${exportName}_createServerFn_handler`,
  });
  return Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type CallResult = { status: number; denied: boolean; message: string };

async function callServerFn(
  file: string,
  exportName: string,
  token: string,
  data?: unknown,
): Promise<CallResult> {
  const res = await fetch(`${APP}/_serverFn/${fnId(file, exportName)}`, {
    method: "POST",
    headers: {
      "x-tsr-serverFn": "true",
      Origin: APP,
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // نفس ترميز TanStack Start (seroval) وإلا رفض الخادم الحمولة.
    body: JSON.stringify(await toJSONAsync(data === undefined ? {} : { data })),
  });
  const text = await res.text();
  // الرفض يظهر إما بحالة غير 2xx أو بخطأ مُسلسل داخل إطار الاستجابة.
  const denied = !res.ok || text.includes("$TSR/Error");
  return { status: res.status, denied, message: text.slice(0, 160) };
}

/* ------------------------------------------------------- تهيئة حسابات QA */

type RoleCase = {
  key: string;
  label: string;
  roleCode: string | null; // null = super_admin بلا دور
  platformRole: "super_admin" | "staff";
  permissions: string[] | null;
};

const ROLE_CASES: RoleCase[] = [
  { key: "owner", label: "مالك المنصة", roleCode: null, platformRole: "super_admin", permissions: null },
  { key: "support", label: "الدعم", roleCode: "support_agent", platformRole: "staff", permissions: null },
  { key: "finance", label: "المالية", roleCode: "billing_manager", platformRole: "staff", permissions: null },
  { key: "operations", label: "التشغيل", roleCode: "operations", platformRole: "staff", permissions: null },
  { key: "readonly", label: "قراءة فقط", roleCode: null, platformRole: "staff", permissions: ["users.read", "organizations.read"] },
  { key: "suspended", label: "موظف موقوف", roleCode: "support_agent", platformRole: "staff", permissions: null },
  { key: "outsider", label: "مستخدم عادي بلا صفة موظف", roleCode: null, platformRole: "staff", permissions: null },
];

type Actor = RoleCase & { userId: string; email: string; token: string };

async function createUser(email: string): Promise<string> {
  // إزالة أي بقايا من تشغيل سابق لنفس بريد الاختبار.
  const lookup = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: adminHeaders },
  );
  const existing = (await lookup.json()) as { users?: { id: string; email: string }[] };
  for (const user of existing.users ?? []) {
    if (user.email !== email) continue;
    await rest(`/rest/v1/platform_staff?user_id=eq.${user.id}`, { method: "DELETE" });
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${PREFIX} ${email}` },
    }),
  });
  const body = (await res.json()) as { id?: string; msg?: string };
  if (!body.id) throw new Error(`فشل إنشاء مستخدم QA: ${JSON.stringify(body)}`);
  return body.id;
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`فشل تسجيل الدخول: ${email}`);
  return body.access_token;
}

async function roleIds(): Promise<Record<string, string>> {
  const { body } = await rest("/rest/v1/platform_roles?select=id,code");
  const rows = body as { id: string; code: string }[];
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

async function setup(): Promise<Actor[]> {
  const roles = await roleIds();
  const actors: Actor[] = [];
  for (const rc of ROLE_CASES) {
    const email = `${PREFIX.toLowerCase()}.${rc.key}@mehlaqa.test`;
    const userId = await createUser(email);
    if (rc.key !== "outsider") {
      const insert = await rest("/rest/v1/platform_staff", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          full_name: `${PREFIX} ${rc.label}`,
          email,
          role: rc.platformRole,
          status: rc.key === "suspended" ? "suspended" : "active",
          permissions: rc.permissions ?? [],
          role_id: rc.roleCode ? roles[rc.roleCode] : null,
        }),
      });
      if (insert.status >= 300)
        throw new Error(`فشل إنشاء صفة الموظف (${rc.key}): ${JSON.stringify(insert.body)}`);
    }
    actors.push({ ...rc, userId, email, token: await signIn(email) });
  }
  return actors;
}

async function teardown(actors: Actor[]) {
  for (const a of actors) {
    await rest(`/rest/v1/platform_staff?user_id=eq.${a.userId}`, { method: "DELETE" });
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${a.userId}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
  }
}

/* ------------------------------------------------------------- المصفوفة */

type Probe = {
  name: string;
  file: string;
  fn: string;
  data?: unknown;
  /** الأدوار المتوقع أن تنجح؛ الباقي يجب أن يُرفض. */
  allow: string[];
};

const PROBES: Probe[] = [
  {
    name: "مؤشرات النشاط (أي موظف نشط)",
    file: "admin-console.functions.ts",
    fn: "getActivityOverview",
    allow: ["owner", "support", "finance", "operations", "readonly"],
  },
  {
    name: "صحة الخدمات (monitoring.read)",
    file: "admin-console.functions.ts",
    fn: "getServiceHealth",
    allow: ["owner", "support", "operations"],
  },
  {
    name: "ملخص الإيرادات (revenue.read)",
    file: "admin.functions.ts",
    fn: "getRevenueSummary",
    allow: ["owner", "finance"],
  },
  {
    name: "دليل المستخدمين (users.read)",
    file: "admin-users.functions.ts",
    fn: "listPlatformUsers",
    data: { search: "", status: "all", sort: "recent", limit: 5, offset: 0 },
    allow: ["owner", "support", "finance", "operations", "readonly"],
  },
  {
    name: "النسخ الاحتياطية (backups.manage)",
    file: "backups.functions.ts",
    fn: "listBackupSnapshots",
    allow: ["owner"],
  },
  {
    name: "إنشاء موظف منصة (staff.manage) — تصعيد صلاحية",
    file: "admin.functions.ts",
    fn: "createStaffMember",
    data: {
      full_name: `${PREFIX} تصعيد`,
      email: `${PREFIX.toLowerCase()}.escalation@mehlaqa.test`,
      role: "super_admin",
      permissions: [],
      role_id: null,
      department_id: null,
    },
    allow: ["owner"],
  },
];

const DIRECT_TABLES = [
  "cases",
  "clients",
  "documents",
  "support_tickets",
  "platform_staff",
  "platform_invoices",
  "organizations",
];

/* --------------------------------------------------------------- التشغيل */

type Row = { probe: string; role: string; expected: string; actual: string; pass: boolean };

async function main() {
  console.log("تهيئة حسابات QA بأدوار حقيقية…");
  const actors = await setup();
  const rows: Row[] = [];
  try {
    for (const probe of PROBES) {
      for (const actor of actors) {
        const expectAllow = probe.allow.includes(actor.key);
        const res = await callServerFn(probe.file, probe.fn, actor.token, probe.data);
        const actualAllow = !res.denied;
        rows.push({
          probe: probe.name,
          role: actor.label,
          expected: expectAllow ? "مسموح" : "ممنوع",
          actual: actualAllow ? "مسموح" : `ممنوع (${res.status})`,
          pass: expectAllow === actualAllow,
        });
      }
    }

    // قراءة مباشرة للجداول الحساسة بتوكن مستخدم عادي — يجب أن تُمنع دائماً.
    const outsider = actors.find((a) => a.key === "outsider")!;
    for (const table of DIRECT_TABLES) {
      const res = await rest(`/rest/v1/${table}?select=id&limit=1`, { token: outsider.token });
      // RLS تُعيد 200 بمصفوفة فارغة؛ التسريب الحقيقي هو صف فعلي.
      const leaked = res.status === 200 && Array.isArray(res.body) && res.body.length > 0;
      rows.push({
        probe: `قراءة مباشرة من ${table}`,
        role: "مستخدم عادي",
        expected: "بلا أي صف",
        actual: leaked ? "تسريب صفوف" : res.status === 200 ? "فارغ (RLS)" : `ممنوع (${res.status})`,
        pass: !leaked,
      });
    }
  } finally {
    await teardown(actors);
    console.log("تم تنظيف حسابات QA.");
  }

  const failed = rows.filter((r) => !r.pass);
  for (const r of rows) {
    console.log(
      `${r.pass ? "PASS" : "FAIL"} | ${r.probe} | ${r.role} | متوقع: ${r.expected} | فعلي: ${r.actual}`,
    );
  }
  console.log(`\nالمجموع: ${rows.length} — ناجح: ${rows.length - failed.length} — فاشل: ${failed.length}`);
  if (failed.length) process.exit(1);
}

await main();