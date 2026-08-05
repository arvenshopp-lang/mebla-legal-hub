/**
 * مخزن المسودات المشفّرة — متصفح فقط.
 *
 * • مسودة مستقلة لكل مستخدم ولكل نموذج ولكل سجل (لا تتداخل مسودة عميل مع آخر).
 * • القيم تُشفّر بـ AES-256-GCM قبل الحفظ، والمفتاح غير قابل للاستخراج.
 * • الحقول الحساسة (كلمات المرور ورموز التحقق) لا تدخل المسودة أبداً.
 */
import { decryptJson, encryptJson } from "./draft-crypto";

const PREFIX = "mehla_draft_v1:";
const SESSION_KEY = "mehla_draft_session";
/** عمر المسودة الأقصى: أسبوع، ثم تُحذف تلقائياً. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftEnvelope<T> = {
  value: T;
  savedAt: number;
  /** جلسة التبويب التي كتبت المسودة — تُميّز «الرجوع من تطبيق آخر» عن «إغلاق المتصفح». */
  sessionId: string;
  scope: string;
};

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** معرّف جلسة التبويب الحالي: يبقى عبر التنقل والرجوع، ويتغيّر بإغلاق المتصفح. */
export function draftSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return "ephemeral";
  }
}

export function draftKey(userKey: string, scope: string): string {
  return `${PREFIX}${userKey}:${scope}`;
}

export async function saveDraft<T>(userKey: string, scope: string, value: T): Promise<boolean> {
  const store = storage();
  if (!store) return false;
  const envelope: DraftEnvelope<T> = {
    value,
    savedAt: Date.now(),
    sessionId: draftSessionId(),
    scope,
  };
  const encrypted = await encryptJson(envelope);
  if (!encrypted) return false;
  try {
    store.setItem(draftKey(userKey, scope), encrypted);
    return true;
  } catch {
    return false;
  }
}

export async function loadDraft<T>(
  userKey: string,
  scope: string,
): Promise<DraftEnvelope<T> | null> {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(draftKey(userKey, scope));
  if (!raw) return null;
  const envelope = await decryptJson<DraftEnvelope<T>>(raw);
  if (!envelope || envelope.scope !== scope || Date.now() - envelope.savedAt > MAX_AGE_MS) {
    clearDraft(userKey, scope);
    return null;
  }
  return envelope;
}

export function clearDraft(userKey: string, scope: string): void {
  storage()?.removeItem(draftKey(userKey, scope));
}

/** حذف كل مسودات هذا المتصفح — يُستخدم عند تسجيل الخروج. */
export function clearAllDrafts(): void {
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => store.removeItem(key));
}

/** يحذف الحقول التي يُمنع حفظها (كلمة المرور، رمز التحقق، …). */
export function redactDraft<T extends Record<string, unknown>>(
  value: T,
  omit: readonly string[],
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (omit.includes(key)) continue;
    if (entry === undefined) continue;
    out[key] = entry;
  }
  return out as Partial<T>;
}

/** هل تحتوي المسودة أي بيانات فعلية تستحق الاستعادة؟ */
export function isMeaningfulDraft(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(isMeaningfulDraft);
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).some(isMeaningfulDraft);
  return false;
}
