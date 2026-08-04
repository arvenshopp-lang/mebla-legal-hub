/**
 * جدولة مزامنة Hostinger Agentic Mail — خادمية فقط.
 *
 * تعمل فقط بعد نجاح التفعيل، وبمنع تداخل (قفل على مستوى الجدولة إضافة إلى قفل
 * كل صندوق داخل محرّك المزامنة)، وبإعادة محاولة ذات تراجع أُسّي، وقاطع دائرة
 * يوقف الجدولة مؤقتاً بعد فشل متكرر، وإيقاف تلقائي وتنبيه عند تكرار فشل
 * المصادقة حتى لا نُواصل مناداة المزوّد برمز مرفوض.
 */
import { readAgenticState, patchAgenticState } from "./state.server";
import { redactAgentic } from "./mcp-client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const SCHEDULER_KEY = "email_agentic_mail_scheduler";
export const SYNC_INTERVAL_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const BREAKER_THRESHOLD = 5;
const AUTH_FAILURE_LIMIT = 3;
const RUN_LOCK_STALE_MS = 10 * 60_000;

const AUTH_CODES = new Set(["unauthorized", "forbidden", "secret_missing", "auth_failed"]);

export type SchedulerState = {
  enabled: boolean;
  runningSince: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailures: number;
  authFailures: number;
  breakerOpenUntil: string | null;
  haltedReason: string | null;
  lastOutcome: { mailboxes: number; ingested: number; duplicates: number; failed: number } | null;
};

function empty(): SchedulerState {
  return {
    enabled: false,
    runningSince: null,
    lastRunAt: null,
    nextRunAt: null,
    consecutiveFailures: 0,
    authFailures: 0,
    breakerOpenUntil: null,
    haltedReason: null,
    lastOutcome: null,
  };
}

export async function readScheduler(db: Db): Promise<SchedulerState> {
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", SCHEDULER_KEY)
    .maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { ...empty(), ...(stored as Partial<SchedulerState>) };
}

async function writeScheduler(db: Db, next: SchedulerState): Promise<SchedulerState> {
  await db
    .from("platform_settings")
    .upsert({ key: SCHEDULER_KEY, value: next, is_public: false }, { onConflict: "key" });
  return next;
}

export async function patchScheduler(
  db: Db,
  patch: Partial<SchedulerState>,
): Promise<SchedulerState> {
  const current = await readScheduler(db);
  return writeScheduler(db, { ...current, ...patch });
}

/** تُستدعى عند تفعيل التكامل: تبدأ الجدولة من حالة نظيفة. */
export async function armScheduler(db: Db): Promise<SchedulerState> {
  return patchScheduler(db, {
    enabled: true,
    consecutiveFailures: 0,
    authFailures: 0,
    breakerOpenUntil: null,
    haltedReason: null,
    runningSince: null,
    nextRunAt: new Date(Date.now() + SYNC_INTERVAL_MS).toISOString(),
  });
}

/** تُستدعى عند تعطيل التكامل: توقف الجدولة فوراً. */
export async function disarmScheduler(db: Db, reason: string): Promise<SchedulerState> {
  return patchScheduler(db, {
    enabled: false,
    runningSince: null,
    nextRunAt: null,
    haltedReason: redactAgentic(reason).slice(0, 200),
  });
}

/** إعادة تعيين قاطع الدائرة بعد معالجة سبب الفشل (صلاحية إعادة المحاولة). */
export async function resetBreaker(db: Db): Promise<SchedulerState> {
  return patchScheduler(db, {
    consecutiveFailures: 0,
    authFailures: 0,
    breakerOpenUntil: null,
    haltedReason: null,
    runningSince: null,
    nextRunAt: new Date().toISOString(),
  });
}

function backoffMs(failures: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS);
}

export type ScheduledRun =
  | { ran: false; reason: string; state: SchedulerState }
  | {
      ran: true;
      state: SchedulerState;
      outcome: { mailboxes: number; ingested: number; duplicates: number; failed: number };
    };

/**
 * دورة مجدولة واحدة. لا تعمل إن كان التكامل غير مُفعّل، أو القاطع مفتوحاً، أو
 * توجد دورة جارية، أو لم يحن موعد التشغيل بعد.
 */
export async function runScheduledAgenticSync(db: Db): Promise<ScheduledRun> {
  const integration = await readAgenticState(db);
  let state = await readScheduler(db);

  if (!integration.enabled) return { ran: false, reason: "integration_disabled", state };
  if (state.haltedReason) return { ran: false, reason: "halted", state };
  if (!state.enabled) state = await patchScheduler(db, { enabled: true });

  const now = Date.now();
  if (state.breakerOpenUntil && Date.parse(state.breakerOpenUntil) > now) {
    return { ran: false, reason: "breaker_open", state };
  }
  if (state.runningSince && now - Date.parse(state.runningSince) < RUN_LOCK_STALE_MS) {
    return { ran: false, reason: "already_running", state };
  }
  if (state.nextRunAt && Date.parse(state.nextRunAt) > now) {
    return { ran: false, reason: "not_due", state };
  }

  state = await patchScheduler(db, { runningSince: new Date().toISOString() });

  try {
    const { syncAllAgenticMailboxes } = await import("./provider.server");
    const outcomes = await syncAllAgenticMailboxes(db, "cron");
    const failures = outcomes.filter((o) => o.error);
    const authFailed = failures.some((o) => AUTH_CODES.has(o.error?.code ?? ""));
    const outcome = {
      mailboxes: outcomes.length,
      ingested: outcomes.reduce((sum, o) => sum + o.ingested, 0),
      duplicates: outcomes.reduce((sum, o) => sum + o.duplicates, 0),
      failed: failures.length,
    };

    if (failures.length === 0) {
      const next = await patchScheduler(db, {
        runningSince: null,
        lastRunAt: new Date().toISOString(),
        nextRunAt: new Date(Date.now() + SYNC_INTERVAL_MS).toISOString(),
        consecutiveFailures: 0,
        authFailures: 0,
        breakerOpenUntil: null,
        lastOutcome: outcome,
      });
      return { ran: true, state: next, outcome };
    }

    const consecutiveFailures = state.consecutiveFailures + 1;
    const authFailures = authFailed ? state.authFailures + 1 : 0;
    const halt = authFailures >= AUTH_FAILURE_LIMIT;

    if (halt) {
      await patchAgenticState(db, (s) => ({ ...s, enabled: false }));
      const next = await patchScheduler(db, {
        enabled: false,
        runningSince: null,
        lastRunAt: new Date().toISOString(),
        nextRunAt: null,
        consecutiveFailures,
        authFailures,
        lastOutcome: outcome,
        haltedReason:
          "تكرار فشل المصادقة مع Hostinger — أُوقف التكامل تلقائياً حتى تدوير المفتاح وإعادة الاختبار.",
      });
      await notifyHalt(db, next.haltedReason ?? "");
      return { ran: true, state: next, outcome };
    }

    const next = await patchScheduler(db, {
      runningSince: null,
      lastRunAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + backoffMs(consecutiveFailures)).toISOString(),
      consecutiveFailures,
      authFailures,
      lastOutcome: outcome,
      breakerOpenUntil:
        consecutiveFailures >= BREAKER_THRESHOLD
          ? new Date(Date.now() + MAX_BACKOFF_MS).toISOString()
          : null,
    });
    return { ran: true, state: next, outcome };
  } catch (error) {
    const consecutiveFailures = state.consecutiveFailures + 1;
    const next = await patchScheduler(db, {
      runningSince: null,
      lastRunAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + backoffMs(consecutiveFailures)).toISOString(),
      consecutiveFailures,
      breakerOpenUntil:
        consecutiveFailures >= BREAKER_THRESHOLD
          ? new Date(Date.now() + MAX_BACKOFF_MS).toISOString()
          : null,
    });
    const message = redactAgentic(error instanceof Error ? error.message : String(error));
    await patchAgenticState(db, (s) => ({
      ...s,
      lastError: { code: "scheduled_sync_failed", message: message.slice(0, 300), at: new Date().toISOString() },
    }));
    return { ran: false, reason: "sync_failed", state: next };
  }
}

/** تنبيه فريق المنصة عند الإيقاف التلقائي — بلا أي قيمة سر. */
async function notifyHalt(db: Db, reason: string): Promise<void> {
  try {
    await db.from("system_failures").insert({
      area: "email_agentic_mail",
      severity: "high",
      title: "إيقاف تلقائي لتكامل Hostinger Agentic Mail",
      detail: reason,
    });
  } catch {
    // التنبيه لا يجوز أن يُفشل الجدولة نفسها.
  }
}
