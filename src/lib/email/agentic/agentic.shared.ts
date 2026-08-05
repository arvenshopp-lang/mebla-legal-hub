/**
 * Hostinger Agentic Mail — أنواع وثوابت آمنة للمتصفح.
 *
 * لا يحتوي هذا الملف أي سر ولا أي منطق اتصال. الاتصال بخادم MCP يتم من
 * الخادم فقط. الواجهة تعرف «هل السر موجود» و«أي الأدوات مكتشفة فعلياً»
 * ولا تعرف أي قيمة سر ولا استجابة المزوّد الخام.
 */

/** العمليات القياسية التي قد يوفّرها المزوّد. الدعم يُكتشف ولا يُفترض. */
export const AGENTIC_OPERATIONS = [
  "listMailboxes",
  "listMessages",
  "getMessage",
  "searchMessages",
  "sendMessage",
  "replyMessage",
  "replyAll",
  "forwardMessage",
  "markRead",
  "markUnread",
  "archiveMessage",
  "trashMessage",
  "restoreMessage",
  "listAttachments",
  "downloadAttachment",
] as const;

export type AgenticOperation = (typeof AGENTIC_OPERATIONS)[number];

export const OPERATION_LABELS: Record<AgenticOperation, string> = {
  listMailboxes: "اكتشاف الصناديق",
  listMessages: "قراءة الرسائل",
  getMessage: "قراءة رسالة كاملة",
  searchMessages: "البحث في البريد",
  sendMessage: "إرسال رسالة",
  replyMessage: "الرد",
  replyAll: "الرد على الكل",
  forwardMessage: "تحويل الرسالة",
  markRead: "تعليم مقروء",
  markUnread: "تعليم غير مقروء",
  archiveMessage: "الأرشفة",
  trashMessage: "النقل للمهملات",
  restoreMessage: "الاستعادة",
  listAttachments: "سرد المرفقات",
  downloadAttachment: "تنزيل المرفقات",
};

/** خطوات الجاهزية الإلزامية قبل تفعيل التكامل. */
export const READINESS_CHECKS = [
  "connection",
  "tools",
  "mailboxes",
  "dry_run",
  "test_send",
] as const;
export type ReadinessCheck = (typeof READINESS_CHECKS)[number];

export const CHECK_LABELS: Record<ReadinessCheck, string> = {
  connection: "اختبار الاتصال",
  tools: "اكتشاف الأدوات",
  mailboxes: "اكتشاف صندوق واحد على الأقل",
  dry_run: "مزامنة تجريبية دون تكرار",
  test_send: "رسالة اختبار (إن كان الإرسال مدعوماً)",
};

export type CheckState = { ok: boolean; at: string | null; detail: string | null };

export type AgenticLinkStatus = "unlinked" | "linked" | "missing";

export const LINK_STATUS_LABELS: Record<AgenticLinkStatus, string> = {
  unlinked: "غير مرتبط",
  linked: "مرتبط",
  missing: "غير موجود عند المزوّد",
};

export type AgenticState = {
  enabled: boolean;
  mcpUrl: string;
  secretPresent: boolean;
  checks: Record<ReadinessCheck, CheckState>;
  operations: Record<AgenticOperation, string | null>;
  tools: string[];
  lastTestAt: string | null;
  lastSyncAt: string | null;
  lastSendAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  latencyMs: number | null;
  counters: { imported: number; sent: number; syncErrors: number; mailboxes: number };
};

export type AgenticMailboxLink = {
  id: string;
  address: string;
  displayName: string;
  type: string;
  isActive: boolean;
  syncEnabled: boolean;
  inboundEnabled: boolean;
  linkStatus: AgenticLinkStatus;
  providerMailboxId: string | null;
  unreadCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  cursor: string | null;
  departmentId: string | null;
};

/** ملخّص المتاح فعلياً: يُستخدم في الواجهة لتعطيل ما لا يدعمه المزوّد. */
export function supportedOperations(state: Pick<AgenticState, "operations">): AgenticOperation[] {
  return AGENTIC_OPERATIONS.filter((op) => Boolean(state.operations[op]));
}

export function readinessSatisfied(state: AgenticState): boolean {
  const sendSupported = Boolean(state.operations.sendMessage);
  return READINESS_CHECKS.every((check) => {
    if (check === "test_send" && !sendSupported) return true;
    return state.checks[check]?.ok === true;
  });
}
