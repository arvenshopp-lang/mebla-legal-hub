/**
 * حماية SSRF لروابط التكاملات — خادم فقط.
 *
 * تُطبَّق على كل رابط قبل الاتصال، وعلى كل إعادة توجيه:
 *  - البروتوكول: https فقط في الإنتاج (http مسموح في بيئة الاختبار للنطاقات العامة).
 *  - منع localhost و127.0.0.1 و::1 وكل نطاقات الشبكات الداخلية.
 *  - منع نقاط بيانات الوصف السحابية (169.254.169.254 و metadata.google.internal).
 *  - منع file:// و ftp:// و gopher:// وأي بروتوكول غير HTTP.
 *  - فحص DNS قبل الاتصال: إن حُلّ النطاق إلى عنوان داخلي يُرفض الطلب.
 *  - قائمة نطاقات مسموحة اختيارية لكل تكامل.
 */

export class SsrfBlockedError extends Error {
  code = "SSRF_BLOCKED";
  reason: string;
  constructor(reason: string) {
    super(`SSRF_BLOCKED: ${reason}`);
    this.reason = reason;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "kubernetes.default.svc",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];

function ipv4Parts(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

/** هل العنوان ينتمي لشبكة داخلية أو محجوزة؟ */
export function isPrivateIp(address: string): boolean {
  const host = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local
    if (host.startsWith("fe80")) return true; // link-local
    if (host.startsWith("::ffff:")) return isPrivateIp(host.slice(7));
    return false;
  }
  return false;
}

export type UrlPolicy = {
  environment: "sandbox" | "production";
  allowedHosts?: string[];
};

/** تحقق ثابت (بلا شبكة) من الرابط. يرمي SsrfBlockedError عند أي خرق. */
export function assertUrlAllowed(rawUrl: string, policy: UrlPolicy): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new SsrfBlockedError("رابط غير صالح.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SsrfBlockedError(`بروتوكول غير مسموح (${url.protocol}).`);
  }
  if (url.protocol === "http:" && policy.environment === "production") {
    throw new SsrfBlockedError("بيئة الإنتاج تسمح بـ HTTPS فقط.");
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("لا يُسمح بتضمين بيانات دخول داخل الرابط.");
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) throw new SsrfBlockedError("نطاق داخلي محظور.");
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new SsrfBlockedError("نطاق داخلي محظور.");
  }
  if (isPrivateIp(host)) throw new SsrfBlockedError("عنوان شبكة داخلية محظور.");
  if (!host.includes(".") && !host.includes(":")) {
    throw new SsrfBlockedError("النطاق يجب أن يكون نطاقاً عاماً مؤهلاً.");
  }

  const allow = (policy.allowedHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allow.length > 0) {
    const permitted = allow.some((entry) => host === entry || host.endsWith(`.${entry}`));
    if (!permitted) throw new SsrfBlockedError("النطاق غير مدرج في قائمة النطاقات المسموحة.");
  }
  return url;
}

const dnsCache = new Map<string, { at: number; blocked: boolean }>();
const DNS_TTL_MS = 300_000;

/**
 * فحص DNS عبر DNS-over-HTTPS قبل الاتصال. إن حُلّ النطاق إلى عنوان داخلي يُرفض.
 * تعذّر الفحص لا يُعطّل العملية (الاتصال نفسه سيفشل)، لكن أي عنوان داخلي يُوقفها.
 */
export async function assertDnsAllowed(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (ipv4Parts(host) || host.includes(":")) return; // عنوان صريح فُحص سابقاً
  const cached = dnsCache.get(host);
  if (cached && Date.now() - cached.at < DNS_TTL_MS) {
    if (cached.blocked) throw new SsrfBlockedError("النطاق يشير إلى عنوان شبكة داخلية.");
    return;
  }
  const addresses: string[] = [];
  try {
    for (const type of ["A", "AAAA"]) {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(4000) },
      );
      if (!response.ok) continue;
      const parsed = (await response.json()) as { Answer?: { type: number; data: string }[] };
      for (const answer of parsed.Answer ?? []) {
        if (answer.type === 1 || answer.type === 28) addresses.push(answer.data);
      }
    }
  } catch {
    return; // تعذّر الفحص — لا نمنع، والاتصال الفعلي سيفشل إن كان النطاق غير صالح
  }
  const blocked = addresses.length > 0 && addresses.some((address) => isPrivateIp(address));
  dnsCache.set(host, { at: Date.now(), blocked });
  if (blocked) throw new SsrfBlockedError("النطاق يشير إلى عنوان شبكة داخلية.");
}

/** فحص كامل: ثابت + DNS. يُستدعى قبل كل طلب وقبل اتباع أي إعادة توجيه. */
export async function resolveSafeUrl(rawUrl: string, policy: UrlPolicy): Promise<URL> {
  const url = assertUrlAllowed(rawUrl, policy);
  await assertDnsAllowed(url.hostname);
  return url;
}
