/**
 * تهيئة بيئة قبول FEATURE 01: مكتبان QA + مستخدمون بأدوار + حساب موظف منصة،
 * وتنظيف كل أثر سابق للميزة قبل بدء الجولة. لا يلمس بيانات عملاء حقيقيين.
 */
import { ensureUser, one, rest, del, PASSWORD, signIn, adminFetch, SUPABASE_URL } from "./lib";

export const SLUG_A = "qa-f01-alpha";
export const SLUG_B = "qa-f01-beta";
export const CLIENT_TAG = "QA-F01";

export type Env = {
  orgA: string;
  orgB: string;
  ownerA: { id: string; token: string; email: string };
  viewerA: { id: string; token: string; email: string };
  ownerB: { id: string; token: string; email: string };
  staff: { id: string; token: string; email: string };
};

/** تعيين ثابت للمكتبين حسب ترتيب الإنشاء، حتى لا تتبدّل الهويات بين الجولات. */
async function qaOrgPair(like: string): Promise<{ orgA: string; orgB: string }> {
  const rows = await rest(
    `organizations?select=id,name&name=like.*${encodeURIComponent(like)}*&order=created_at.asc,id.asc&limit=10`,
  );
  if (rows.length < 2) throw new Error("مطلوب مكتبان QA على الأقل لاختبار العزل.");
  return { orgA: rows[0]!["id"] as string, orgB: rows[1]!["id"] as string };
}

/** إزالة أي عضوية سابقة لمستخدم QA في مكتب غير المكتب المقصود. */
async function pruneForeignMemberships(userId: string, keepOrg: string) {
  await del(`organization_members?user_id=eq.${userId}&organization_id=neq.${keepOrg}`);
}

async function ensureMember(organizationId: string, userId: string, role: string) {
  await rest(`organization_members?on_conflict=organization_id,user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ organization_id: organizationId, user_id: userId, role, status: "active" }),
  });
}

/**
 * الملف الشخصي في مِهلة لا يحمل معرّف المكتب — العضوية مصدرها organization_members،
 * فلا نضيف أي عمود للمخطط من أجل الاختبار.
 */
async function ensureProfile(userId: string, email: string, fullName: string) {
  await rest(`profiles?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: userId, email, full_name: fullName, is_active: true }),
  });
}

async function ensureLiveSubscription(organizationId: string) {
  const plan = await one(
    `platform_plans?select=id,code,public_office_page&public_office_page=is.true&is_active=is.true&limit=1`,
  );
  if (!plan) throw new Error("لا توجد باقة تتضمن الصفحة العامة للمكتب.");
  const ends = new Date(Date.now() + 30 * 86400_000).toISOString();
  const existing = await one(`subscriptions?select=id&organization_id=eq.${organizationId}&limit=1`);
  if (existing) {
    await rest(`subscriptions?id=eq.${existing["id"] as string}`, {
      method: "PATCH",
      body: JSON.stringify({ plan_id: plan["id"], status: "active", ends_at: ends }),
    });
  } else {
    await rest(`subscriptions`, {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        plan_id: plan["id"],
        status: "active",
        starts_at: new Date().toISOString(),
        ends_at: ends,
      }),
    });
  }
  return plan["code"] as string;
}

export async function resetFeatureData(orgA: string, orgB: string) {
  for (const org of [orgA, orgB]) {
    await del(`office_leads?organization_id=eq.${org}`);
    await del(`office_page_events?organization_id=eq.${org}`);
    await del(`office_public_pages?organization_id=eq.${org}`);
    await del(`clients?organization_id=eq.${org}&full_name=like.*${CLIENT_TAG}*`);
  }
  await del(`office_public_pages?slug=in.(${SLUG_A},${SLUG_B})`);
}

export async function setupEnv(): Promise<Env> {
  const { orgA, orgB } = await qaOrgPair("QA-PLAN2");

  const ownerAId = await ensureUser("qa.f01.owner.a@mehlaqa.test", "QA F01 Owner A");
  const viewerAId = await ensureUser("qa.f01.viewer.a@mehlaqa.test", "QA F01 Viewer A");
  const ownerBId = await ensureUser("qa.f01.owner.b@mehlaqa.test", "QA F01 Owner B");
  const staffId = await ensureUser("qa.f01.platform@mehlaqa.test", "QA F01 Platform");

  await ensureProfile(ownerAId, "qa.f01.owner.a@mehlaqa.test", "QA F01 Owner A");
  await ensureProfile(viewerAId, "qa.f01.viewer.a@mehlaqa.test", "QA F01 Viewer A");
  await ensureProfile(ownerBId, "qa.f01.owner.b@mehlaqa.test", "QA F01 Owner B");
  await ensureProfile(staffId, "qa.f01.platform@mehlaqa.test", "QA F01 Platform");
  await ensureMember(orgA, ownerAId, "owner");
  await ensureMember(orgA, viewerAId, "viewer");
  await ensureMember(orgB, ownerBId, "owner");
  await pruneForeignMemberships(ownerAId, orgA);
  await pruneForeignMemberships(viewerAId, orgA);
  await pruneForeignMemberships(ownerBId, orgB);
  await pruneForeignMemberships(staffId, orgB);

  await rest(`platform_staff?on_conflict=user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: staffId,
      email: "qa.f01.platform@mehlaqa.test",
      full_name: "QA F01 Platform",
      role: "super_admin",
      status: "active",
      permissions: [],
    }),
  });

  await ensureLiveSubscription(orgA);
  await ensureLiveSubscription(orgB);
  await resetFeatureData(orgA, orgB);

  const token = async (email: string) => await signIn(email, PASSWORD);
  return {
    orgA,
    orgB,
    ownerA: { id: ownerAId, email: "qa.f01.owner.a@mehlaqa.test", token: await token("qa.f01.owner.a@mehlaqa.test") },
    viewerA: { id: viewerAId, email: "qa.f01.viewer.a@mehlaqa.test", token: await token("qa.f01.viewer.a@mehlaqa.test") },
    ownerB: { id: ownerBId, email: "qa.f01.owner.b@mehlaqa.test", token: await token("qa.f01.owner.b@mehlaqa.test") },
    staff: { id: staffId, email: "qa.f01.platform@mehlaqa.test", token: await token("qa.f01.platform@mehlaqa.test") },
  };
}

/** حذف حساب موظف المنصة المؤقت بعد الجولة حتى لا تبقى صلاحية عليا مفتوحة. */
export async function teardownStaff(staffUserId: string) {
  await del(`platform_staff?user_id=eq.${staffUserId}`);
  await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${staffUserId}`, { method: "DELETE" });
}