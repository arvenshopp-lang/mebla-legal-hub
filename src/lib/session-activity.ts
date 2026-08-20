/**
 * سياسة انتهاء الجلسة عند الخمول.
 *
 * تُخزَّن آخر لحظة نشاط للمستخدم محلياً، ويُسجَّل الخروج تلقائياً إذا تجاوز
 * الخمول 60 دقيقة — حمايةً لسرية القضايا وبيانات المكاتب.
 */

export const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
export const LAST_ACTIVE_KEY = "mehla_last_active_at";
/** أقصى تكرار للكتابة في التخزين المحلي أثناء التفاعل المستمر. */
export const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLastActiveAt(): number | null {
  const raw = storage()?.getItem(LAST_ACTIVE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function markSessionActive(at: number = Date.now()): void {
  try {
    storage()?.setItem(LAST_ACTIVE_KEY, String(at));
  } catch {
    /* التخزين ممتلئ أو محجوب: السياسة تبقى قائمة على المؤقّت داخل الجلسة */
  }
}

export function clearSessionActivity(): void {
  try {
    storage()?.removeItem(LAST_ACTIVE_KEY);
  } catch {
    /* لا شيء لتنظيفه */
  }
}

/** يعيد true فقط عندما يكون هناك طابع نشاط معروف وتجاوز مهلة الخمول. */
export function isInactivityExpired(now: number = Date.now()): boolean {
  const last = readLastActiveAt();
  if (last === null) return false;
  return now - last > SESSION_TIMEOUT_MS;
}

export const INACTIVITY_MESSAGE =
  "انتهت مدة جلستك بسبب عدم النشاط لحماية بيانات مكتبك. يرجى تسجيل الدخول مجدداً.";
