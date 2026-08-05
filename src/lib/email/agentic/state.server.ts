/**
 * حالة تكامل Hostinger Agentic Mail — تُخزَّن في `platform_settings` القائم.
 *
 * لا جدول جديد ولا أي قيمة سر: تُخزَّن نتائج الفحوص والعدّادات وأسماء
 * الأدوات المكتشفة فقط، وكل رسالة خطأ تُعقَّم قبل الحفظ.
 */
import {
  AGENTIC_OPERATIONS,
  READINESS_CHECKS,
  type AgenticOperation,
  type AgenticState,
  type CheckState,
  type ReadinessCheck,
} from "./agentic.shared";
import { agenticMcpUrl, agenticSecretPresent, redactAgentic } from "./mcp-client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const SETTINGS_KEY = "email_agentic_mail";

type StoredState = {
  enabled?: boolean;
  checks?: Partial<Record<ReadinessCheck, CheckState>>;
  operations?: Partial<Record<AgenticOperation, string | null>>;
  tools?: string[];
  lastTestAt?: string | null;
  lastSyncAt?: string | null;
  lastSendAt?: string | null;
  lastError?: { code: string; message: string; at: string } | null;
  latencyMs?: number | null;
  counters?: { imported?: number; sent?: number; syncErrors?: number; mailboxes?: number };
};

function emptyCheck(): CheckState {
  return { ok: false, at: null, detail: null };
}

function hydrate(stored: StoredState): AgenticState {
  const checks = Object.fromEntries(
    READINESS_CHECKS.map((check) => [check, stored.checks?.[check] ?? emptyCheck()]),
  ) as Record<ReadinessCheck, CheckState>;
  const operations = Object.fromEntries(
    AGENTIC_OPERATIONS.map((op) => [op, stored.operations?.[op] ?? null]),
  ) as Record<AgenticOperation, string | null>;
  return {
    enabled: stored.enabled === true,
    mcpUrl: agenticMcpUrl(),
    secretPresent: agenticSecretPresent(),
    checks,
    operations,
    tools: Array.isArray(stored.tools) ? stored.tools.slice(0, 100) : [],
    lastTestAt: stored.lastTestAt ?? null,
    lastSyncAt: stored.lastSyncAt ?? null,
    lastSendAt: stored.lastSendAt ?? null,
    lastError: stored.lastError ?? null,
    latencyMs: typeof stored.latencyMs === "number" ? stored.latencyMs : null,
    counters: {
      imported: stored.counters?.imported ?? 0,
      sent: stored.counters?.sent ?? 0,
      syncErrors: stored.counters?.syncErrors ?? 0,
      mailboxes: stored.counters?.mailboxes ?? 0,
    },
  };
}

export async function readAgenticState(db: Db): Promise<AgenticState> {
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  const stored =
    value && typeof value === "object" && !Array.isArray(value) ? (value as StoredState) : {};
  return hydrate(stored);
}

async function persist(db: Db, next: AgenticState): Promise<AgenticState> {
  const payload: StoredState = {
    enabled: next.enabled,
    checks: next.checks,
    operations: next.operations,
    tools: next.tools,
    lastTestAt: next.lastTestAt,
    lastSyncAt: next.lastSyncAt,
    lastSendAt: next.lastSendAt,
    lastError: next.lastError,
    latencyMs: next.latencyMs,
    counters: next.counters,
  };
  await db
    .from("platform_settings")
    .upsert({ key: SETTINGS_KEY, value: payload, is_public: false }, { onConflict: "key" });
  return next;
}

/** تحديث جزئي آمن: يقرأ الحالة الحالية ويدمج التغيير ثم يحفظ. */
export async function patchAgenticState(
  db: Db,
  patch: (current: AgenticState) => AgenticState,
): Promise<AgenticState> {
  const current = await readAgenticState(db);
  return persist(db, patch(current));
}

export async function markCheck(
  db: Db,
  check: ReadinessCheck,
  ok: boolean,
  detail: string | null,
): Promise<AgenticState> {
  const at = new Date().toISOString();
  return patchAgenticState(db, (state) => ({
    ...state,
    checks: { ...state.checks, [check]: { ok, at, detail: detail ? redactAgentic(detail) : null } },
  }));
}

export async function recordError(db: Db, code: string, message: string): Promise<AgenticState> {
  return patchAgenticState(db, (state) => ({
    ...state,
    lastError: { code, message: redactAgentic(message), at: new Date().toISOString() },
  }));
}

export async function bumpCounters(
  db: Db,
  delta: Partial<AgenticState["counters"]>,
): Promise<AgenticState> {
  return patchAgenticState(db, (state) => ({
    ...state,
    counters: {
      imported: state.counters.imported + (delta.imported ?? 0),
      sent: state.counters.sent + (delta.sent ?? 0),
      syncErrors: state.counters.syncErrors + (delta.syncErrors ?? 0),
      mailboxes: delta.mailboxes ?? state.counters.mailboxes,
    },
  }));
}
