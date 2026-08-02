import { getRequestHeader } from "@tanstack/react-start/server";

/** بيانات الشبكة تُقرأ من الطلب على الخادم فقط — لا يمكن للمتصفح انتحالها. */
export function resolveRequestOrigin(): { ip: string; country: string | null; userAgent: string } {
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  const ip =
    (forwarded.split(",")[0] ?? "").trim() ||
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    "";
  const country =
    getRequestHeader("cf-ipcountry") ?? getRequestHeader("x-vercel-ip-country") ?? null;
  return {
    ip: ip.slice(0, 60),
    country: country ? country.slice(0, 8) : null,
    userAgent: (getRequestHeader("user-agent") ?? "").slice(0, 400),
  };
}

/** معرّف طباعة فريد قابل للقراءة: PR-20260802-XXXXXX */
export function buildPrintRef(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PR-${stamp}-${random}`;
}
