/**
 * نبضات المهام الدورية.
 *
 * كل مهمة مجدولة تُسجّل بدء التشغيل ونتيجته، فتصبح حالتها قابلة للقياس بدل
 * الاستنتاج. لا يرمي أبداً: فشل تسجيل النبضة لا يجوز أن يُسقط المهمة نفسها.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export async function startJobRun(db: Db, jobKey: string): Promise<void> {
  try {
    await db
      .from("platform_job_heartbeats")
      .update({ last_started_at: new Date().toISOString(), last_status: "running" })
      .eq("job_key", jobKey);
  } catch {
    /* الرصد لا يُسقط المهمة */
  }
}

export async function finishJobRun(
  db: Db,
  jobKey: string,
  result: { ok: boolean; durationMs: number; errorCode?: string | null },
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data: current } = await db
      .from("platform_job_heartbeats")
      .select("consecutive_failures, runs_total")
      .eq("job_key", jobKey)
      .maybeSingle();

    await db
      .from("platform_job_heartbeats")
      .update({
        last_status: result.ok ? "ok" : "failed",
        last_duration_ms: Math.max(0, Math.round(result.durationMs)),
        last_error_code: result.ok ? null : (result.errorCode ?? "job_failed").slice(0, 60),
        runs_total: (current?.runs_total ?? 0) + 1,
        consecutive_failures: result.ok ? 0 : (current?.consecutive_failures ?? 0) + 1,
        ...(result.ok ? { last_success_at: now } : { last_failure_at: now }),
      })
      .eq("job_key", jobKey);
  } catch {
    /* الرصد لا يُسقط المهمة */
  }
}

/**
 * يغلّف تشغيل مهمة دورية بنبضة كاملة، ويفتح حادثة عند فشل التشغيل.
 * يُعيد نتيجة المهمة كما هي، ويعيد رفع أي استثناء بعد تسجيل النبضة.
 */
export async function withJobHeartbeat<T>(
  jobKey: string,
  run: () => Promise<T>,
): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const started = Date.now();
  await startJobRun(supabaseAdmin, jobKey);
  try {
    const result = await run();
    await finishJobRun(supabaseAdmin, jobKey, { ok: true, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    await finishJobRun(supabaseAdmin, jobKey, {
      ok: false,
      durationMs: Date.now() - started,
      errorCode: "job_run_failed",
    });
    const { recordIncident } = await import("@/lib/observability/incidents.server");
    await recordIncident(supabaseAdmin, {
      source: "job",
      surface: jobKey,
      action: "job_run_failed",
      errorCode: "job_run_failed",
      title: `فشل تشغيل المهمة الدورية «${jobKey}»`,
      severity: "high",
      metadata: { job_key: jobKey, duration_ms: Date.now() - started },
    });
    throw error;
  }
}