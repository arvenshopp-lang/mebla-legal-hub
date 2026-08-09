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

async function orgIdByNameLike(like: string): Promise<string> {
  const row = await one(`organizations?select=id,name&name=like.*${encodeURIComponent(like)}*&limit=1`);
  if (!row) throw new Error(`لم يُعثر على مكتب QA يطابق: ${like}`);
  return row["id"] as string;
}

async function ensureMember(organizationId: string, userId: string, role: string) {
  await rest(`organization_members?on_conflict=organization_id,user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ organization_id: organizationId, user_id: userId, role, status: "active" }),
  });
}

async function ensureProfile(userId: string, email: string, fullName: string, organizationId: string) {
  await rest(`profiles?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: userId, email, full_name: fullName, organization_id: organizationId }),
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
  const orgA = await orgIdByNameLike("QA-PLAN2");
  const orgs = await rest(
    `organizations?select=id,name&name=like.*QA-PLAN2*&order=created_at.asc&limit=5`,
  );
  if (orgs.length < 2) throw new Error("مطلوب مكتبان QA على الأقل لاختبار العزل.");
  const orgB = (orgs.find((o) => (o["id"] as string) !== orgA)?.["id"] as string) ?? orgs[1]!["id"] as string;

  const ownerAId = await ensureUser("qa.f01.owner.a@mehlaqa.test", "QA F01 Owner A");
  const viewerAId = await ensureUser("qa.f01.viewer.a@mehlaqa.test", "QA F01 Viewer A");
  const ownerBId = await ensureUser("qa.f01.owner.b@mehlaqa.test", "QA F01 Owner B");
  const staffId = await ensureUser("qa.f01.platform@mehlaqa.test", "QA F01 Platform");

  await ensureProfile(ownerAId, "qa.f01.owner.a@mehlaqa.test", "QA F01 Owner A", orgA);
  await ensureProfile(viewerAId, "qa.f01.viewer.a@mehlaqa.test", "QA F01 Viewer A", orgA);
  await ensureProfile(ownerBId, "qa.f01.owner.b@mehlaqa.test", "QA F01 Owner B", orgB);
  await ensureMember(orgA, ownerAId, "owner");
  await ensureMember(orgA, viewerAId, "viewer");
  await ensureMember(orgB, ownerBId, "owner");

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