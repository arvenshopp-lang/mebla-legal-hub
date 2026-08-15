/**
 * مؤشر الإنجاز التشغيلي — طبقة الخادم لإعدادات الظهور العام والترتيب (B3B/B4).
 *
 * قواعد ثابتة:
 * - الخصوصية افتراضياً: لا ظهور عام بلا `public_opt_in = true` وبلا استثناء منصة.
 * - المفتاح العام يقرأ خادمياً فقط ويفشل مغلقاً (`enabled = false`) عند غيابه.
 * - الاستجابة العامة Metadata مطهّرة: لا معرّفات ولا اشتراكات ولا أبعاد ولا أعداد.
 */

import {
  PUBLIC_MINIMUM_SCORE,
  PUBLIC_RESULTS_COUNT,
  sanitizePublicRankingItems,
  type PublicOperationalRanking,
  type PublicOperationalRankingItem,
} from "./score.shared";

/*
 * الجداول الجديدة (organization_ranking_settings / operational_score_snapshots)
 * تُنشأ بعد فتح RECOVERY GATE، فلا توجد بعد في الأنواع المولّدة. نستخدم نفس
 * النمط المعتمد في `score.server.ts` بدل تمرير `any` في كل موضع.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const RANKING_SETTINGS_TABLE = "organization_ranking_settings";
export const SNAPSHOTS_TABLE = "operational_score_snapshots";
export const SNAPSHOT_WINDOW_KIND = "rolling_90";
export const OPERATIONAL_SCORE_SETTING_KEY = "operational_score";

export class RankingAccessError extends Error {}

export type RankingSettings = {
  organizationId: string;
  publicOptIn: boolean;
  optedInAt: string | null;
  platformExcluded: boolean;
  exclusionReason: string | null;
};

/** المفتاح العام لتشغيل الميزة: غياب المفتاح أو أي خطأ = معطّلة (Fail closed). */
export async function isRankingFeatureEnabled(adminSupabase: Client): Promise<boolean> {
  try {
    const { data, error } = await adminSupabase
      .from("platform_settings")
      .select("value")
      .eq("key", OPERATIONAL_SCORE_SETTING_KEY)
      .maybeSingle();
    if (error || !data) return false;
    const value = data.value as { enabled?: unknown } | null;
    return value?.enabled === true;
  } catch {
    return false;
  }
}

/** يثبت أن المستخدم مدير مكتب (owner/admin) بعضوية نشطة قبل أي تغيير إعداد. */
export async function requireOrganizationManager(
  supabase: Client,
  organizationId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new RankingAccessError("تعذّر التحقق من صلاحيتك على هذا المكتب.");
  if (!data || !["owner", "admin"].includes(String(data.role))) {
    throw new RankingAccessError("لا تملك الصلاحية لتعديل إعدادات الظهور العام لهذا المكتب.");
  }
}

export async function getRankingSettings(
  supabase: Client,
  organizationId: string,
): Promise<RankingSettings> {
  const { data, error } = await supabase
    .from(RANKING_SETTINGS_TABLE)
    .select("organization_id, public_opt_in, opted_in_at, platform_excluded, exclusion_reason")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new RankingAccessError("تعذّر قراءة إعدادات الظهور العام.");
  return {
    organizationId,
    publicOptIn: data?.public_opt_in === true,
    optedInAt: (data?.opted_in_at as string | null) ?? null,
    platformExcluded: data?.platform_excluded === true,
    exclusionReason: (data?.exclusion_reason as string | null) ?? null,
  };
}

/**
 * موافقة/سحب موافقة الظهور العام. لا يمس أي حقل استثناء منصة (يمنعه حارس
 * قاعدة البيانات أيضاً)، ويكتب سجلاً تشغيلياً في `activity_logs` بهوية الفاعل
 * التي تثبتها القاعدة.
 */
export async function setRankingOptIn(
  supabase: Client,
  organizationId: string,
  userId: string,
  optIn: boolean,
): Promise<RankingSettings> {
  await requireOrganizationManager(supabase, organizationId, userId);
  const before = await getRankingSettings(supabase, organizationId);

  const { error } = await supabase.from(RANKING_SETTINGS_TABLE).upsert(
    {
      organization_id: organizationId,
      public_opt_in: optIn,
      opted_in_at: optIn ? new Date().toISOString() : null,
      opted_in_by: optIn ? userId : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new RankingAccessError("تعذّر حفظ إعداد الظهور العام.");

  await supabase.from("activity_logs").insert({
    organization_id: organizationId,
    action: optIn ? "ranking.opt_in" : "ranking.opt_out",
    entity_type: "organization_ranking_settings",
    entity_id: organizationId,
    description: optIn
      ? "الموافقة على الظهور في قائمة الأكثر إنجازاً على مِهلة"
      : "سحب الموافقة على الظهور في قائمة الأكثر إنجازاً على مِهلة",
    metadata: { previous_opt_in: before.publicOptIn, new_opt_in: optIn },
  });

  return { ...before, publicOptIn: optIn, optedInAt: optIn ? new Date().toISOString() : null };
}

/** استثناء/إعادة مكتب من الترتيب العام — عملية منصة فقط (تُستدعى بعد حرس الصلاحيات). */
export async function setPlatformExclusion(
  adminSupabase: Client,
  organizationId: string,
  excluded: boolean,
  reason: string | null,
  staffUserId: string,
): Promise<void> {
  const { error } = await adminSupabase.from(RANKING_SETTINGS_TABLE).upsert(
    {
      organization_id: organizationId,
      platform_excluded: excluded,
      exclusion_reason: excluded ? reason : null,
      excluded_at: excluded ? new Date().toISOString() : null,
      excluded_by: excluded ? staffUserId : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new RankingAccessError("تعذّر تحديث حالة الاستثناء.");
}

export type RankingStatusRow = {
  organizationId: string;
  organizationName: string;
  publicOptIn: boolean;
  platformExcluded: boolean;
  exclusionReason: string | null;
  latestScore: number | null;
  latestComputedAt: string | null;
};

/** قائمة حالة الترتيب لموظفي المنصة (تُستدعى بعد حرس الصلاحيات). */
export async function listRankingStatus(
  adminSupabase: Client,
  limit = 100,
): Promise<RankingStatusRow[]> {
  const { data, error } = await adminSupabase
    .from(RANKING_SETTINGS_TABLE)
    .select(
      "organization_id, public_opt_in, platform_excluded, exclusion_reason, organizations(name)",
    )
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new RankingAccessError("تعذّر قراءة حالة الترتيب.");

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => String(r["organization_id"]));
  const latest = await latestSnapshotsByOrganization(adminSupabase, ids);

  return rows.map((r) => {
    const id = String(r["organization_id"]);
    const snap = latest.get(id);
    return {
      organizationId: id,
      organizationName:
        ((r["organizations"] as { name?: string } | null)?.name as string | undefined) ?? "",
      publicOptIn: r["public_opt_in"] === true,
      platformExcluded: r["platform_excluded"] === true,
      exclusionReason: (r["exclusion_reason"] as string | null) ?? null,
      latestScore: snap?.score ?? null,
      latestComputedAt: snap?.computedAt ?? null,
    };
  });
}

type LatestSnapshot = { score: number | null; eligible: boolean; computedAt: string };

/** أحدث لقطة لكل مكتب داخل استعلام واحد مقيّد (بلا N+1). */
export async function latestSnapshotsByOrganization(
  adminSupabase: Client,
  organizationIds: string[],
): Promise<Map<string, LatestSnapshot>> {
  const result = new Map<string, LatestSnapshot>();
  if (organizationIds.length === 0) return result;
  const { data, error } = await adminSupabase
    .from(SNAPSHOTS_TABLE)
    .select("organization_id, score, eligible, computed_at")
    .eq("window_kind", SNAPSHOT_WINDOW_KIND)
    .in("organization_id", organizationIds)
    .order("computed_at", { ascending: false })
    .limit(organizationIds.length * 8);
  if (error) return result;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row["organization_id"]);
    if (result.has(id)) continue; // الأحدث أولاً بحكم الترتيب
    result.set(id, {
      score: row["score"] === null ? null : Number(row["score"]),
      eligible: row["eligible"] === true,
      computedAt: String(row["computed_at"]),
    });
  }
  return result;
}

/** حالة اشتراك فعّالة للظهور العام: نشط أو تجريبي غير موقوف ولم ينته. */
async function activeSubscriptionOrganizations(
  adminSupabase: Client,
  organizationIds: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (organizationIds.length === 0) return allowed;
  const { data, error } = await adminSupabase
    .from("subscriptions")
    .select("organization_id, status, ends_at, suspended_at")
    .in("organization_id", organizationIds);
  if (error) return allowed;
  const now = Date.now();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const endsAt = row["ends_at"] ? new Date(String(row["ends_at"])).getTime() : null;
    if (row["suspended_at"]) continue;
    if (String(row["status"]) !== "active") continue;
    if (endsAt !== null && endsAt <= now) continue;
    allowed.add(String(row["organization_id"]));
  }
  return allowed;
}

/** الاسم العام المعتمد = اسم المكتب في الصفحة العامة المنشورة فقط. */
async function approvedPublicNames(
  adminSupabase: Client,
  organizationIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (organizationIds.length === 0) return names;
  const { data, error } = await adminSupabase
    .from("office_public_pages")
    .select("organization_id, status, suspended_by_platform, published")
    .eq("status", "published")
    .in("organization_id", organizationIds);
  if (error) return names;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (row["suspended_by_platform"] === true) continue;
    const published = row["published"] as { office_name?: unknown } | null;
    const name = typeof published?.office_name === "string" ? published.office_name.trim() : "";
    if (name.length === 0) continue;
    names.set(String(row["organization_id"]), name);
  }
  return names;
}

/**
 * الترتيب العام (Top 5). كل الشروط تُتحقق خادمياً:
 * موافقة صريحة + لا استثناء منصة + مكتب نشط + اشتراك نشط + صفحة عامة منشورة
 * باسم معتمد + أهلية B1 + نتيجة ≥ الحد الأدنى.
 * الترتيب: `score` تنازلياً، وعند التعادل الأقدم حساباً (`computed_at`) ثم الاسم
 * ترتيباً أبجدياً ثابتاً — قطعي وغير حساس لأي بيانات داخلية.
 */
export async function getPublicRanking(adminSupabase: Client): Promise<PublicOperationalRanking> {
  const empty: PublicOperationalRanking = { enabled: false, computedAt: null, items: [] };
  if (!(await isRankingFeatureEnabled(adminSupabase))) return empty;

  const { data: settingsRows, error: settingsError } = await adminSupabase
    .from(RANKING_SETTINGS_TABLE)
    .select("organization_id")
    .eq("public_opt_in", true)
    .eq("platform_excluded", false)
    .limit(500);
  if (settingsError) return { ...empty, enabled: true };

  const optedIn = ((settingsRows ?? []) as Array<Record<string, unknown>>).map((r) =>
    String(r["organization_id"]),
  );
  if (optedIn.length === 0) return { enabled: true, computedAt: null, items: [] };

  const { data: orgRows } = await adminSupabase
    .from("organizations")
    .select("id, is_active, suspended_at")
    .in("id", optedIn);
  const activeOrgs = ((orgRows ?? []) as Array<Record<string, unknown>>)
    .filter((r) => r["is_active"] === true && !r["suspended_at"])
    .map((r) => String(r["id"]));
  if (activeOrgs.length === 0) return { enabled: true, computedAt: null, items: [] };

  const [subscribed, names, snapshots] = await Promise.all([
    activeSubscriptionOrganizations(adminSupabase, activeOrgs),
    approvedPublicNames(adminSupabase, activeOrgs),
    latestSnapshotsByOrganization(adminSupabase, activeOrgs),
  ]);

  type Candidate = PublicOperationalRankingItem & { computedAt: string };
  const candidates: Candidate[] = [];
  for (const orgId of activeOrgs) {
    if (!subscribed.has(orgId)) continue;
    const publicName = names.get(orgId);
    if (!publicName) continue;
    const snap = snapshots.get(orgId);
    if (!snap || !snap.eligible || snap.score === null) continue;
    if (snap.score < PUBLIC_MINIMUM_SCORE) continue;
    candidates.push({
      rank: 0,
      publicName,
      score: snap.score,
      badge: null,
      logoUrl: null,
      computedAt: snap.computedAt,
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime() ||
      a.publicName.localeCompare(b.publicName, "ar"),
  );

  const top = candidates.slice(0, PUBLIC_RESULTS_COUNT);
  const computedAt =
    top.length > 0
      ? new Date(
          Math.max(...top.map((c) => new Date(c.computedAt).getTime())),
        ).toISOString()
      : null;

  // تصفية نهائية: الحقول العامة فقط، بلا أي Metadata داخلية.
  const items = sanitizePublicRankingItems(
    top.map((c, index) => ({
      rank: index + 1,
      publicName: c.publicName,
      score: c.score,
      badge: c.badge ?? null,
      logoUrl: c.logoUrl ?? null,
    })),
  );

  return { enabled: true, computedAt, items };
}
