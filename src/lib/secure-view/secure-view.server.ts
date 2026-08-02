import { getRequestHeader } from "@tanstack/react-start/server";
import type { SecureTokenKind, DocumentAccessAction } from "./secure-view.shared";
import { TOKEN_MAX_USES, TOKEN_TTL_SECONDS } from "./secure-view.shared";

/**
 * Server-only plumbing for the secure viewer: opaque tickets, immutable access
 * logging and privileged reads of the storage object. The browser never sees a
 * storage path or a signed storage URL — only an opaque, expiring ticket.
 */

export type RequestEnvironment = {
  ip: string;
  browser: string;
  os: string;
  device: string;
  userAgent: string;
};

function parseUa(ua: string): { browser: string; os: string; device: string } {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome|CriOS/.test(ua)
        ? "Chrome"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Safari/.test(ua)
            ? "Safari"
            : "أخرى";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "غير معروف";
  const device = /iPad|Tablet/.test(ua) ? "تابلت" : /Mobile|iPhone|Android/.test(ua) ? "جوال" : "حاسب";
  return { browser, os, device };
}

export function requestEnvironment(): RequestEnvironment {
  const ua = (getRequestHeader("user-agent") ?? "").slice(0, 400);
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  const ip =
    (forwarded.split(",")[0] ?? "").trim() ||
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    "";
  return { ip: ip.slice(0, 60), userAgent: ua, ...parseUa(ua) };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** رمز عشوائي 256-bit غير قابل للتخمين. */
export function newAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type IssueTokenInput = {
  organizationId: string;
  documentId: string;
  kind: SecureTokenKind;
  watermarkOffice: string;
  watermarkUser: string;
  watermarkNote: string | null;
  classification: string;
  createdBy: string | null;
  recipientLabel?: string | null;
  ttlSeconds?: number;
  maxUses?: number;
};

/** يُنشئ تذكرة عرض مؤقتة ويُعيد الرمز الخام مرة واحدة فقط. */
export async function issueAccessToken(
  input: IssueTokenInput,
): Promise<{ token: string; id: string; expiresAt: string }> {
  const db = await admin();
  const token = newAccessToken();
  const ttl = input.ttlSeconds ?? TOKEN_TTL_SECONDS[input.kind];
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const { data, error } = await db
    .from("document_access_tokens")
    .insert({
      organization_id: input.organizationId,
      document_id: input.documentId,
      kind: input.kind,
      token_hash: await hashToken(token),
      watermark_office: input.watermarkOffice,
      watermark_user: input.watermarkUser,
      watermark_note: input.watermarkNote,
      classification: input.classification,
      recipient_label: input.recipientLabel ?? null,
      created_by: input.createdBy,
      expires_at: expiresAt,
      max_uses: input.maxUses ?? TOKEN_MAX_USES[input.kind],
    })
    .select("id, expires_at")
    .single();
  if (error || !data) throw new Error("تعذّر تجهيز نسخة العرض الآمنة.");
  return { token, id: data.id, expiresAt: data.expires_at };
}

export type ResolvedToken = {
  id: string;
  organizationId: string;
  documentId: string;
  kind: SecureTokenKind;
  watermarkOffice: string;
  watermarkUser: string;
  watermarkNote: string | null;
  createdBy: string | null;
  usedCount: number;
};

/** يتحقق من التذكرة ويستهلك استخداماً واحداً. يرمي رسالة عربية عند الفشل. */
export async function consumeAccessToken(token: string): Promise<ResolvedToken> {
  const db = await admin();
  const { data, error } = await db
    .from("document_access_tokens")
    .select(
      "id, organization_id, document_id, kind, watermark_office, watermark_user, watermark_note, created_by, expires_at, max_uses, used_count, revoked_at",
    )
    .eq("token_hash", await hashToken(token))
    .maybeSingle();

  if (error || !data) throw new Error("رابط غير صالح.");
  if (data.revoked_at) throw new Error("تم إلغاء هذا الرابط.");
  if (new Date(data.expires_at).getTime() <= Date.now()) throw new Error("انتهت صلاحية هذا الرابط.");
  if (data.used_count >= data.max_uses) throw new Error("تم استهلاك هذا الرابط.");

  const { error: bumpError } = await db
    .from("document_access_tokens")
    .update({ used_count: data.used_count + 1, last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .lt("used_count", data.max_uses);
  if (bumpError) throw new Error("تعذّر التحقق من صلاحية الرابط.");

  return {
    id: data.id,
    organizationId: data.organization_id,
    documentId: data.document_id,
    kind: data.kind as SecureTokenKind,
    watermarkOffice: data.watermark_office,
    watermarkUser: data.watermark_user,
    watermarkNote: data.watermark_note,
    createdBy: data.created_by,
    usedCount: data.used_count + 1,
  };
}

export type AccessLogInput = {
  organizationId: string;
  documentId: string | null;
  documentName: string | null;
  shareTokenId?: string | null;
  userId: string | null;
  userName: string | null;
  officeName: string | null;
  action: DocumentAccessAction;
  printId?: string | null;
  sessionId?: string | null;
  sourcePage?: string | null;
  environment?: RequestEnvironment;
};

/** سجل غير قابل للتعديل: يُكتب بصلاحية الخادم فقط ولا يُحدَّث ولا يُحذف. */
export async function logDocumentAccess(input: AccessLogInput): Promise<void> {
  const db = await admin();
  const env = input.environment ?? requestEnvironment();
  const { error } = await db.from("document_access_logs").insert({
    organization_id: input.organizationId,
    document_id: input.documentId,
    document_name: input.documentName,
    share_token_id: input.shareTokenId ?? null,
    user_id: input.userId,
    user_name: input.userName,
    office_name: input.officeName,
    action_type: input.action,
    print_id: input.printId ?? null,
    ip: env.ip || null,
    browser: env.browser,
    os: env.os,
    device: env.device,
    session_id: input.sessionId ?? null,
    source_page: input.sourcePage ?? null,
  });
  if (error) throw new Error("تعذّر تسجيل عملية الوصول، ولم تُنفَّذ العملية.");
}

/** قراءة الملف الأصلي بصلاحية الخادم — لا يُمرَّر مساره للمتصفح أبداً. */
export async function readOriginal(filePath: string): Promise<Uint8Array> {
  const db = await admin();
  const { data, error } = await db.storage.from("documents").download(filePath);
  if (error || !data) throw new Error("تعذّر قراءة الملف من المخزن.");
  return new Uint8Array(await data.arrayBuffer());
}

/** يجمع بيانات المستند + هوية العارض لبناء العلامة المائية. */
export async function loadDocumentForStamp(documentId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("documents")
    .select("id, organization_id, file_name, file_path, file_type, is_confidential, document_category")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("المستند غير موجود.");
  return data;
}

/** النص المستخرج يُستخدم كنسخة عرض مائية للصيغ غير القابلة للختم. */
export async function loadExtractedText(documentId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("document_pages")
    .select("page_number, extracted_text")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true })
    .limit(200);
  if (!data?.length) return null;
  return data.map((page) => page.extracted_text).join("\n\n");
}
