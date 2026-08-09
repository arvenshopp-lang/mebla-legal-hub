/**
 * PLAN 4 — أدوات مشتركة: تسجيل النتائج، جسر دوال الخادم، وقراءة الحقيقة من القاعدة.
 * لا يُطبع أي سر، وكل تحقق يقارن نتيجة الواجهة/الدالة بقيم قاعدة البيانات الفعلية.
 */
import { APP, SUPABASE_URL, adminFetch, signIn } from "./qa-support";
import { loadP3, type P3Ctx } from "./plan3-fixture";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";

export type Status = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED";
export type Row = { section: string; name: string; status: Status; detail: string };

export const rows: Row[] = [];

export async function t(
  section: string,
  name: string,
  fn: () => Promise<string | void>,
): Promise<void> {
  try {
    const detail = (await fn()) ?? "";
    rows.push({ section, name, status: "PASS", detail });
    console.log(`PASS [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status: Status = msg.startsWith("BLOCKED:")
      ? "BLOCKED"
      : msg.startsWith("NOT_TESTED:")
        ? "NOT_TESTED"
        : "FAIL";
    rows.push({ section, name, status, detail: msg.slice(0, 400) });
    console.log(`${status} [${section}] ${name} — ${msg.slice(0, 300)}`);
  }
}

export function expect(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

export function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected)
    throw new Error(`${label}: المتوقع ${String(expected)} والفعلي ${String(actual)}`);
}

/** استعلام SQL حقيقي عبر REST (قراءة تحقق فقط، بمفتاح الخدمة). */
export async function rest<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T[]> {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as T[];
  } catch {
    return [];
  }
}

export async function restOne<T = Record<string, unknown>>(path: string): Promise<T | null> {
  const list = await rest<T>(path);
  return list[0] ?? null;
}

export type Fns = Record<string, ServerFnRef>;
const modCache = new Map<string, Fns>();
export async function mod(path: string): Promise<Fns> {
  const hit = modCache.get(path);
  if (hit) return hit;
  const fns = await resolveServerFns(APP, path);
  modCache.set(path, fns);
  return fns;
}

export async function call(
  fns: Fns,
  name: string,
  token: string,
  data?: unknown,
): Promise<{ ok: boolean; message: string; raw: string; value: unknown }> {
  const ref = fns[name];
  if (!ref) throw new Error(`الدالة ${name} غير موجودة في الوحدة.`);
  const r = await callServerFn({ appOrigin: APP, ref, token, data });
  return { ok: r.ok, message: r.message, raw: r.raw, value: extractValue(r.raw) };
}

/**
 * فك ترميز إطار seroval الذي يعيده TanStack Start إلى قيمة JS عادية.
 * ندعم العُقد المستخدمة فعلياً: النصوص والأرقام والثوابت والمصفوفات والكائنات
 * والمراجع المتكررة — وهذا يكفي لمقارنة القيم بقاعدة البيانات.
 */
const CONSTANTS: Record<number, unknown> = {
  0: null,
  1: undefined,
  2: true,
  3: false,
  4: -0,
  5: Infinity,
  6: -Infinity,
  7: NaN,
};

type Node = {
  t: number;
  i?: number;
  s?: unknown;
  l?: number;
  a?: Node[];
  p?: { k: string[]; v: Node[] };
};

function decodeNode(node: Node | null | undefined, refs: Map<number, unknown>): unknown {
  if (node === null || node === undefined) return undefined;
  if (typeof node !== "object") return node;
  if (node.t === 2) return CONSTANTS[node.s as number];
  if (node.t === 1 || node.t === 0 || node.t === 4) {
    const value = node.s;
    if (node.i !== undefined) refs.set(node.i, value);
    return value;
  }
  if (node.t === 5 && node.i !== undefined) return refs.get(node.i);
  if (Array.isArray(node.a)) {
    const arr: unknown[] = [];
    if (node.i !== undefined) refs.set(node.i, arr);
    for (const item of node.a) arr.push(decodeNode(item, refs));
    return arr;
  }
  if (node.p) {
    const obj: Record<string, unknown> = {};
    if (node.i !== undefined) refs.set(node.i, obj);
    node.p.k.forEach((key, index) => {
      obj[key] = decodeNode(node.p!.v[index], refs);
    });
    return obj;
  }
  if (node.s !== undefined) return node.s;
  if (node.i !== undefined && refs.has(node.i)) return refs.get(node.i);
  return undefined;
}

/** يعيد قيمة `result` من إطار الاستجابة، أو القيمة المفكوكة كاملة إن لم توجد. */
export function extractValue(raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const decoded = decodeNode(parsed as Node, new Map());
  if (decoded && typeof decoded === "object" && "result" in (decoded as object))
    return (decoded as { result: unknown }).result;
  return decoded;
}

export function pick(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`"${key}"[\\s\\S]{0,60}?"((?:[^"\\\\]|\\\\.)*)"`));
  return m?.[1] ? (JSON.parse(`"${m[1]}"`) as string) : null;
}

export function pickNumber(raw: string, key: string): number | null {
  const m = raw.match(new RegExp(`"${key}":(-?\\d+(?:\\.\\d+)?)`));
  return m?.[1] ? Number(m[1]) : null;
}

/** يتحقق أن رسالة الخطأ عربية ولا تكشف تفاصيل داخلية. */
export function assertSafeArabic(message: string, label: string): void {
  expect(/[\u0600-\u06FF]/.test(message), `${label}: الرسالة ليست عربية → ${message.slice(0, 120)}`);
  const leaks = [
    /at \w+ \(/,
    /\bselect\b.*\bfrom\b/i,
    /supabase\.co/i,
    /postgres/i,
    /pgrst/i,
    /service_role/i,
    /eyJ[A-Za-z0-9_-]{10,}/,
    /sb_(secret|publishable)_/,
    /row-level security/i,
  ];
  for (const re of leaks)
    expect(!re.test(message), `${label}: الرسالة تكشف تفاصيل داخلية → ${message.slice(0, 160)}`);
}

export type Plan4Ctx = P3Ctx & {
  volume: { orgId: string; orgName: string; ownerEmail: string; ownerToken: string };
};

/** يحمّل سياق PLAN 3 ويجدّد التوكنات، ويضم مكتب البيانات الضخم للقراءات الحجمية. */
export async function loadCtx(): Promise<Plan4Ctx> {
  const p3 = await loadP3();
  for (const acct of [p3.superAdmin, p3.plainStaff, p3.officeOwner]) {
    acct.token = await signIn(acct.email, p3.password);
  }
  const org = await restOne<{ id: string; name: string }>(
    `organizations?name=like.QA-LIVE-20260809-*&select=id,name&limit=1`,
  );
  if (!org) throw new Error("مكتب البيانات الضخم غير موجود — شغّل qa-volume-fixture أولاً.");
  const ownerEmail = "qa.live.owner@mehlaqa.test";
  const list = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(ownerEmail)}`,
  );
  const found = ((await list.json()) as { users?: { id: string; email: string }[] }).users?.find(
    (u) => u.email?.toLowerCase() === ownerEmail,
  );
  if (!found) throw new Error("حساب مالك مكتب البيانات الضخم غير موجود.");
  await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
    method: "PUT",
    body: JSON.stringify({ password: p3.password, email_confirm: true }),
  });
  const ownerToken = await signIn(ownerEmail, p3.password);
  return { ...p3, volume: { orgId: org.id, orgName: org.name, ownerEmail, ownerToken } };
}

export async function writeReport(file: string): Promise<void> {
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  console.log(
    `\nالملخص: PASS=${count("PASS")} FAIL=${count("FAIL")} BLOCKED=${count("BLOCKED")} NOT_TESTED=${count("NOT_TESTED")}`,
  );
  for (const r of rows.filter((r) => r.status !== "PASS"))
    console.log(`  ${r.status} [${r.section}] ${r.name} — ${r.detail.slice(0, 200)}`);
  await Bun.write(file, JSON.stringify(rows, null, 2));
}
