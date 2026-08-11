/** ثوابت وأدوات مشتركة لسكربتات اختبار QA (لا تُطبع أي أسرار). */
import { readFileSync } from "node:fs";

export const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
export const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
export const PUBLISHABLE =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
export const APP = process.env["APP_ORIGIN"] ?? "http://localhost:8080";

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE) {
  console.error("مفاتيح الاتصال غير متاحة في البيئة.");
  process.exit(1);
}

/* ============================ بوابة fail-closed ============================
 * لا يجوز لأي تشغيل E2E تدميري (إنشاء حسابات، مكتب QA، أي كتابة إدارية) أن
 * يلمس قاعدة التشغيل الفعلية. البوابة تتحقق من حارسين معاً:
 *   1) أصل التطبيق (APP_ORIGIN) محلي أو معاينة مسموحة، وليس نطاق إنتاج.
 *   2) الخادم الخلفي (SUPABASE_URL / SUPABASE_PROJECT_ID) ليس مشروع الإنتاج
 *      المعروف من إعداد التطبيق ولا أي مرجع إنتاج معلن.
 * الرسائل لا تحتوي أي URL أو مفتاح أو توكن أو معرّف مشروع.
 * ========================================================================= */

const PRODUCTION_APP_HOSTS = [/(^|\.)mehlalex\.com$/, /^mebla\.lovable\.app$/];

/** مرجع مشروع Supabase من رابط أو معرّف، دون كشف القيمة. */
function projectRefOf(value: string | undefined): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (!raw.includes("://")) return raw;
  try {
    return new URL(raw).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * مراجع الإنتاج المرجعية: تُقرأ من إعداد التطبيق العام (ملف البيئة) ومن
 * MEHLA_PROD_PROJECT_REF عند تمريره. لا تُخزّن أي قيمة في المصدر.
 */
function productionProjectRefs(): Set<string> {
  const refs = new Set<string>();
  const add = (v: string | undefined) => {
    const ref = projectRefOf(v);
    if (ref) refs.add(ref);
  };
  add(process.env["MEHLA_PROD_PROJECT_REF"]);
  for (const file of [".env", ".env.production"]) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*(VITE_SUPABASE_PROJECT_ID|VITE_SUPABASE_URL)\s*=\s*(.+?)\s*$/);
      if (m) add(m[2]!.replace(/^["']|["']$/g, ""));
    }
  }
  return refs;
}

export type E2eGateResult = { allowed: boolean; reasons: string[] };

/** يقيّم البوابة دون أي طلب شبكة — قابل للاختبار الساكن. */
export function evaluateE2eGate(env: Record<string, string | undefined>): E2eGateResult {
  const reasons: string[] = [];

  if (env["MEHLA_E2E_ALLOW"] !== "1") {
    reasons.push("MEHLA_E2E_ALLOW=1 غير مضبوط (موافقة صريحة مطلوبة).");
  }

  // الحارس الأول: أصل التطبيق.
  const appOrigin = env["APP_ORIGIN"] ?? "http://localhost:8080";
  let host = "";
  try {
    host = new URL(appOrigin).hostname.toLowerCase();
  } catch {
    reasons.push("قيمة APP_ORIGIN غير صالحة.");
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  const isPreview = /(^|\.)id-preview--|-dev\.lovable\.app$/.test(host);
  if (host && PRODUCTION_APP_HOSTS.some((re) => re.test(host))) {
    reasons.push("أصل التطبيق هو نطاق إنتاج — مرفوض.");
  } else if (host && !isLocal && !isPreview) {
    reasons.push("أصل التطبيق ليس محلياً ولا معاينة مسموحة.");
  }

  // الحارس الثاني: الخادم الخلفي المستهدف.
  const targetRefs = [
    projectRefOf(env["SUPABASE_PROJECT_ID"]),
    projectRefOf(env["SUPABASE_URL"]),
    projectRefOf(env["VITE_SUPABASE_URL"]),
  ].filter(Boolean);
  if (targetRefs.length === 0) {
    reasons.push("لم يتحدّد مشروع الخادم الخلفي المستهدف.");
  } else {
    const prod = productionProjectRefs();
    if (prod.size === 0) {
      reasons.push("مرجع مشروع الإنتاج غير معروف للمقارنة — الرفض هو الوضع الآمن.");
    } else if (targetRefs.some((ref) => prod.has(ref))) {
      reasons.push("الخادم الخلفي المستهدف هو قاعدة التشغيل الفعلية — مرفوض.");
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

let gateChecked = false;

/**
 * تُستدعى قبل أول طلب شبكة أو كتابة. تُنهي العملية برمز 2 عند الرفض،
 * ولا تطبع أي قيمة حسّاسة.
 */
export function assertE2eEnvironmentSafe(): void {
  if (gateChecked) return;
  const { allowed, reasons } = evaluateE2eGate(process.env as Record<string, string | undefined>);
  if (!allowed) {
    console.error("توقّف fail-closed قبل أي طلب شبكة أو إنشاء بيانات:");
    for (const r of reasons) console.error(` - ${r}`);
    process.exit(2);
  }
  gateChecked = true;
}

export const ORG_ROLES = ["owner", "admin", "lawyer", "legal_assistant", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const QA_ORG_PREFIX = "QA-E2E-20260808-";
export const QA_FILE = "/tmp/browser/qa-org.json";

export const adminHeaders: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

export function adminFetch(url: string, init: RequestInit = {}) {
  assertE2eEnvironmentSafe();
  return fetch(url, { ...init, headers: { ...adminHeaders, ...(init.headers ?? {}) } });
}

export async function signIn(email: string, password: string): Promise<string> {
  assertE2eEnvironmentSafe();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`تعذّر تسجيل الدخول (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** قراءة/كتابة عبر Data API بتوكن مستخدم فعلي — يمر بسياسات RLS كما في الإنتاج. */
export async function asUser(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  assertE2eEnvironmentSafe();
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* نص خام */
  }
  return { status: res.status, body };
}

export type QaOrg = {
  organizationId: string;
  orgName: string;
  password: string;
  accounts: { role: OrgRole | "outsider"; email: string; userId: string; token: string }[];
};

export async function loadQaOrg(): Promise<QaOrg> {
  return (await Bun.file(QA_FILE).json()) as QaOrg;
}
