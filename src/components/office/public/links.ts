/**
 * بناء الروابط الآمنة للصفحة العامة — منقولة كما هي من العارض السابق دون تغيير سلوكي.
 * لا يُبنى أي رابط إلا من مخطط آمن معروف.
 */
export function safeHttps(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function telHref(phone: string): string {
  return /^\+\d{8,15}$/.test(phone) ? `tel:${phone}` : "";
}

export function waHref(phone: string): string {
  return /^\+\d{8,15}$/.test(phone) ? `https://wa.me/${phone.replace("+", "")}` : "";
}

export function mailHref(email: string): string {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : "";
}

/** اسم النطاق فقط للعرض، مع الحفاظ على الرابط الكامل في href. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type OfficeEventKind = "view" | "whatsapp" | "call" | "email" | "map" | "service_click";
export type TrackFn = (kind: OfficeEventKind) => void;
