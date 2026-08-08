/** ثوابت وأدوات مشتركة لسكربتات اختبار QA (لا تُطبع أي أسرار). */
export const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
export const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
export const PUBLISHABLE =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
export const APP = process.env["APP_ORIGIN"] ?? "http://localhost:8080";

if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE) {
  console.error("مفاتيح الاتصال غير متاحة في البيئة.");
  process.exit(1);
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
  return fetch(url, { ...init, headers: { ...adminHeaders, ...(init.headers ?? {}) } });
}

export async function signIn(email: string, password: string): Promise<string> {
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
