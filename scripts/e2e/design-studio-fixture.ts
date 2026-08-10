/**
 * تهيئة حسابات اختبار استوديو التصميم وتوليد جلسات حقيقية للمتصفح.
 *
 * ثلاثة حسابات: مالك المنصة (super_admin)، مصمم المنصة (staff بصلاحيات المسودة
 * والمعاينة والسجل فقط)، وموظف بلا أي صلاحية تصميم. الجلسات تُكتب في /tmp خارج
 * المستودع، ولا تُطبع كلمات المرور ولا التوكنات إطلاقاً.
 *
 * التشغيل: bun scripts/e2e/design-studio-fixture.ts
 * التنظيف: bun scripts/e2e/design-studio-fixture.ts --cleanup
 */
const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const PUBLISHABLE =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE) {
  console.error("مفاتيح الاتصال غير متاحة في البيئة.");
  process.exit(1);
}

const PROJECT_REF = new URL(SUPABASE_URL).host.split(".")[0]!;
const OUT = "/tmp/browser/design-sessions.json";

type Actor = {
  key: "owner" | "designer" | "plain";
  email: string;
  fullName: string;
  role: "super_admin" | "staff";
  permissions: string[];
};

const ACTORS: Actor[] = [
  {
    key: "owner",
    email: "qa.design.owner@mehlaqa.test",
    fullName: "QA Design Owner",
    role: "super_admin",
    permissions: [],
  },
  {
    key: "designer",
    email: "qa.design.designer@mehlaqa.test",
    fullName: "QA Platform Designer",
    role: "staff",
    permissions: ["design.read", "design.draft.write", "design.preview", "design.history.read"],
  },
  {
    key: "plain",
    email: "qa.design.plain@mehlaqa.test",
    fullName: "QA Staff Without Design",
    role: "staff",
    permissions: ["support.read"],
  },
];

const admin = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function findUserId(email: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: admin },
  );
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

async function ensureUser(actor: Actor, password: string): Promise<string> {
  const existing = await findUserId(actor.email);
  if (existing) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing}`, {
      method: "PUT",
      headers: admin,
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`تعذّر تحديث حساب الاختبار (${res.status})`);
    return existing;
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({
      email: actor.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: actor.fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء حساب الاختبار (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}

async function ensureStaff(actor: Actor, userId: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/platform_staff?on_conflict=user_id`, {
    method: "POST",
    headers: { ...admin, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      email: actor.email,
      full_name: actor.fullName,
      role: actor.role,
      status: "active",
      permissions: actor.permissions,
      role_id: null,
    }),
  });
  if (!res.ok) throw new Error(`تعذّر ربط الحساب بصلاحيات الاختبار (${res.status})`);
}

async function signIn(email: string, password: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`تعذّر تسجيل الدخول بحساب الاختبار (${res.status})`);
  return res.json();
}

async function cleanup() {
  for (const actor of ACTORS) {
    const id = await findUserId(actor.email);
    if (!id) continue;
    await fetch(`${SUPABASE_URL}/rest/v1/platform_staff?user_id=eq.${id}`, {
      method: "DELETE",
      headers: admin,
    });
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
  }
  console.log("تم حذف حسابات اختبار التصميم وصلاحياتها.");
}

if (process.argv.includes("--cleanup")) {
  await cleanup();
  process.exit(0);
}

const sessions: Record<string, unknown> = {};
for (const actor of ACTORS) {
  const password = `Qa!${crypto.randomUUID()}`;
  const userId = await ensureUser(actor, password);
  await ensureStaff(actor, userId);
  sessions[actor.key] = { userId, session: await signIn(actor.email, password) };
}

await Bun.write(
  OUT,
  JSON.stringify({ storageKey: `sb-${PROJECT_REF}-auth-token`, actors: sessions }, null, 2),
);
console.log(`جلسات اختبار التصميم جاهزة: ${OUT}`);
