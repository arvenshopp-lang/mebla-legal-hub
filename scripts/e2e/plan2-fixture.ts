/**
 * PLAN 2 — تهيئة مكتبَي QA معزولين (ORG_A / ORG_B) بكامل البيانات التشغيلية.
 *
 * المكتب يُنشأ بدالة الإنتاج `create_organization_with_owner` بجلسة المالك الحقيقية.
 * بقية الأعضاء صفوف عضوية تجهيزية بمفتاح الخدمة (تجهيز بيانات فقط) — أما السلوك
 * المُختبَر فيُنفَّذ دائماً بتوكن كل دور عبر Data API / دوال الخادم مع RLS.
 *
 *   bun scripts/e2e/plan2-fixture.ts            # تهيئة
 *   bun scripts/e2e/plan2-fixture.ts --cleanup  # حذف كامل
 */
import { SUPABASE_URL, PUBLISHABLE, adminHeaders, adminFetch, signIn } from "./qa-support";

export const P2_PREFIX = "QA-PLAN2-20260809-";
export const P2_FILE = "/tmp/browser/plan2/orgs.json";
export const P2_ROLES = ["owner", "admin", "lawyer", "legal_assistant", "viewer"] as const;
export type P2Role = (typeof P2_ROLES)[number];
export type OrgKey = "A" | "B";

export type P2Account = { org: OrgKey; role: P2Role; email: string; userId: string; token: string };
export type P2Org = {
  key: OrgKey;
  organizationId: string;
  orgName: string;
  clientIds: string[];
  caseIds: string[];
  publicCode: string;
  hearingId: string;
  deadlineId: string;
  taskId: string;
  documentId: string;
  ticketId: string;
};
export type P2Fixture = { password: string; orgs: Record<OrgKey, P2Org>; accounts: P2Account[] };

const email = (org: OrgKey, role: P2Role) => `qa.p2${org.toLowerCase()}.${role}@mehlaqa.test`;
const ALL: { org: OrgKey; role: P2Role }[] = (["A", "B"] as OrgKey[]).flatMap((org) =>
  P2_ROLES.map((role) => ({ org, role })),
);

async function findUser(mail: string) {
  const res = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(mail)}`,
  );
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === mail)?.id ?? null;
}

async function ensureUser(mail: string, password: string, fullName: string) {
  const existing = await findUser(mail);
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
      email: mail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء حساب ${mail} (${res.status}) ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function insertRows<T>(table: string, rows: unknown[]): Promise<T[]> {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`تعذّر تجهيز ${table} (${res.status}) ${await res.text()}`);
  return (await res.json()) as T[];
}

async function cleanup() {
  const res = await adminFetch(
    `${SUPABASE_URL}/rest/v1/organizations?name=like.${encodeURIComponent(P2_PREFIX + "%")}&select=id`,
  );
  const orgs = (await res.json()) as { id: string }[];
  for (const org of orgs) {
    await adminFetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?organization_id=eq.${org.id}`,
      { method: "DELETE" },
    );
    await adminFetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${org.id}`, { method: "DELETE" });
  }
  let users = 0;
  for (const a of ALL) {
    const id = await findUser(email(a.org, a.role));
    if (!id) continue;
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE" });
    users += 1;
  }
  console.log(`تم الحذف: ${orgs.length} مكتب و${users} حساب.`);
}

async function buildOrg(key: OrgKey, ownerToken: string, ownerId: string): Promise<P2Org> {
  const orgName = `${P2_PREFIX}مكتب ${key}`;
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_organization_with_owner`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${ownerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ _name: orgName, _city: "الرياض" }),
  });
  const rpcBody = (await rpc.json()) as { organization_id?: string }[];
  const organizationId = Array.isArray(rpcBody) ? rpcBody[0]?.organization_id : undefined;
  if (!organizationId) throw new Error(`تعذّر إنشاء مكتب ${key}: ${JSON.stringify(rpcBody)}`);

  // اشتراك احترافي حتى تسمح الاستحقاقات بأعضاء متعددين وروابط رفع العملاء.
  const planRes = await adminFetch(
    `${SUPABASE_URL}/rest/v1/platform_plans?code=eq.professional&select=id,code,name_ar`,
  );
  const plan = ((await planRes.json()) as { id: string; code: string; name_ar: string }[])[0];
  if (!plan) throw new Error("الباقة الاحترافية غير متاحة");
  const sub = await adminFetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?organization_id=eq.${organizationId}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        plan_id: plan.id,
        plan_code: plan.code,
        plan_label: plan.name_ar,
        ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        status: "active",
        billing_note: "PLAN 2 fixture",
      }),
    },
  );
  if (!sub.ok) throw new Error(`تعذّر تهيئة اشتراك ${key} (${sub.status})`);

  const clients = await insertRows<{ id: string }>(
    "clients",
    ["أحمد", "نورة", "شركة"].map((n, i) => ({
      organization_id: organizationId,
      full_name: `${P2_PREFIX}${n} ${key}${i + 1}`,
      client_type: i === 2 ? "company" : "individual",
      created_by: ownerId,
    })),
  );
  const cases = await insertRows<{ id: string; public_code: string }>(
    "cases",
    [1, 2].map((i) => ({
      organization_id: organizationId,
      client_id: clients[i - 1]!.id,
      case_title: `${P2_PREFIX}قضية ${key}${i}`,
      status: i === 1 ? "open" : "in_progress",
      created_by: ownerId,
    })),
  );
  const caseId = cases[0]!.id;
  const [hearing] = await insertRows<{ id: string }>("hearings", [
    {
      organization_id: organizationId,
      case_id: caseId,
      hearing_date: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      created_by: ownerId,
    },
  ]);
  const [deadline] = await insertRows<{ id: string }>("deadlines", [
    {
      organization_id: organizationId,
      case_id: caseId,
      title: `${P2_PREFIX}مهلة ${key}`,
      due_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      created_by: ownerId,
    },
  ]);
  const [task] = await insertRows<{ id: string }>("tasks", [
    {
      organization_id: organizationId,
      case_id: caseId,
      title: `${P2_PREFIX}مهمة ${key}`,
      created_by: ownerId,
    },
  ]);
  const [document] = await insertRows<{ id: string }>("documents", [
    {
      organization_id: organizationId,
      case_id: caseId,
      client_id: clients[0]!.id,
      file_name: `${P2_PREFIX}${key}.pdf`,
      file_path: `${organizationId}/${caseId}/plan2-${key}.pdf`,
      file_type: "application/pdf",
      file_size: 1024,
      is_confidential: true,
      uploaded_by: ownerId,
    },
  ]);
  const [ticket] = await insertRows<{ id: string }>("support_tickets", [
    {
      organization_id: organizationId,
      reference: `${P2_PREFIX}${key}-${crypto.randomUUID().slice(0, 8)}`,
      subject: `${P2_PREFIX}تذكرة ${key}`,
      description: "تذكرة تجهيز اختبار العزل",
      category: "technical",
      priority: "medium",
      status: "new",
      channel: "portal",
    },
  ]);

  return {
    key,
    organizationId,
    orgName,
    clientIds: clients.map((c) => c.id),
    caseIds: cases.map((c) => c.id),
    publicCode: cases[0]!.public_code,
    hearingId: hearing!.id,
    deadlineId: deadline!.id,
    taskId: task!.id,
    documentId: document!.id,
    ticketId: ticket!.id,
  };
}

async function setup() {
  await cleanup();
  const password = `Qa!${crypto.randomUUID()}`;
  const accounts: P2Account[] = [];
  for (const a of ALL) {
    const mail = email(a.org, a.role);
    const userId = await ensureUser(mail, password, `QA ${a.org} ${a.role}`);
    const token = await signIn(mail, password);
    accounts.push({ ...a, email: mail, userId, token });
  }

  const orgs = {} as Record<OrgKey, P2Org>;
  for (const key of ["A", "B"] as OrgKey[]) {
    const owner = accounts.find((a) => a.org === key && a.role === "owner")!;
    orgs[key] = await buildOrg(key, owner.token, owner.userId);
    const members = accounts
      .filter((a) => a.org === key && a.role !== "owner")
      .map((a) => ({
        organization_id: orgs[key].organizationId,
        user_id: a.userId,
        role: a.role,
        status: "active",
      }));
    const res = await adminFetch(`${SUPABASE_URL}/rest/v1/organization_members`, {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(members),
    });
    if (!res.ok) throw new Error(`تعذّر ربط أعضاء ${key} (${res.status}) ${await res.text()}`);
  }

  const fixture: P2Fixture = { password, orgs, accounts };
  await Bun.write(P2_FILE, JSON.stringify(fixture, null, 2));
  console.log(`مكتبان جاهزان (A/B) و${accounts.length} حساب — ${P2_FILE}`);
}

export async function loadP2(): Promise<P2Fixture> {
  return (await Bun.file(P2_FILE).json()) as P2Fixture;
}

if (import.meta.main) {
  assertE2eEnvironmentSafe();
  if (process.argv.includes("--cleanup")) await cleanup();
  else await setup();
}
