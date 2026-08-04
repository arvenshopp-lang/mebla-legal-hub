/**
 * ربط أدوات MCP المكتشفة فعلياً بعمليات مركز البريد — خادمي فقط.
 *
 * لا تُفترض أي أداة: الربط يعتمد على أسماء الأدوات التي أعادها الخادم فعلاً،
 * والعملية غير المطابقة تبقى «غير مدعومة» بلا أي نتيجة وهمية. كذلك تُربط
 * أسماء المعاملات بمخطط الأداة الفعلي بدل تخمين أسماء ثابتة.
 */
import type { McpTool } from "./mcp-client.server";
import { AGENTIC_OPERATIONS, type AgenticOperation } from "./agentic.shared";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** أنماط الأسماء لكل عملية، من الأخص إلى الأعم. */
const PATTERNS: Record<AgenticOperation, RegExp[]> = {
  listMailboxes: [/(list|get|fetch)_?(all_)?(mail)?boxes?$/, /(mailbox|account)e?s_?(list|all)/, /list_?(mail_)?accounts?/],
  listMessages: [
    /(list|fetch)_?(mail_)?(messages|emails|mails)/,
    /(messages|emails)_?(list|recent|latest)/,
    /list_?inbox/,
  ],
  getMessage: [/(get|read|fetch|show)_?(mail_)?(message|email|mail)$/, /(message|email)_?(detail|content|body|get)/],
  searchMessages: [/search/, /(query|find)_?(messages|emails|mail)/],
  sendMessage: [/(send|create_and_send)_?(mail_)?(message|email|mail)?$/, /send/],
  replyMessage: [/reply(_to)?_?(message|email|mail)?$/, /^reply$/],
  replyAll: [/reply_?all/, /all_?reply/],
  forwardMessage: [/forward/],
  markRead: [/(mark|set|flag)_?(as_)?(read|seen)$/, /read_?(status|flag)/],
  markUnread: [/(mark|set|flag)_?(as_)?unread$/, /unread/],
  archiveMessage: [/archive$/, /^archive/],
  trashMessage: [/(trash|delete|remove)_?(message|email|mail)?$/, /move_?to_?trash/],
  restoreMessage: [/(restore|unarchive|untrash)/, /move_?to_?inbox/],
  listAttachments: [/(list|get)_?attachments?$/, /attachments?_?list/],
  downloadAttachment: [/(download|fetch|get)_?attachment/, /attachment_?(content|download|body)/],
};

/** الترتيب مهم: الأخص أولاً حتى لا يستحوذ نمط عام على أداة متخصصة. */
const RESOLUTION_ORDER: AgenticOperation[] = [
  "replyAll",
  "markUnread",
  "restoreMessage",
  "downloadAttachment",
  "listAttachments",
  "forwardMessage",
  "archiveMessage",
  "trashMessage",
  "markRead",
  "replyMessage",
  "searchMessages",
  "listMailboxes",
  "listMessages",
  "getMessage",
  "sendMessage",
];

export type CapabilityMap = {
  tools: McpTool[];
  byOperation: Record<AgenticOperation, McpTool | null>;
  operationNames: Record<AgenticOperation, string | null>;
};

/** ربط كل عملية بأداة واحدة على الأكثر، بلا تكرار استخدام الأداة نفسها. */
export function mapCapabilities(tools: McpTool[]): CapabilityMap {
  const byOperation = Object.fromEntries(AGENTIC_OPERATIONS.map((op) => [op, null])) as Record<
    AgenticOperation,
    McpTool | null
  >;
  const taken = new Set<string>();

  for (const operation of RESOLUTION_ORDER) {
    for (const pattern of PATTERNS[operation]) {
      const match = tools.find((tool) => !taken.has(tool.name) && pattern.test(normalize(tool.name)));
      if (match) {
        byOperation[operation] = match;
        taken.add(match.name);
        break;
      }
    }
  }

  const operationNames = Object.fromEntries(
    AGENTIC_OPERATIONS.map((op) => [op, byOperation[op]?.name ?? null]),
  ) as Record<AgenticOperation, string | null>;

  return { tools, byOperation, operationNames };
}

/** المرادفات المسموحة لكل معامل قياسي. */
const ARG_ALIASES: Record<string, string[]> = {
  mailbox: ["mailbox", "mailbox_id", "mailboxid", "mailbox_name", "account", "account_id", "email_account", "address", "email_address", "from", "from_address", "user", "email"],
  folder: ["folder", "folder_id", "folder_name", "label", "label_id", "path", "mailbox_folder"],
  limit: ["limit", "max", "max_results", "maxresults", "count", "page_size", "per_page", "top"],
  cursor: ["cursor", "page_token", "pagetoken", "next_cursor", "next_page_token", "offset", "page", "since", "after", "start"],
  messageId: ["message_id", "messageid", "id", "email_id", "mail_id", "uid", "message"],
  threadId: ["thread_id", "threadid", "conversation_id"],
  query: ["query", "q", "search", "search_query", "keyword", "keywords", "text_query"],
  to: ["to", "to_addresses", "recipients", "recipient", "to_email", "toaddress"],
  cc: ["cc", "cc_addresses", "cc_recipients"],
  bcc: ["bcc", "bcc_addresses", "bcc_recipients"],
  subject: ["subject", "title"],
  html: ["html", "html_body", "body_html", "htmlcontent", "html_content"],
  text: ["text", "text_body", "body_text", "plain_text", "body", "content", "message_body"],
  replyTo: ["reply_to", "replyto", "reply_to_address"],
  attachments: ["attachments", "files", "attachment", "attachment_list"],
  attachmentId: ["attachment_id", "attachmentid", "file_id", "part_id"],
  read: ["read", "seen", "is_read", "unread", "flag"],
  unreadOnly: ["unread_only", "only_unread", "is_unread"],
};

export type BindResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; missing: string[] };

/**
 * تحويل معاملات قياسية إلى أسماء مخطط الأداة الفعلي.
 * إن بقي معامل إلزامي في المخطط بلا قيمة، تفشل العملية بوضوح ولا تُنفَّذ.
 */
export function bindArgs(tool: McpTool, canonical: Record<string, unknown>): BindResult {
  const properties = Object.keys(tool.inputSchema.properties);
  const lookup = new Map(properties.map((prop) => [normalize(prop), prop]));
  const args: Record<string, unknown> = {};
  const used = new Set<string>();

  for (const [key, value] of Object.entries(canonical)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const aliases = ARG_ALIASES[key] ?? [normalize(key)];
    for (const alias of [normalize(key), ...aliases.map(normalize)]) {
      const prop = lookup.get(alias);
      if (prop && !used.has(prop)) {
        args[prop] = value;
        used.add(prop);
        break;
      }
    }
  }

  const missing = tool.inputSchema.required.filter((prop) => !(prop in args));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, args };
}