/**
 * PLAN 3 — تهيئة بيئة اختبار لوحة الإدارة على بيانات QA معزولة.
 * ينشئ: مشرف أعلى فعلي، موظف منصة بلا صلاحيات (لاختبار الرفض)، مالك مكتب QA،
 * ومكتب QA ببادئة QA-DESTRUCT- لتنفيذ الإجراءات الخطرة بأمان.
 */
import {
  assertE2eEnvironmentSafe, SUPABASE_URL, PUBLISHABLE, adminFetch, adminHeaders, signIn } from "./qa-support";

export const P3_PREFIX = "QA-DESTRUCT-20260809P3-";
export const P3_FILE = "/tmp/browser/plan3/ctx.json";
const PASSWORD = `Qa!${crypto.randomUUID()}`;

export type P3Ctx = {
  password: string;
  superAdmin: { email: string; userId: string; token: string };
  plainStaff: { email: string; userId: string; token: string };
  officeOwner: { email: string; userId: string; token: string };
  org: { id: string; name: string };
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function ensureUser(email: string, fullName: string) {
  const list = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  const found = ((await list.json()) as { users?: { id: string; email: string }[] }).users?.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (found) {
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true, ban_duration: "none" }),
    });
    return found.id;
  }
  const res = await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء ${email}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

export async function loadP3(): Promise<P3Ctx> {
  return (await Bun.file(P3_FILE).json()) as P3Ctx;
}

export async function buildP3(): Promise<P3Ctx> {
  const emails = {
    superAdmin: "qa.p3.superadmin@mehlaqa.test",
    plainStaff: "qa.p3.staff@mehlaqa.test",
    officeOwner: "qa.p3.owner@mehlaqa.test",
  };
  const ids = {
    superAdmin: await ensureUser(emails.superAdmin, `${P3_PREFIX}مشرف أعلى`),
    plainStaff: await ensureUser(emails.plainStaff, `${P3_PREFIX}موظف منصة`),
    officeOwner: await ensureUser(emails.officeOwner, `${P3_PREFIX}مالك مكتب`),
  };

  await rest(
    `platform_staff?user_id=in.(${ids.superAdmin},${ids.plainStaff},${ids.officeOwner})`,
    { method: "DELETE" },
  );
  await rest("platform_staff", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        user_id: ids.superAdmin,
        full_name: `${P3_PREFIX}مشرف أعلى`,
        email: emails.superAdmin,
        job_title: "QA",
        role: "super_admin",
        status: "active",
        permissions: [],
      },
      {
        user_id: ids.plainStaff,
        full_name: `${P3_PREFIX}موظف بلا صلاحيات`,
        email: emails.plainStaff,
        job_title: "QA",
        role: "staff",
        status: "active",
        permissions: [],
      },
    ]),
  });

  const tokens = {
    superAdmin: await signIn(emails.superAdmin, PASSWORD),
    plainStaff: await signIn(emails.plainStaff, PASSWORD),
    officeOwner: await signIn(emails.officeOwner, PASSWORD),
  };

  const orgName = `${P3_PREFIX}مكتب اختبار الإدارة`;
  const existing = await rest(`organizations?name=eq.${encodeURIComponent(orgName)}&select=id`);
  let orgId = existing[0]?.["id"] as string | undefined;
  if (!orgId) {
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_organization_with_owner`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${tokens.officeOwner}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        _name: orgName,
        _city: "الرياض",
        _legal_name: orgName,
        _commercial_registration: "1010777333",
        _tax_number: "310777333900003",
        _phone: "0112000111",
        _email: "qa.p3.office@mehlaqa.test",
        _address: "بيانات QA — لا تُستخدم للإنتاج",
      }),
    });
    const body = (await rpc.json()) as { organization_id?: string }[];
    orgId = Array.isArray(body) ? body[0]?.organization_id : undefined;
    if (!orgId) throw new Error(`تعذّر إنشاء مكتب QA: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const ctx: P3Ctx = {
    password: PASSWORD,
    superAdmin: { email: emails.superAdmin, userId: ids.superAdmin, token: tokens.superAdmin },
    plainStaff: { email: emails.plainStaff, userId: ids.plainStaff, token: tokens.plainStaff },
    officeOwner: { email: emails.officeOwner, userId: ids.officeOwner, token: tokens.officeOwner },
    org: { id: orgId, name: orgName },
  };
  await Bun.write(P3_FILE, JSON.stringify(ctx, null, 2));
  return ctx;
}

if (import.meta.main) {
  assertE2eEnvironmentSafe();
  const ctx = await buildP3();
  console.log(`جاهز: مكتب QA ${ctx.org.id} — 3 حسابات مفعّلة (بلا طبع لأي سر)`);
}
