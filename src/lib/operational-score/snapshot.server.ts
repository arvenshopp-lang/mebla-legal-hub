/**
 * مؤشر الإنجاز التشغيلي — توليد اللقطات (B4).
 * المحرك الوحيد للحساب هو `computeOrganizationScore` (B1): لا تُنسخ المعادلة هنا.
 * اللقطة تخزّن Metadata تشغيلية فقط: لا عناوين قضايا ولا أسماء عملاء ولا محتوى قانوني.
 */

import { computeOrganizationScore } from "./score.server";
import { SNAPSHOTS_TABLE, SNAPSHOT_WINDOW_KIND } from "./ranking.server";
import type { OperationalScoreResult } from "./score.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type SnapshotRunResult = {
  organizations: number;
  stored: number;
  failed: number;
};

const ORG_BATCH_LIMIT = 200;

/** المكاتب المؤهلة للحساب الدوري: نشطة وغير موقوفة. */
async function eligibleOrganizations(adminSupabase: Client, limit: number): Promise<string[]> {
  const { data, error } = await adminSupabase
    .from("organizations")
    .select("id")
    .eq("is_active", true)
    .is("suspended_at", null)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), ORG_BATCH_LIMIT));
  if (error) return [];
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

function toSnapshotRow(organizationId: string, result: OperationalScoreResult) {
  return {
    organization_id: organizationId,
    window_kind: SNAPSHOT_WINDOW_KIND,
    period_start: result.windowStart,
    period_end: result.windowEnd,
    score: result.eligible ? result.score : null,
    eligible: result.eligible,
    ineligibility_reason: result.eligible ? null : result.eligibilityReason,
    dimensions: result.dimensions,
    sample_items: result.eligibleItems,
    integrity_factor: result.integrityFactor,
    formula_version: result.formulaVersion,
    computed_at: result.computedAt,
  };
}

/**
 * يحسب ويخزّن لقطة لكل مكتب مؤهل. عزل الأخطاء لكل مكتب: فشل مكتب لا يوقف
 * البقية، ولا تُكتب لقطة جزئية عند الفشل، ولا يُسجَّل أي محتوى حساس في السجل.
 */
export async function generateOperationalScoreSnapshots(
  adminSupabase: Client,
  limit = ORG_BATCH_LIMIT,
): Promise<SnapshotRunResult> {
  const organizations = await eligibleOrganizations(adminSupabase, limit);
  let stored = 0;
  let failed = 0;

  for (const organizationId of organizations) {
    try {
      const result = await computeOrganizationScore(adminSupabase, adminSupabase, organizationId);
      const { error } = await adminSupabase
        .from(SNAPSHOTS_TABLE)
        .insert(toSnapshotRow(organizationId, result));
      if (error) throw new Error("snapshot_insert_failed");
      stored += 1;
    } catch {
      failed += 1;
      // لا معرّفات ولا بيانات تشغيلية في السجل — عدّاد فقط.
      console.error("[operational-score] snapshot failed for one organization");
    }
  }

  return { organizations: organizations.length, stored, failed };
}
