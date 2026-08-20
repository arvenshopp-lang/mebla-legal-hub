import type { Db as SupabaseDb } from "@/lib/supabase-db.shared";
/**
 * مزوّد Hostinger Agentic Mail داخل مركز البريد القائم — خادمي فقط.
 *
 * لا جداول رسائل أو محادثات أو مرفقات جديدة: كل رسالة واردة تمر من
 * `ingestInbound` الحالي (تنقية HTML، تفرّد بـ Message-ID، حجر المرفقات)
 * ثم تُربط بمركز الدعم عبر `linkInboundToTicket`. المزامنة تزايدية وقابلة
 * للاستئناف وبقفل يمنع دورتين لنفس الصندوق، وتُسجَّل في `email_sync_runs`.
 *
 * كل عملية غير مدعومة من الأدوات المكتشفة تُعاد كـ«غير مدعومة» بلا نتيجة
 * وهمية، ليبقى مسار SMTP/IMAP الحالي هو البديل العامل.
 */
import {
  bindArgs,
  mapCapabilities,
  mapRestCapabilities,
  type CapabilityMap,
} from "./capabilities.server";
import { AgenticMailError, callTool, listTools, redactAgentic } from "./mcp-client.server";
import {
  isRestProxy,
  listRestOperations,
  restInvoke,
  restSupportedOperations,
} from "./rest-adapter.server";
import { readAgenticState } from "./state.server";
import { AGENTIC_OPERATIONS, type AgenticOperation } from "./agentic.shared";

type Db = SupabaseDb;

const PROVIDER = "agentic_mail";
const SYNC_PAGE_LIMIT = 15;
const LOCK_STALE_MS = 5 * 60_000;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export class UnsupportedOperationError extends Error {
  code = "operation_unsupported";
  operation: AgenticOperation;
  constructor(operation: AgenticOperation) {
    super(`العملية «${operation}» غير مدعومة من أدوات Hostinger Agentic Mail المكتشفة.`);
    this.operation = operation;
  }
}

export function newCorrelationId(prefix = "agm"): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

/* ------------------------------------------------- اكتشاف الأدوات */

let cache: { map: CapabilityMap; at: number } | null = null;
let restSupport = new Set<AgenticOperation>();

export async function discoverCapabilities(
  correlationId: string,
  force = false,
): Promise<CapabilityMap> {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache.map;
  const tools = await listTools(correlationId);
  let map: CapabilityMap;
  if (isRestProxy(tools)) {
    // خادم Hostinger يعرض وكيل REST؛ تُشتق القدرات من عمليات OpenAPI الفعلية.
    const operations = await listRestOperations(correlationId);
    const supported = restSupportedOperations(operations);
    restSupport = supported;
    const ids = Object.fromEntries(
      AGENTIC_OPERATIONS.map((op) => [op, supported.has(op) ? op : null]),
    ) as Record<AgenticOperation, string | null>;
    map = mapRestCapabilities(tools, supported, ids);
  } else {
    restSupport = new Set();
    map = mapCapabilities(tools);
  }
  cache = { map, at: Date.now() };
  return map;
}

async function toolFor(operation: AgenticOperation, correlationId: string) {
  const map = await discoverCapabilities(correlationId);
  const tool = map.byOperation[operation];
  if (!tool) throw new UnsupportedOperationError(operation);
  return tool;
}

/** تنفيذ عملية قياسية عبر أداتها المكتشفة، مع ربط المعاملات بمخططها الفعلي. */
export async function invoke(
  operation: AgenticOperation,
  canonical: Record<string, unknown>,
  correlationId: string,
): Promise<{ json: unknown | null; text: string; latencyMs: number; requestId: string }> {
  const map = await discoverCapabilities(correlationId);
  if (map.restMode) {
    if (!restSupport.has(operation)) throw new UnsupportedOperationError(operation);
    return restInvoke(operation, canonical, correlationId, restSupport);
  }
  const tool = await toolFor(operation, correlationId);
  const bound = bindArgs(tool, canonical);
  if (!bound.ok) {
    throw new AgenticMailError(
      "argument_mismatch",
      `أداة المزوّد «${tool.name}» تطلب معاملات لا يوفّرها هذا السياق: ${bound.missing.join(", ")}`,
      null,
      correlationId,
    );
  }
  const result = await callTool(tool.name, bound.args, { correlationId });
  if (result.isError) {
    throw new AgenticMailError(
      "tool_error",
      redactAgentic(result.text.slice(0, 300)) || "رفض المزوّد تنفيذ الأداة.",
      null,
      result.requestId,
    );
  }
  return {
    json: result.json,
    text: result.text,
    latencyMs: result.latencyMs,
    requestId: result.requestId,
  };
}

/* ------------------------------------------------- تطبيع الاستجابات */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const ARRAY_KEYS = [
  "messages",
  "emails",
  "items",
  "data",
  "results",
  "records",
  "mailboxes",
  "accounts",
  "list",
];

/** استخراج مصفوفة العناصر من استجابة غير معروفة الشكل مسبقاً. */
export function extractList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload))
    return payload.filter((v): v is Record<string, unknown> => Boolean(asRecord(v)));
  const root = asRecord(payload);
  if (!root) return [];
  for (const key of ARRAY_KEYS) {
    const value = root[key];
    if (Array.isArray(value))
      return value.filter((v): v is Record<string, unknown> => Boolean(asRecord(v)));
  }
  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (nested) {
      for (const key of ARRAY_KEYS) {
        if (Array.isArray(nested[key])) {
          return (nested[key] as unknown[]).filter((v): v is Record<string, unknown> =>
            Boolean(asRecord(v)),
          );
        }
      }
    }
  }
  return [];
}

export function extractCursor(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  for (const key of [
    "nextCursor",
    "next_cursor",
    "cursor",
    "nextPageToken",
    "next_page_token",
    "next",
  ]) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  const lowered = new Map(
    Object.keys(row).map((k) => [k.toLowerCase().replace(/[^a-z0-9]/g, ""), k]),
  );
  for (const key of keys) {
    const match = lowered.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (match) {
      const value = row[match];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  const record = asRecord(value);
  if (record) {
    const inner = pick(record, ["address", "email", "value", "name", "id"]);
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

function addressList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;]/)
      : [value];
  return raw
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry && entry.includes("@")))
    .map((entry) => {
      const match = /<([^>]+)>/.exec(entry);
      return (match?.[1] ?? entry).trim().toLowerCase();
    })
    .slice(0, 50);
}

export type NormalizedMessage = {
  providerId: string | null;
  messageId: string | null;
  subject: string;
  fromAddress: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  deliveredTo: string[];
  html: string | null;
  text: string | null;
  date: string | null;
  inReplyTo: string | null;
  references: string[];
  unread: boolean | null;
  attachments: { fileName: string; contentBase64: string | null; attachmentId: string | null }[];
};

/** تطبيع رسالة مزوّد إلى الشكل الذي يفهمه محرك البريد الحالي. */
export function normalizeMessage(row: Record<string, unknown>): NormalizedMessage {
  const fromRaw = pick(row, ["from", "from_address", "sender", "fromEmail", "from_email"]);
  const fromRecord = asRecord(fromRaw);
  const fromAddressRaw = asString(fromRecord ? pick(fromRecord, ["address", "email"]) : fromRaw);
  const fromAddress = fromAddressRaw
    ? (/<([^>]+)>/.exec(fromAddressRaw)?.[1] ?? fromAddressRaw).trim().toLowerCase()
    : null;
  const fromName =
    asString(
      fromRecord
        ? pick(fromRecord, ["name", "display_name"])
        : pick(row, ["from_name", "sender_name"]),
    ) ??
    (fromAddressRaw && fromAddressRaw.includes("<")
      ? fromAddressRaw.split("<")[0]!.trim() || null
      : null);

  const referencesRaw = pick(row, ["references", "reference_ids"]);
  const references = Array.isArray(referencesRaw)
    ? referencesRaw.map((r) => asString(r)).filter((r): r is string => Boolean(r))
    : typeof referencesRaw === "string"
      ? referencesRaw.split(/\s+/).filter(Boolean)
      : [];

  const attachmentsRaw = pick(row, ["attachments", "files"]);
  const attachments = (Array.isArray(attachmentsRaw) ? attachmentsRaw : [])
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      fileName: asString(pick(entry, ["filename", "file_name", "name", "title"])) ?? "attachment",
      contentBase64: asString(
        pick(entry, ["content_base64", "contentBase64", "content", "data", "base64"]),
      ),
      attachmentId: asString(pick(entry, ["attachment_id", "id", "part_id", "partId"])),
    }))
    .slice(0, MAX_ATTACHMENTS_PER_MESSAGE);

  const unreadRaw = pick(row, ["unread", "unseen", "is_unread", "isUnread"]);
  const readRaw = pick(row, ["read", "seen", "is_read", "isRead"]);
  const unread =
    typeof unreadRaw === "boolean" ? unreadRaw : typeof readRaw === "boolean" ? !readRaw : null;

  return {
    providerId: asString(
      pick(row, ["id", "uid", "message_uid", "provider_id", "email_id", "mail_id"]),
    ),
    messageId: asString(
      pick(row, ["message_id", "messageId", "rfc822_message_id", "internet_message_id"]),
    ),
    subject: asString(pick(row, ["subject", "title"])) ?? "(بلا عنوان)",
    fromAddress,
    fromName,
    to: addressList(pick(row, ["to", "to_addresses", "recipients"])),
    cc: addressList(pick(row, ["cc", "cc_addresses"])),
    deliveredTo: [
      ...addressList(pick(row, ["delivered_to", "deliveredTo", "x_original_to", "envelope_to"])),
    ],
    html: asString(pick(row, ["html", "html_body", "body_html", "htmlContent"])),
    text: asString(
      pick(row, ["text", "text_body", "body_text", "plain_text", "snippet", "body", "content"]),
    ),
    date: asString(
      pick(row, ["date", "received_at", "internal_date", "created_at", "timestamp", "sent_at"]),
    ),
    inReplyTo: asString(pick(row, ["in_reply_to", "inReplyTo"])),
    references,
    unread,
    attachments,
  };
}

/* ------------------------------------------------- الصناديق والربط */

/** دمج تفاصيل الرسالة الكاملة فوق المختصرة بلا فقدان قيمة موجودة. */
function mergeMessage(base: NormalizedMessage, detail: NormalizedMessage): NormalizedMessage {
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    merged[key] = value;
  }
  return merged as unknown as NormalizedMessage;
}

export type ProviderMailbox = {
  id: string;
  address: string;
  displayName: string | null;
  unread: number | null;
};

/** اكتشاف صناديق Hostinger الفعلية. لا يُنشئ أي صندوق داخل مِهلة. */
export async function discoverProviderMailboxes(correlationId: string): Promise<ProviderMailbox[]> {
  const outcome = await invoke("listMailboxes", { limit: 100 }, correlationId);
  return extractList(outcome.json ?? outcome.text)
    .map((row) => {
      const address = asString(pick(row, ["address", "email", "mailbox", "name", "id"]));
      if (!address || !address.includes("@")) return null;
      const unread = pick(row, ["unread", "unread_count", "unseen"]);
      return {
        id:
          asString(pick(row, ["resource_id", "mailbox_resource_id", "id", "mailbox_id", "uuid"])) ??
          address.toLowerCase(),
        address: address.toLowerCase(),
        displayName: asString(pick(row, ["display_name", "name", "label"])),
        unread: typeof unread === "number" ? unread : null,
      } satisfies ProviderMailbox;
    })
    .filter((entry): entry is ProviderMailbox => Boolean(entry));
}

export type LinkOutcome = {
  linked: number;
  missing: number;
  aliased: number;
  unmatched: string[];
};

/**
 * ربط صناديق مِهلة الموجودة بصناديق Hostinger المكتشفة.
 * الصندوق الذي لا يقابله صندوق فعلي عند المزوّد يُعلَّم «غير موجود» بوضوح،
 * والصندوق الموجود عند المزوّد بلا نظير محلي يُعاد كغير مرتبط دون إنشائه.
 */
export async function linkMailboxes(db: Db, correlationId: string): Promise<LinkOutcome> {
  const provider = await discoverProviderMailboxes(correlationId);
  const { data } = await db.from("email_mailboxes").select("id, address, type");
  const local = ((data ?? []) as { id: string; address: string; type: string }[]).map((row) => ({
    id: row.id,
    address: row.address.toLowerCase(),
    type: row.type,
  }));

  let linked = 0;
  let missing = 0;
  let aliased = 0;
  for (const box of local) {
    const match = provider.find((p) => p.address === box.address);
    if (match) {
      linked += 1;
      await db
        .from("email_mailboxes")
        .update({
          agentic_mailbox_id: match.id,
          agentic_link_status: "linked",
          agentic_unread_count: match.unread ?? 0,
          agentic_last_error: null,
        })
        .eq("id", box.id);
      continue;
    }
    // عنوان غير موجود عند المزوّد وليس صندوقاً حقيقياً ⇒ اسم مستعار منطقي
    // يُسلَّم إلى الحساب الحقيقي؛ ليس خللاً ولا يُزامن باستقلال.
    if (box.type === "human") {
      aliased += 1;
      await db
        .from("email_mailboxes")
        .update({
          agentic_link_status: "alias",
          agentic_mailbox_id: null,
          sync_enabled: false,
          agentic_last_error: null,
        })
        .eq("id", box.id);
    } else {
      missing += 1;
      await db
        .from("email_mailboxes")
        .update({ agentic_link_status: "missing", agentic_mailbox_id: null })
        .eq("id", box.id);
    }
  }

  const unmatched = provider
    .filter((p) => !local.some((box) => box.address === p.address))
    .map((p) => p.address);

  return { linked, missing, aliased, unmatched };
}

/* ------------------------------------------------- المزامنة */

export type AgenticSyncOutcome = {
  mailboxId: string;
  address: string;
  folder: string;
  fetched: number;
  ingested: number;
  duplicates: number;
  rejected: number;
  ticketsCreated: number;
  attachmentsSkipped: number;
  cursor: string | null;
  dryRun: boolean;
  durationMs: number;
  error: { code: string; message: string } | null;
};

export type AgenticTarget = {
  id: string;
  address: string;
  type: string;
  providerMailboxId: string | null;
  linkStatus: string;
  syncEnabled: boolean;
  inboundEnabled: boolean;
  isActive: boolean;
};

/**
 * الصناديق المؤهلة للمزامنة.
 *
 * تشمل الصناديق البشرية، وكذلك الحساب الحقيقي (`type = 'system'`) عندما يكون
 * مرتبطاً فعلياً عند المزوّد: في إعداد Hostinger الحالي تُسلَّم رسائل الأسماء
 * المستعارة إلى هذا الحساب، ثم تُوجَّه بالترويسات إلى الصندوق المنطقي. الحساب
 * الحقيقي مصدر سحب فقط ولا تُستوعب رسالة تحته أبداً.
 */
export async function agenticTargets(db: Db, mailboxId?: string): Promise<AgenticTarget[]> {
  let query = db
    .from("email_mailboxes")
    .select(
      "id, address, type, agentic_mailbox_id, agentic_link_status, sync_enabled, inbound_enabled, is_active",
    )
    .order("sort_order", { ascending: true });
  if (mailboxId) query = query.eq("id", mailboxId);
  const { data } = await query;
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => String(row.type) !== "system" || Boolean(row.agentic_mailbox_id))
    .map((row) => ({
      id: String(row.id),
      address: String(row.address),
      type: String(row.type),
      providerMailboxId: row.agentic_mailbox_id ? String(row.agentic_mailbox_id) : null,
      linkStatus: String(row.agentic_link_status ?? "unlinked"),
      syncEnabled: row.sync_enabled === true,
      inboundEnabled: row.inbound_enabled === true,
      isActive: row.is_active === true,
    }));
}

async function acquireState(
  db: Db,
  mailboxId: string,
  folder: string,
): Promise<{ id: string; cursor: string | null } | null> {
  const { data } = await db
    .from("email_sync_state")
    .select("id, provider_cursor, locked_at")
    .eq("mailbox_id", mailboxId)
    .eq("provider", PROVIDER)
    .eq("folder", folder)
    .maybeSingle();
  const row = data as {
    id: string;
    provider_cursor: string | null;
    locked_at: string | null;
  } | null;
  if (row) {
    const locked = row.locked_at ? Date.parse(row.locked_at) : 0;
    if (locked && Date.now() - locked < LOCK_STALE_MS) return null;
    return { id: row.id, cursor: row.provider_cursor };
  }
  const { data: created, error } = await db
    .from("email_sync_state")
    .insert({
      mailbox_id: mailboxId,
      provider: PROVIDER,
      folder,
      local_folder: "inbox",
      status: "idle",
    })
    .select("id")
    .single();
  if (error) return null;
  return { id: (created as { id: string }).id, cursor: null };
}

function isoOf(value: string | null): string {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

/**
 * مزامنة مجلد واحد. تزايدية بمؤشر المزوّد، Idempotent عبر Message-ID،
 * قابلة للاستئناف، وبقفل يمنع دورتين متزامنتين لنفس الصندوق والمجلد.
 * في الوضع التجريبي (dryRun) لا يُحفظ المؤشر ولا تُستوعب أي رسالة.
 */
export async function syncAgenticFolder(
  db: Db,
  target: AgenticTarget,
  folder: string,
  options: { triggerSource: "manual" | "cron"; dryRun?: boolean; correlationId?: string },
): Promise<AgenticSyncOutcome> {
  const started = Date.now();
  const correlationId = options.correlationId ?? newCorrelationId("sync");
  const dryRun = options.dryRun === true;
  const base: AgenticSyncOutcome = {
    mailboxId: target.id,
    address: target.address,
    folder,
    fetched: 0,
    ingested: 0,
    duplicates: 0,
    rejected: 0,
    ticketsCreated: 0,
    attachmentsSkipped: 0,
    cursor: null,
    dryRun,
    durationMs: 0,
    error: null,
  };

  const finish = async (outcome: AgenticSyncOutcome): Promise<AgenticSyncOutcome> => {
    const result = { ...outcome, durationMs: Date.now() - started };
    await db.from("email_sync_runs").insert({
      mailbox_id: target.id,
      provider: PROVIDER,
      folder: dryRun ? `${folder} (تجريبي)` : folder,
      trigger_source: options.triggerSource,
      outcome: result.error ? "failed" : "success",
      fetched: result.fetched,
      ingested: result.ingested,
      duplicates: result.duplicates,
      rejected: result.rejected,
      tickets_created: result.ticketsCreated,
      reindexed: false,
      error_code: result.error?.code ?? null,
      error_message: result.error ? redactAgentic(result.error.message).slice(0, 500) : null,
      duration_ms: result.durationMs,
    });
    return result;
  };

  if (target.linkStatus !== "linked" || !target.providerMailboxId) {
    return finish({
      ...base,
      error: { code: "mailbox_unlinked", message: "الصندوق غير مرتبط بصندوق فعلي عند Hostinger." },
    });
  }
  // الحساب الحقيقي مصدر سحب: الاستقبال يُفعَّل على الصندوق المنطقي لا عليه،
  // فلا يُشترط `inbound_enabled` عليه؛ يبقى الاشتراط على الصناديق البشرية.
  const inboundGate = target.type === "system" ? true : target.inboundEnabled;
  if (!dryRun && (!target.isActive || !inboundGate || !target.syncEnabled)) {
    return finish({
      ...base,
      error: { code: "sync_disabled", message: "المزامنة أو الاستقبال معطّل لهذا الصندوق." },
    });
  }

  const state = await acquireState(db, target.id, folder);
  if (!state) {
    return finish({
      ...base,
      error: { code: "sync_locked", message: "توجد دورة مزامنة جارية لهذا المجلد." },
    });
  }

  const lockToken = crypto.randomUUID();
  await db
    .from("email_sync_state")
    .update({ status: "syncing", locked_at: new Date().toISOString(), lock_token: lockToken })
    .eq("id", state.id);

  const release = async (patch: Record<string, unknown>) => {
    await db
      .from("email_sync_state")
      .update({
        locked_at: null,
        lock_token: null,
        last_sync_at: new Date().toISOString(),
        ...patch,
      })
      .eq("id", state.id);
  };

  try {
    const listed = await invoke(
      "listMessages",
      {
        mailbox: target.providerMailboxId,
        folder,
        limit: SYNC_PAGE_LIMIT,
        cursor: state.cursor ?? undefined,
      },
      correlationId,
    );
    const rows = extractList(listed.json ?? listed.text);
    const nextCursor = extractCursor(listed.json);

    const { ingestInbound } = await import("@/lib/email/workspace.server");
    const { linkInboundToTicket } = await import("@/lib/support/ingest.server");
    const { inboundAliasAddresses, routeInboundAddress } =
      await import("@/lib/email/routing.server");
    // Aliases منطقية فقط: القسم يُحدَّد من ترويسات التسليم لا من الصندوق الحقيقي.
    const aliases = await inboundAliasAddresses(db);

    let ingested = 0;
    let duplicates = 0;
    let rejected = 0;
    let ticketsCreated = 0;
    let attachmentsSkipped = 0;

    for (const row of rows) {
      let message = normalizeMessage(row);

      // الرسالة المختصرة تُكمَّل بنداء قراءة كامل عند توفر أداته.
      if ((!message.html && !message.text) || !message.messageId) {
        const identifier = message.providerId ?? message.messageId;
        if (identifier) {
          try {
            const full = await invoke(
              "getMessage",
              { mailbox: target.providerMailboxId, folder, messageId: identifier },
              correlationId,
            );
            const detail = extractList(full.json)[0] ?? asRecord(full.json) ?? null;
            if (detail) message = mergeMessage(message, normalizeMessage(detail));
          } catch (error) {
            if (!(error instanceof UnsupportedOperationError)) throw error;
          }
        }
      }

      if (!message.fromAddress || !message.fromAddress.includes("@")) {
        rejected += 1;
        continue;
      }
      if (dryRun) {
        // الوضع التجريبي يتحقق من القراءة والتطبيع فقط: لا استيعاب ولا تذاكر.
        continue;
      }

      const attachments: { file_name: string; content_base64: string }[] = [];
      for (const item of message.attachments) {
        if (item.contentBase64) {
          attachments.push({ file_name: item.fileName, content_base64: item.contentBase64 });
          continue;
        }
        if (!item.attachmentId) {
          attachmentsSkipped += 1;
          continue;
        }
        try {
          const downloaded = await invoke(
            "downloadAttachment",
            {
              mailbox: target.providerMailboxId,
              folder,
              messageId: message.providerId ?? message.messageId,
              attachmentId: item.attachmentId,
            },
            correlationId,
          );
          const record = asRecord(downloaded.json) ?? {};
          const content = asString(pick(record, ["content_base64", "content", "data", "base64"]));
          if (content) attachments.push({ file_name: item.fileName, content_base64: content });
          else attachmentsSkipped += 1;
        } catch {
          // لا يُحفظ أي رابط مؤقت من المزوّد كبديل: المرفق يُتجاهل ويُحتسب.
          attachmentsSkipped += 1;
        }
      }

      try {
        const routedAddress = routeInboundAddress(
          aliases,
          { deliveredTo: message.deliveredTo, to: message.to, cc: message.cc },
          target.address,
        ).address;
        // الحساب الحقيقي مصدر سحب فقط: بلا Alias مطابق لا تُستوعب الرسالة.
        if (target.type === "system" && routedAddress === target.address) {
          rejected += 1;
          continue;
        }
        const result = await ingestInbound(db, {
          to: routedAddress,
          from: message.fromAddress,
          fromName: message.fromName,
          subject: message.subject,
          html: message.html,
          text: message.text,
          messageId: message.messageId,
          inReplyTo: message.inReplyTo,
          references: message.references,
          receivedAt: isoOf(message.date),
          attachments,
        });
        if (result.duplicate) duplicates += 1;
        else ingested += 1;
        rejected += result.attachmentsRejected;

        if (!result.duplicate) {
          const linked = await linkInboundToTicket(db, {
            mailboxId: result.mailboxId,
            threadId: result.threadId,
            emailMessageId: result.messageId,
            recipient: routedAddress,
            from: message.fromAddress,
            fromName: message.fromName,
            subject: message.subject,
            body: (message.text ?? message.html ?? "").slice(0, 20_000),
            providerMessageId: message.messageId ?? message.providerId ?? null,
            duplicate: false,
            source: "agentic",
          });
          if (linked.outcome === "created") ticketsCreated += 1;
        }
      } catch {
        rejected += 1;
      }
    }

    if (dryRun) {
      await release({ status: "idle" });
      return finish({ ...base, fetched: rows.length, cursor: nextCursor });
    }

    await release({
      status: "idle",
      provider_cursor: nextCursor ?? state.cursor,
      provider_folder_id: target.providerMailboxId,
      attempts: 0,
      last_error: null,
      last_error_code: null,
      last_success_at: new Date().toISOString(),
      new_messages: ingested,
    });
    await db
      .from("email_mailboxes")
      .update({ agentic_last_sync_at: new Date().toISOString(), agentic_last_error: null })
      .eq("id", target.id);

    return finish({
      ...base,
      fetched: rows.length,
      ingested,
      duplicates,
      rejected,
      ticketsCreated,
      attachmentsSkipped,
      cursor: nextCursor,
    });
  } catch (error) {
    const code =
      error instanceof UnsupportedOperationError
        ? error.code
        : error instanceof AgenticMailError
          ? error.code
          : "sync_failed";
    const message = redactAgentic(error instanceof Error ? error.message : String(error));
    await release({
      status: "error",
      last_error: message.slice(0, 500),
      last_error_code: code,
      last_error_at: new Date().toISOString(),
      next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    await db
      .from("email_mailboxes")
      .update({ agentic_last_error: message.slice(0, 300) })
      .eq("id", target.id);
    return finish({ ...base, error: { code, message } });
  }
}

/** مزامنة صندوق واحد (مجلد الوارد افتراضياً). */
export async function syncAgenticMailbox(
  db: Db,
  mailboxId: string,
  options: { triggerSource: "manual" | "cron"; dryRun?: boolean },
): Promise<AgenticSyncOutcome[]> {
  const [target] = await agenticTargets(db, mailboxId);
  if (!target) throw new Error("الصندوق غير موجود أو غير مؤهل للمزامنة.");
  const correlationId = newCorrelationId(options.dryRun ? "dry" : "sync");
  return [await syncAgenticFolder(db, target, "INBOX", { ...options, correlationId })];
}

/** مزامنة كل الصناديق المرتبطة والمُفعّلة (المسار الدوري). */
export async function syncAllAgenticMailboxes(
  db: Db,
  triggerSource: "manual" | "cron" = "cron",
): Promise<AgenticSyncOutcome[]> {
  const state = await readAgenticState(db);
  if (!state.enabled) return [];
  const targets = (await agenticTargets(db)).filter(
    (t) => t.linkStatus === "linked" && t.syncEnabled && t.inboundEnabled && t.isActive,
  );
  const correlationId = newCorrelationId("cron");
  const outcomes: AgenticSyncOutcome[] = [];
  for (const target of targets) {
    outcomes.push(await syncAgenticFolder(db, target, "INBOX", { triggerSource, correlationId }));
  }
  return outcomes;
}

/* ------------------------------------------------- الإرسال */

export type AgenticSendResult =
  | { ok: true; ref: string }
  | { ok: false; code: string; message: string; unsupported: boolean };

/**
 * إرسال رسالة من قائمة الإرسال الحالية عبر أداة الإرسال المكتشفة.
 * لا تُرسل إلا إذا كان التكامل مُفعّلاً وأداة الإرسال مدعومة فعلياً؛
 * وإلا يُعاد `unsupported` ليكمل مسار SMTP الحالي دون تعطيل.
 */
export async function sendViaAgentic(
  db: Db,
  input: {
    messageId: string;
    mailboxAddress: string;
    providerMailboxId: string | null;
    fromName: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    text: string;
    providerMessageId: string;
    replyTo?: string | null;
  },
): Promise<AgenticSendResult> {
  const state = await readAgenticState(db);
  if (!state.enabled) {
    return {
      ok: false,
      code: "integration_disabled",
      message: "تكامل Agentic Mail غير مُفعّل.",
      unsupported: true,
    };
  }
  const correlationId = newCorrelationId("send");
  try {
    const { listAttachments, ATTACHMENT_BUCKET } = await import("@/lib/email/attachments.server");
    const stored = await listAttachments(db, input.messageId);
    const attachments: { filename: string; content_type: string; content_base64: string }[] = [];
    if (stored.length > 0) {
      const { base64Encode } = await import("@/lib/email/transport/mime.server");
      const { assertAttachmentReleasable } = await import(
        "@/lib/file-security/release-gate.server"
      );
      for (const item of stored) {
        // لا تُقرأ بايتات أي مرفق قبل عبور بوابة الإفراج المركزية.
        try {
          await assertAttachmentReleasable(db as never, item.id);
        } catch {
          return {
            ok: false,
            code: "attachment_blocked",
            message: "أحد المرفقات غير متاح لأسباب أمنية، ولم تُرسل الرسالة.",
            unsupported: false,
          };
        }
        const download = await db.storage.from(ATTACHMENT_BUCKET).download(item.storage_path);
        if (download.error || !download.data) {
          return {
            ok: false,
            code: "attachment_unavailable",
            message: "تعذّر قراءة أحد المرفقات.",
            unsupported: false,
          };
        }
        attachments.push({
          filename: item.file_name,
          content_type: item.mime_type,
          content_base64: base64Encode(new Uint8Array(await (download.data as Blob).arrayBuffer())),
        });
      }
    }

    const outcome = await invoke(
      "sendMessage",
      {
        mailbox: input.providerMailboxId ?? input.mailboxAddress,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      correlationId,
    );

    const record = asRecord(outcome.json) ?? {};
    const ref =
      asString(pick(record, ["message_id", "id", "provider_message_id", "reference"])) ??
      input.providerMessageId;
    return { ok: true, ref };
  } catch (error) {
    if (error instanceof UnsupportedOperationError) {
      return { ok: false, code: error.code, message: error.message, unsupported: true };
    }
    const code = error instanceof AgenticMailError ? error.code : "agentic_send_failed";
    const message = redactAgentic(error instanceof Error ? error.message : String(error));
    // خطأ المعاملات يعني أن الأداة لا تقبل شكل رسالتنا: نعود للمسار العامل.
    return { ok: false, code, message, unsupported: code === "argument_mismatch" };
  }
}

/* ------------------------------------------------- إجراءات الرسالة */

export type MessageAction = Extract<
  AgenticOperation,
  "markRead" | "markUnread" | "archiveMessage" | "trashMessage" | "restoreMessage"
>;

/** تنفيذ إجراء على رسالة عند المزوّد إن كانت أداته مدعومة فعلياً. */
export async function applyMessageAction(
  action: MessageAction,
  input: { providerMailboxId: string; providerMessageId: string },
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const correlationId = newCorrelationId("act");
  try {
    await invoke(
      action,
      {
        mailbox: input.providerMailboxId,
        messageId: input.providerMessageId,
        read: action === "markRead" ? true : action === "markUnread" ? false : undefined,
      },
      correlationId,
    );
    return { ok: true };
  } catch (error) {
    const code =
      error instanceof UnsupportedOperationError
        ? error.code
        : error instanceof AgenticMailError
          ? error.code
          : "action_failed";
    return {
      ok: false,
      code,
      message: redactAgentic(error instanceof Error ? error.message : String(error)),
    };
  }
}

/** البحث عند المزوّد — للاستخدام الإداري فقط، بلا تخزين نتائج مكرّرة. */
export async function searchProvider(input: {
  providerMailboxId: string;
  query: string;
  limit?: number;
}): Promise<NormalizedMessage[]> {
  const outcome = await invoke(
    "searchMessages",
    {
      mailbox: input.providerMailboxId,
      query: input.query,
      limit: Math.min(input.limit ?? 20, 50),
    },
    newCorrelationId("search"),
  );
  return extractList(outcome.json ?? outcome.text).map(normalizeMessage);
}
