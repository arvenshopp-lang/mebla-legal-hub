/**
 * تهيئة وتنظيف بيانات QA لرحلات المكتب — مكتب واحد معزول و5 حسابات بأدوار المكتب.
 *
 * المكتب يُنشأ عبر نفس دالة الإنتاج `create_organization_with_owner` بجلسة المالك
 * الحقيقية (لا SQL على منطق الأعمال)، والأعضاء الآخرون يُضافون كصفوف عضوية
 * تجهيزية بمفتاح الخدمة — وهو تجهيز بيانات اختبار فقط، أما السلوك المُختبَر
 * (القراءة/الكتابة) فيتم دائماً بتوكن كل دور عبر Data API مع RLS.
 *
 * الاستخدام:
 *   bun scripts/e2e/org-qa-fixture.ts            # تهيئة + كتابة /tmp/browser/qa-org.json
 *   bun scripts/e2e/org-qa-fixture.ts --cleanup  # حذف كامل
 */
import {
  SUPABASE_URL,
  PUBLISHABLE,
  adminHeaders,
  ORG_ROLES,
  type OrgRole,
  QA_ORG_PREFIX,
  QA_FILE,
  signIn,
  adminFetch,
} from "./qa-support";

type Account = { role: OrgRole | "outsider"; email: string; userId: string; token: string };

const ACCOUNTS: { role: OrgRole | "outsider"; email: string }[] = [
  ...ORG_ROLES.map((role) => ({ role, email: `qa.org.${role}@mehlaqa.test` })),
  { role: "outsider" as const, email: "qa.org.outsider@mehlaqa.test" },
];

async function findUser(email: string): Promise<string | null> {
  const res = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

async function ensureUser(email: string, password: string, fullName: string): Promise<string> {
  const existing = await findUser(email);
  if (existing) {
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing}`, {
      method: "PUT",
      body: JSON.stringify({ password, email_confirm: true }),
    });
    return existing;
  }
  const res = await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء حساب ${email} (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}

async function deleteOrgsByPrefix() {
  const res = await adminFetch(
    `${SUPABASE_URL}/rest/v1/organizations?name=like.${encodeURIComponent(QA_ORG_PREFIX + "%")}&select=id`,
  );
  const rows = (await res.json()) as { id: string }[];
  for (const row of rows) {
    await adminFetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${row.id}`, { method: "DELETE" });
  }
  return rows.length;
}

async function cleanup() {
  const orgs = await deleteOrgsByPrefix();
  let users = 0;
  for (const acc of ACCOUNTS) {
    const id = await findUser(acc.email);
    if (!id) continue;
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE" });
    users += 1;
  }
  console.log(`تم الحذف: ${orgs} مكتب QA و${users} حساب QA.`);
}

async function setup() {
  await cleanup();
  const password = `Qa!${crypto.randomUUID()}`;
  const accounts: Account[] = [];
  for (const acc of ACCOUNTS) {
    const userId = await ensureUser(acc.email, password, `QA ${acc.role}`);
    const token = await signIn(acc.email, password);
    accounts.push({ ...acc, userId, token });
  }

  const owner = accounts.find((a) => a.role === "owner")!;
  const orgName = `${QA_ORG_PREFIX}مكتب الاختبار`;
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_organization_with_owner`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${owner.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ _name: orgName, _city: "الرياض" }),
  });
  const rpcBody = (await rpc.json()) as { organization_id?: string }[] | { message?: string };
  const organizationId = Array.isArray(rpcBody) ? rpcBody[0]?.organization_id : undefined;
  if (!organizationId) throw new Error(`تعذّر إنشاء مكتب QA: ${JSON.stringify(rpcBody)}`);

  // اشتراك احترافي للمكتب حتى تسمح حدود الباقة بخمسة أعضاء (نفس منطق الحصص الإنتاجي).
  const planRes = await adminFetch(
    `${SUPABASE_URL}/rest/v1/platform_plans?code=eq.professional&select=id,code,name_ar`,
  );
  const plan = ((await planRes.json()) as { id: string; code: string; name_ar: string }[])[0];
  if (!plan) throw new Error("الباقة الاحترافية غير متاحة لتهيئة QA");
  const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const sub = await adminFetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: owner.userId,
      email: owner.email,
      organization_id: organizationId,
      plan_id: plan.id,
      plan_code: plan.code,
      plan_label: plan.name_ar,
      amount: 0,
      ends_at: endsAt,
      status: "active",
      activation_method: "manual",
      billing_note: "QA E2E fixture",
    }),
  });
  if (!sub.ok) throw new Error(`تعذّر تهيئة اشتراك QA (${sub.status}) ${await sub.text()}`);

  // بقية الأدوار: صفوف عضوية تجهيزية. `outsider` يبقى بلا عضوية لإثبات عزل المستأجرين.
  const members = accounts
    .filter((a) => a.role !== "owner" && a.role !== "outsider")
    .map((a) => ({
      organization_id: organizationId,
      user_id: a.userId,
      role: a.role,
      status: "active",
    }));
  const insert = await adminFetch(`${SUPABASE_URL}/rest/v1/organization_members`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(members),
  });
  if (!insert.ok) throw new Error(`تعذّر ربط أعضاء QA (${insert.status}) ${await insert.text()}`);

  await Bun.write(
    QA_FILE,
    JSON.stringify(
      {
        organizationId,
        orgName,
        password,
        accounts: accounts.map((a) => ({
          role: a.role,
          email: a.email,
          userId: a.userId,
          token: a.token,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`مكتب QA جاهز (${accounts.length} حساب) — البيانات في ${QA_FILE}`);
}

if (process.argv.includes("--cleanup")) await cleanup();
else await setup();
