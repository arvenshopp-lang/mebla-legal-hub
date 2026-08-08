/**
 * يهيّئ حساب QA بدور مالك المنصة ويولّد جلسة حقيقية للمسح البصري في المعاينة.
 *
 * الجلسة تُكتب في ملف مؤقت خارج المستودع (/tmp) ليقرأها سكربت Playwright،
 * ولا تُطبع كلمة المرور ولا التوكن في السجلات إطلاقاً.
 *
 * التشغيل: bun scripts/e2e/mint-qa-session.ts
 */
const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const PUBLISHABLE =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
const PROJECT_REF = new URL(SUPABASE_URL).host.split(".")[0]!;

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE) {
  console.error("مفاتيح الاتصال غير متاحة في البيئة.");
  process.exit(1);
}

const EMAIL = "qa.sweep.owner@mehlaqa.test";
const PASSWORD = `Qa!${crypto.randomUUID()}`;
const OUT = "/tmp/browser/qa-session.json";

const admin = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function findUserId(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(EMAIL)}`,
    { headers: admin },
  );
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === EMAIL)?.id ?? null;
}

async function ensureUser(): Promise<string> {
  const existing = await findUserId();
  if (existing) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing}`, {
      method: "PUT",
      headers: admin,
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`تعذّر تحديث حساب QA (${res.status})`);
    return existing;
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "QA Sweep Owner" },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء حساب QA (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}

async function ensureStaff(userId: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/platform_staff?on_conflict=user_id`, {
    method: "POST",
    headers: { ...admin, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      email: EMAIL,
      full_name: "QA Sweep Owner",
      role: "super_admin",
      status: "active",
      permissions: [],
    }),
  });
  if (!res.ok) throw new Error(`تعذّر ربط حساب QA بدور مالك المنصة (${res.status})`);
}

async function signIn(): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`تعذّر تسجيل الدخول بحساب QA (${res.status})`);
  return res.json();
}

const userId = await ensureUser();
await ensureStaff(userId);
const session = await signIn();
await Bun.write(
  OUT,
  JSON.stringify({ storageKey: `sb-${PROJECT_REF}-auth-token`, session }, null, 2),
);
console.log(`جلسة QA جاهزة: ${OUT}`);
