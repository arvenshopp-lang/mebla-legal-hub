/**
 * مُهايئ REST لخادم Hostinger Agentic Mail — خادمي فقط.
 *
 * خادم Hostinger لا يعرض أداة MCP لكل عملية، بل يعرض وكيل REST من ست أدوات
 * (`email_call_api_read` / `email_call_api_write` / `email_call_api_delete`
 * مع أدوات استكشاف المواصفة). لذلك يُشتق سطح القدرات من عمليات OpenAPI
 * المُعادة فعلاً من `email_list_operations`، وتُنفَّذ كل عملية قياسية كنداء
 * REST مُعامَل بدقة.
 *
 * قواعد ثابتة:
 *  - لا عملية مُفترضة: ما لم يُعِده المزوّد في قائمة العمليات يبقى «غير مدعوم».
 *  - لا حذف ولا نقل ضمن مسار المزامنة؛ العمليات المدمّرة تُستدعى صراحة فقط.
 *  - المؤشر التزايدي يعتمد على أعلى UID مقروء، فلا تكرار ولا فقدان رسائل.
 */
import { AgenticMailError, callTool, redactAgentic, type McpTool } from "./mcp-client.server";
import type { AgenticOperation } from "./agentic.shared";

const READ_TOOL = "email_call_api_read";
const WRITE_TOOL = "email_call_api_write";
const DELETE_TOOL = "email_call_api_delete";
const OPERATIONS_TOOL = "email_list_operations";

const DEFAULT_FOLDER = "INBOX";
const SENT_FOLDER = "INBOX.Sent";
const TRASH_FOLDER = "INBOX.Trash";
const ARCHIVE_FOLDER = "INBOX.Archive";

/** هل خادم المزوّد من نوع وكيل REST؟ */
export function isRestProxy(tools: McpTool[]): boolean {
  const names = new Set(tools.map((tool) => tool.name));
  return names.has(READ_TOOL) && names.has(OPERATIONS_TOOL);
}

type RestBinding = {
  /** مُعرّف عملية OpenAPI المطلوب وجودها فعلاً لدعم العملية. */
  requires: string[];
  kind: "read" | "write" | "delete";
};

/**
 * ربط العمليات القياسية بمُعرّفات عمليات Hostinger.
 * الردّ والرد على الكل والتحويل تُنفَّذ بإرسال مرجعي (`inReplyTo` / `forwardOf`)
 * وهو ما يضمن ترابط المحادثة على الخادم نفسه.
 */
const BINDINGS: Record<AgenticOperation, RestBinding | null> = {
  listMailboxes: { requires: ["getCurrentAccount"], kind: "read" },
  listMessages: { requires: ["listMessages"], kind: "read" },
  getMessage: { requires: ["getMessage"], kind: "read" },
  searchMessages: { requires: ["searchMessages"], kind: "write" },
  sendMessage: { requires: ["sendEmail"], kind: "write" },
  replyMessage: { requires: ["sendEmail"], kind: "write" },
  replyAll: { requires: ["sendEmail"], kind: "write" },
  forwardMessage: { requires: ["sendEmail"], kind: "write" },
  markRead: { requires: ["updateMessageFlags"], kind: "write" },
  markUnread: { requires: ["updateMessageFlags"], kind: "write" },
  archiveMessage: { requires: ["moveMessage"], kind: "write" },
  trashMessage: { requires: ["moveMessage"], kind: "write" },
  restoreMessage: { requires: ["moveMessage"], kind: "write" },
  listAttachments: { requires: ["getMessage"], kind: "read" },
  downloadAttachment: { requires: ["getMessageAttachment"], kind: "read" },
};

export type RestOperationInfo = { method: string; path: string; operationId: string };

/** قراءة قائمة عمليات OpenAPI الفعلية من المزوّد. */
export async function listRestOperations(correlationId: string): Promise<RestOperationInfo[]> {
  const result = await callTool(OPERATIONS_TOOL, {}, { correlationId });
  if (result.isError) {
    throw new AgenticMailError(
      "operations_unavailable",
      redactAgentic(result.text).slice(0, 300) || "تعذّر قراءة قائمة عمليات المزوّد.",
      null,
      result.requestId,
    );
  }
  const payload = result.json ?? safeJson(result.text);
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      method: String(row["method"] ?? "").toUpperCase(),
      path: String(row["path"] ?? ""),
      operationId: String(row["operationId"] ?? ""),
    }))
    .filter((row) => row.operationId && row.path);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** العمليات القياسية المدعومة فعلاً بناءً على عمليات المزوّد المُعادة. */
export function restSupportedOperations(operations: RestOperationInfo[]): Set<AgenticOperation> {
  const ids = new Set(operations.map((op) => op.operationId));
  const supported = new Set<AgenticOperation>();
  for (const [operation, binding] of Object.entries(BINDINGS)) {
    if (binding && binding.requires.every((id) => ids.has(id))) {
      supported.add(operation as AgenticOperation);
    }
  }
  return supported;
}

/* ------------------------------------------------- تحويل المعاملات */

type Canonical = Record<string, unknown>;

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function uidOf(value: unknown): number | null {
  const raw = str(value);
  if (!raw) return null;
  const match = /(\d+)/.exec(raw);
  if (!match) return null;
  const uid = Number(match[1]);
  return Number.isFinite(uid) && uid > 0 ? uid : null;
}

function folderOf(canonical: Canonical): string {
  return str(canonical["folder"]) ?? DEFAULT_FOLDER;
}

function addresses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter((v): v is string => Boolean(v));
  const one = str(value);
  return one ? [one] : [];
}

type RestCall = {
  kind: "read" | "write" | "delete";
  method: string;
  path: string;
  pathParams: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

const MAILBOX_PATH = "/api/v1/mailboxes/{mailboxResourceId}";

function attachmentPayload(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const items: Record<string, unknown>[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const content = str(row["content_base64"] ?? row["content"]);
    if (!content) continue;
    items.push({
      filename: str(row["filename"] ?? row["file_name"]) ?? "attachment",
      contentType: str(row["content_type"] ?? row["contentType"]) ?? "application/octet-stream",
      content,
      encoding: "base64",
    });
  }
  return items;
}

function sendBody(canonical: Canonical, reference: "inReplyTo" | "forwardOf" | null): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const to = addresses(canonical["to"]);
  const cc = addresses(canonical["cc"]);
  const bcc = addresses(canonical["bcc"]);
  if (to.length > 0) body["to"] = to;
  if (cc.length > 0) body["cc"] = cc;
  if (bcc.length > 0) body["bcc"] = bcc;
  const subject = str(canonical["subject"]);
  if (subject) body["subject"] = subject;
  const html = str(canonical["html"]);
  if (html) body["html"] = html;
  const text = str(canonical["text"]);
  if (text) body["text"] = text;
  const displayName = str(canonical["fromName"] ?? canonical["displayName"]);
  if (displayName) body["displayName"] = displayName;
  const attachments = attachmentPayload(canonical["attachments"]);
  if (attachments.length > 0) body["attachments"] = attachments;
  if (reference) {
    const uid = uidOf(canonical["messageId"] ?? canonical["providerMessageId"]);
    if (uid !== null) body[reference] = { folder: folderOf(canonical), uid };
  }
  return body;
}

/** بناء نداء REST دقيق لكل عملية قياسية. */
function planCall(operation: AgenticOperation, canonical: Canonical): RestCall | { error: string } {
  const mailbox = str(canonical["mailbox"]);
  const folder = folderOf(canonical);

  if (operation === "listMailboxes") {
    return { kind: "read", method: "GET", path: "/api/v1/me", pathParams: {} };
  }
  if (!mailbox) return { error: "mailbox" };
  const base = { mailboxResourceId: mailbox };

  switch (operation) {
    case "listMessages": {
      const limit = Math.min(Math.max(Number(canonical["limit"] ?? 15) || 15, 1), 100);
      const cursorUid = uidOf(canonical["cursor"]);
      if (cursorUid !== null) {
        return {
          kind: "write",
          method: "POST",
          path: `${MAILBOX_PATH}/folders/{folder}/messages/search`,
          pathParams: { ...base, folder },
          query: { perPage: limit, page: 1, sort: "uid" },
          body: { uid: `${cursorUid + 1}:*` },
        };
      }
      return {
        kind: "read",
        method: "GET",
        path: `${MAILBOX_PATH}/folders/{folder}/messages`,
        pathParams: { ...base, folder },
        query: { perPage: limit, page: 1, sort: "uid" },
      };
    }
    case "getMessage":
    case "listAttachments": {
      const uid = uidOf(canonical["messageId"]);
      if (uid === null) return { error: "messageId" };
      return {
        kind: "read",
        method: "GET",
        path: `${MAILBOX_PATH}/folders/{folder}/messages/{uid}`,
        pathParams: { ...base, folder, uid: String(uid) },
      };
    }
    case "searchMessages": {
      const query = str(canonical["query"]);
      if (!query) return { error: "query" };
      const limit = Math.min(Math.max(Number(canonical["limit"] ?? 20) || 20, 1), 50);
      return {
        kind: "write",
        method: "POST",
        path: `${MAILBOX_PATH}/folders/{folder}/messages/search`,
        pathParams: { ...base, folder },
        query: { perPage: limit, page: 1 },
        body: { text: query },
      };
    }
    case "sendMessage":
    case "replyMessage":
    case "replyAll":
    case "forwardMessage": {
      const reference =
        operation === "forwardMessage" ? "forwardOf" : operation === "sendMessage" ? null : "inReplyTo";
      const body = sendBody(canonical, reference);
      if (!body["to"] && !body["cc"] && !body["bcc"]) return { error: "to" };
      return {
        kind: "write",
        method: "POST",
        path: `${MAILBOX_PATH}/send`,
        pathParams: base,
        body,
      };
    }
    case "markRead":
    case "markUnread": {
      const uid = uidOf(canonical["messageId"]);
      if (uid === null) return { error: "messageId" };
      const key = operation === "markRead" ? "addFlags" : "removeFlags";
      return {
        kind: "write",
        method: "POST",
        path: `${MAILBOX_PATH}/folders/{folder}/messages/flags`,
        pathParams: { ...base, folder },
        body: { uids: [uid], [key]: ["\\Seen"] },
      };
    }
    case "archiveMessage":
    case "trashMessage":
    case "restoreMessage": {
      const uid = uidOf(canonical["messageId"]);
      if (uid === null) return { error: "messageId" };
      const targetFolder =
        operation === "archiveMessage"
          ? ARCHIVE_FOLDER
          : operation === "trashMessage"
            ? TRASH_FOLDER
            : DEFAULT_FOLDER;
      return {
        kind: "write",
        method: "POST",
        path: `${MAILBOX_PATH}/folders/{folder}/messages/{uid}/move`,
        pathParams: { ...base, folder, uid: String(uid) },
        body: { targetFolder },
      };
    }
    case "downloadAttachment": {
      const uid = uidOf(canonical["messageId"]);
      const attachmentId = str(canonical["attachmentId"]);
      if (uid === null) return { error: "messageId" };
      if (!attachmentId) return { error: "attachmentId" };
      return {
        kind: "read",
        method: "GET",
        path: `${MAILBOX_PATH}/folders/{folder}/messages/{uid}/attachments/{attachmentId}`,
        pathParams: { ...base, folder, uid: String(uid), attachmentId },
      };
    }
    default:
      return { error: operation };
  }
}

/* ------------------------------------------------- تنفيذ */

const TOOL_BY_KIND: Record<RestCall["kind"], string> = {
  read: READ_TOOL,
  write: WRITE_TOOL,
  delete: DELETE_TOOL,
};

function unwrap(payload: unknown, requestId: string): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const root = payload as Record<string, unknown>;
  const status = typeof root["status"] === "number" ? (root["status"] as number) : null;
  const body = "body" in root ? root["body"] : payload;
  if (status !== null && status >= 400) {
    const detail =
      body && typeof body === "object"
        ? redactAgentic(JSON.stringify(body)).slice(0, 300)
        : redactAgentic(String(body ?? "")).slice(0, 300);
    throw new AgenticMailError(
      status === 401 || status === 403 ? "unauthorized" : status === 404 ? "not_found" : "provider_error",
      detail || `رفض المزوّد الطلب (${status}).`,
      status,
      requestId,
    );
  }
  const inner = body;
  if (inner && typeof inner === "object" && !Array.isArray(inner) && "data" in (inner as Record<string, unknown>)) {
    return (inner as Record<string, unknown>)["data"];
  }
  return inner;
}

/** أعلى UID في صفحة النتائج، ليكون المؤشر التزايدي للدورة التالية. */
function highestUid(rows: unknown): string | null {
  if (!Array.isArray(rows)) return null;
  let max = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const uid = uidOf((row as Record<string, unknown>)["uid"]);
    if (uid !== null && uid > max) max = uid;
  }
  return max > 0 ? String(max) : null;
}

export type RestInvokeResult = {
  json: unknown | null;
  text: string;
  latencyMs: number;
  requestId: string;
};

/** تنفيذ عملية قياسية عبر وكيل REST، مع تطبيع الاستجابة لما يتوقعه المحرّك. */
export async function restInvoke(
  operation: AgenticOperation,
  canonical: Canonical,
  correlationId: string,
  supported: Set<AgenticOperation>,
): Promise<RestInvokeResult> {
  if (!supported.has(operation)) {
    throw new AgenticMailError(
      "operation_unsupported",
      `العملية «${operation}» غير متاحة في عمليات المزوّد المكتشفة.`,
      null,
      correlationId,
    );
  }
  const plan = planCall(operation, canonical);
  if ("error" in plan) {
    throw new AgenticMailError(
      "argument_mismatch",
      `العملية «${operation}» تحتاج معاملاً غير متوفّر: ${plan.error}`,
      null,
      correlationId,
    );
  }

  const args: Record<string, unknown> = {
    method: plan.method,
    path: plan.path,
    path_params: plan.pathParams,
  };
  if (plan.query) args["query"] = plan.query;
  if (plan.body) args["body"] = plan.body;

  const result = await callTool(TOOL_BY_KIND[plan.kind], args, { correlationId });
  if (result.isError) {
    throw new AgenticMailError(
      "tool_error",
      redactAgentic(result.text).slice(0, 300) || "رفض المزوّد تنفيذ النداء.",
      null,
      result.requestId,
    );
  }

  const payload = unwrap(result.json ?? safeJson(result.text), result.requestId);

  if (operation === "getMessage" && payload && typeof payload === "object") {
    // جسم الرسالة عند Hostinger على مسار مستقل؛ يُدمَج ليكتمل التطبيع.
    const uid = uidOf((payload as Record<string, unknown>)["uid"] ?? canonical["messageId"]);
    if (uid !== null) {
      const bodyCall = await callTool(
        READ_TOOL,
        {
          method: "GET",
          path: `${MAILBOX_PATH}/folders/{folder}/messages/{uid}/text`,
          path_params: {
            mailboxResourceId: String(canonical["mailbox"] ?? ""),
            folder: folderOf(canonical),
            uid: String(uid),
          },
        },
        { correlationId },
      );
      if (!bodyCall.isError) {
        const content = unwrap(bodyCall.json ?? safeJson(bodyCall.text), bodyCall.requestId);
        if (content && typeof content === "object") {
          return {
            json: { ...(payload as Record<string, unknown>), ...(content as Record<string, unknown>) },
            text: result.text,
            latencyMs: result.latencyMs,
            requestId: result.requestId,
          };
        }
      }
    }
  }

  if (operation === "listMessages") {
    const rows = Array.isArray(payload) ? payload : [];
    // نطاق IMAP «n:*» يُعيد آخر رسالة حتى لو كان UID أصغر من n،
    // لذا يُرشَّح الناتج بحدّ المؤشر منعاً لإعادة استيراد الرسالة نفسها.
    const cursorUid = uidOf(canonical["cursor"]);
    const fresh =
      cursorUid === null
        ? rows
        : rows.filter((row) => {
            if (!row || typeof row !== "object") return false;
            const uid = uidOf((row as Record<string, unknown>)["uid"]);
            return uid !== null && uid > cursorUid;
          });
    return {
      json: {
        messages: fresh,
        nextCursor: highestUid(fresh) ?? (cursorUid === null ? null : String(cursorUid)),
      },
      text: result.text,
      latencyMs: result.latencyMs,
      requestId: result.requestId,
    };
  }
  if (operation === "listMailboxes") {
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const mailboxes = Array.isArray(root["mailboxes"]) ? root["mailboxes"] : [];
    return {
      json: { mailboxes },
      text: result.text,
      latencyMs: result.latencyMs,
      requestId: result.requestId,
    };
  }
  if (operation === "downloadAttachment") {
    const content =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object"
          ? str((payload as Record<string, unknown>)["content"])
          : null;
    return {
      json: content ? { content_base64: content } : {},
      text: result.text,
      latencyMs: result.latencyMs,
      requestId: result.requestId,
    };
  }
  if (operation === "sendMessage" || operation === "replyMessage" || operation === "replyAll" || operation === "forwardMessage") {
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    return {
      json: { ...root, folder: SENT_FOLDER },
      text: result.text,
      latencyMs: result.latencyMs,
      requestId: result.requestId,
    };
  }

  return { json: payload ?? null, text: result.text, latencyMs: result.latencyMs, requestId: result.requestId };
}
