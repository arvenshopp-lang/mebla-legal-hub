/**
 * معايرة بوابة نزاهة الظهور العام — تشغيل قراءة فقط (CALIBRATION DRY RUN).
 *
 * ضمانات صارمة:
 * - قراءة فقط: لا لقطات، لا كتابة، لا تعديل إعدادات، لا تفعيل ميزة.
 * - التقرير مجمّع فقط: لا أسماء مكاتب ولا معرّفات ولا أي محتوى تشغيلي أو قانوني.
 * - التشغيل: bun run score:integrity:dryrun [عدد المكاتب]
 */

import { createClient } from "@supabase/supabase-js";
import { computeOrganizationScoreWithIntegrity } from "@/lib/operational-score/score.server";
import {
  INTEGRITY_MODEL_VERSION,
  MIN_ACTIVE_DAYS_IN_90,
  type IntegrityReasonCode,
  type PublicIntegrityStatus,
} from "@/lib/operational-score/integrity.shared";

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("مطلوب SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في البيئة.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limit = Math.min(Math.max(Number(process.argv[2] ?? 50) || 50, 1), 200);

async function main(): Promise<void> {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("is_active", true)
    .is("suspended_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("تعذّر قراءة قائمة المكاتب.");
    process.exit(1);
  }

  const organizations = (data ?? []) as Array<{ id: string }>;
  const statusCounts: Record<PublicIntegrityStatus, number> = {
    pass: 0,
    review_required: 0,
    ineligible: 0,
  };
  const reasonCounts = new Map<IntegrityReasonCode, number>();
  const activeDaysBuckets = { "0-4": 0, "5-11": 0, "12-29": 0, "30+": 0 };
  let scored = 0;
  let failed = 0;

  for (const org of organizations) {
    try {
      const { result, integrity } = await computeOrganizationScoreWithIntegrity(
        admin,
        admin,
        org.id,
      );
      statusCounts[integrity.status] += 1;
      for (const code of integrity.reasonCodes) {
        reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
      }
      const days = integrity.activeDays;
      if (days < 5) activeDaysBuckets["0-4"] += 1;
      else if (days < MIN_ACTIVE_DAYS_IN_90) activeDaysBuckets["5-11"] += 1;
      else if (days < 30) activeDaysBuckets["12-29"] += 1;
      else activeDaysBuckets["30+"] += 1;
      if (result.eligible) scored += 1;
    } catch {
      failed += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        modelVersion: INTEGRITY_MODEL_VERSION,
        minActiveDays: MIN_ACTIVE_DAYS_IN_90,
        organizationsEvaluated: organizations.length,
        baseEligibleOrganizations: scored,
        readFailures: failed,
        statusCounts,
        activeDaysBuckets,
        reasonCodeCounts: Object.fromEntries([...reasonCounts.entries()].sort((a, b) => b[1] - a[1])),
        note: "قراءة فقط — لم تُنشأ أي لقطة ولم تُعدَّل أي بيانات.",
      },
      null,
      2,
    ),
  );
}

void main();