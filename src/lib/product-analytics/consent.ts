/**
 * موافقة «تحليلات الاستخدام» — معطّلة افتراضياً.
 * لا يُحمَّل PostHog ولا يُنشأ أي تخزين أو طلب شبكة قبل موافقة صريحة.
 */
const CONSENT_KEY = "mehla.usage_analytics.consent";
const ANON_ID_KEY = "mehla.usage_analytics.aid";
const CONSENT_EVENT = "mehla:usage-analytics-consent";
/** نسخة سياسة الكوكيز — تغييرها يعني طلب موافقة جديدة عند الاقتضاء. */
export const COOKIE_POLICY_VERSION = "1";
const RECORD_KEY = "mehla.consent.record";
export const COOKIE_PREFS_EVENT = "mehla:open-cookie-preferences";

export type ConsentRecord = {
  /** الفئة الاختيارية الوحيدة المفعّلة حالياً في المنصة */
  category: "analytics";
  granted: boolean;
  version: string;
  decided_at: string;
};

export function isAnalyticsConsentGranted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

/** سجل الموافقة التقني: الفئة والنسخة والتاريخ فقط — لا يُربط بأي بيانات قضايا أو مستخدم. */
export function getConsentRecord(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECORD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (typeof parsed?.granted !== "boolean" || typeof parsed?.version !== "string") return null;
    return {
      category: "analytics",
      granted: parsed.granted,
      version: parsed.version,
      decided_at: typeof parsed.decided_at === "string" ? parsed.decided_at : "",
    };
  } catch {
    return null;
  }
}

/** هل يحتاج الزائر لاتخاذ قرار (لم يقرر بعد، أو قرّر على نسخة سياسة أقدم)؟ */
export function isConsentDecisionNeeded(): boolean {
  const record = getConsentRecord();
  return !record || record.version !== COOKIE_POLICY_VERSION;
}

/** يفتح مركز تفضيلات ملفات تعريف الارتباط من أي مكان (مثل رابط الفوتر). */
export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_PREFS_EVENT));
}

export function setAnalyticsConsent(granted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
    if (!granted) window.localStorage.removeItem(ANON_ID_KEY);
    const record: ConsentRecord = {
      category: "analytics",
      granted,
      version: COOKIE_POLICY_VERSION,
      decided_at: new Date().toISOString(),
    };
    window.localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    // التخزين غير متاح — نتجاهل بصمت ولا نُظهر أي خطأ للمستخدم
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: granted }));
}

export function subscribeToAnalyticsConsent(listener: (granted: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener(isAnalyticsConsentGranted());
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

/**
 * معرّف تحليلات عشوائي غير قابل للقراءة، منفصل تماماً عن user_id و organization_id.
 * يُولَّد فقط بعد الموافقة، ويُمحى عند سحبها.
 */
export function getAnalyticsAnonymousId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(ANON_ID_KEY);
    if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function clearAnalyticsAnonymousId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ANON_ID_KEY);
  } catch {
    // تجاهل
  }
}
