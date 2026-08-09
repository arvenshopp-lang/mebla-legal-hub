/**
 * FEATURE 01 — الصفحة العامة للمكتب: أدوات القبول النهائي المشتركة.
 *
 * كل إجراء يُنفّذ بدوال الإنتاج نفسها (createServerFn) بتوكن حقيقي، وكل قراءة عامة
 * تمر بالمسارات العامة الحقيقية كزائر مجهول. لا تُطبع أي أسرار ولا توكنات.
 */
import { SUPABASE_URL, PUBLISHABLE, APP, adminFetch, signIn, asUser } from "../qa-support";
import { resolveServerFns, callServerFn, type ServerFnRef } from "../serverfn-rpc";

export { SUPABASE_URL, PUBLISHABLE, APP, adminFetch, signIn, asUser };

export const OFFICE_FNS = "src/lib/office-page.functions.ts";
export const ADMIN_ORG_FNS = "src/lib/admin-orgs.functions.ts";
export const PASSWORD = `Qa!${crypto.randomUUID()}`;
export const FIXTURES = "/tmp/browser/f01";

export type Row = Record<string, unknown>;
export type Status = "PASS" | "FAIL" | "BLOCKED";
export type Result = { category: string; name: string; status: Status; detail: string };

export const results: Result[] = [];

export function rec(category: string, name: string, status: Status, detail = "") {
  results.push({ category, name, status, detail });
  console.log(`${status.padEnd(7)} [${category}] ${name}${detail ? ` :: ${detail}` : ""}`);
}
export function check(category: string, name: string, ok: boolean, detail = "") {
  rec(category, name, ok ? "PASS" : "FAIL", detail);
  return ok;
}

export function summarize(): { fail: number; pass: number; blocked: number } {
  const cats = [...new Set(results.map((r) => r.category))];
  console.log("\n================ ملخّص القبول ================");
  for (const c of cats) {
    const rows = results.filter((r) => r.category === c);
    const p = rows.filter((r) => r.status === "PASS").length;
    const f = rows.filter((r) => r.status === "FAIL").length;
    const b = rows.filter((r) => r.status === "BLOCKED").length;
    console.log(`${c}: PASS=${p} FAIL=${f} BLOCKED=${b}`);
    for (const r of rows.filter((x) => x.status !== "PASS"))
      console.log(`   ${r.status} → ${r.name} :: ${r.detail}`);
  }
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`الإجمالي: PASS=${pass} FAIL=${fail} BLOCKED=${blocked}`);
  return { fail, pass, blocked };
}

/* ---------------------------------------------------------- قاعدة البيانات */

export async function rest(path: string, init: RequestInit = {}): Promise<Row[]> {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Row[];
  } catch {
    return [];
  }
}
export const one = async (path: string): Promise<Row | undefined> => (await rest(path))[0];
export const del = (path: string) => rest(path, { method: "DELETE" });

/* ------------------------------------------------------------ دوال الخادم */

const refs = new Map<string, Record<string, ServerFnRef>>();
export async function fnRef(modulePath: string, name: string): Promise<ServerFnRef> {
  if (!refs.has(modulePath)) refs.set(modulePath, await resolveServerFns(APP, modulePath));
  const ref = refs.get(modulePath)![name];
  if (!ref) throw new Error(`دالة غير موجودة: ${modulePath}#${name}`);
  return ref;
}
export async function call(modulePath: string, name: string, token: string | undefined, data?: unknown) {
  return callServerFn({ appOrigin: APP, ref: await fnRef(modulePath, name), token, data });
}
export const office = (name: string, token: string | undefined, data?: unknown) =>
  call(OFFICE_FNS, name, token, data);

/**
 * فك إطار seroval الذي تعيده دوال الخادم إلى قيمة JavaScript حقيقية.
 * الإطار شجرة عُقد: (0 رقم، 1 نص، 2 ثابت، 4 مرجع مُفهرس، 9 مصفوفة، 10/11 كائن).
 */
type SerovalNode = {
  t: number;
  i?: number;
  s?: unknown;
  l?: number;
  a?: (SerovalNode | null)[];
  p?: { k: string[]; v: SerovalNode[] };
};

const SEROVAL_CONSTANTS: Record<number, unknown> = {
  0: null,
  1: undefined,
  2: true,
  3: false,
  4: -0,
  5: Infinity,
  6: -Infinity,
  7: NaN,
};

function decodeSeroval(node: SerovalNode | null, refs: Map<number, unknown>): unknown {
  if (!node) return undefined;
  const remember = (value: unknown) => {
    if (typeof node.i === "number") refs.set(node.i, value);
    return value;
  };
  switch (node.t) {
    case 0:
      return typeof node.s === "string" ? Number(node.s) : (node.s as number);
    case 1:
      return node.s as string;
    case 2:
      return SEROVAL_CONSTANTS[node.s as number];
    case 3:
      return String(node.s);
    case 4:
      return refs.get(node.s as number);
    case 9: {
      const arr: unknown[] = [];
      remember(arr);
      for (const item of node.a ?? []) arr.push(decodeSeroval(item, refs));
      return arr;
    }
    case 10:
    case 11: {
      const obj: Record<string, unknown> = {};
      remember(obj);
      const keys = node.p?.k ?? [];
      const values = node.p?.v ?? [];
      keys.forEach((key, index) => {
        obj[key] = decodeSeroval(values[index] ?? null, refs);
      });
      return obj;
    }
    default:
      if (node.p) {
        const obj: Record<string, unknown> = {};
        remember(obj);
        (node.p.k ?? []).forEach((key, index) => {
          obj[key] = decodeSeroval(node.p!.v[index] ?? null, refs);
        });
        return obj;
      }
      return node.s;
  }
}

/** استخراج قيمة `result` الفعلية من إطار seroval الذي تعيده دوال الخادم. */
export function payload<T = unknown>(raw: string): T | null {
  let root: SerovalNode;
  try {
    root = JSON.parse(raw) as SerovalNode;
  } catch {
    return null;
  }
  const decoded = decodeSeroval(root, new Map()) as Record<string, unknown> | null;
  if (!decoded || typeof decoded !== "object") return null;
  if ("result" in decoded) return (decoded["result"] as T) ?? null;
  return decoded as T;
}

/* ------------------------------------------------------------- المستخدمون */

export async function ensureUser(email: string, fullName: string): Promise<string> {
  const list = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  const found = ((await list.json()) as { users?: { id: string; email: string }[] }).users?.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (found) {
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true, ban_duration: "none" }),
    });
    return found.id;
  }
  const res = await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر تهيئة ${email}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json()) as { id: string }).id;
}

/* --------------------------------------------------------- المسارات العامة */

export type PublicResponse = { status: number; body: string; headers: Headers };

export async function publicGet(path: string, headers: Record<string, string> = {}): Promise<PublicResponse> {
  const res = await fetch(`${APP}${path}`, { headers });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

export async function submitLead(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: { ok?: boolean; duplicate?: boolean; message?: string } }> {
  const res = await fetch(`${APP}/api/public/office/lead`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: { ok?: boolean; duplicate?: boolean; message?: string } = {};
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    json = { message: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

export async function sendEvent(body: unknown): Promise<number> {
  const res = await fetch(`${APP}/api/public/office/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
}

/* -------------------------------------------------------------- الوسائط */

export async function fixtureBase64(name: string): Promise<string> {
  const buf = await Bun.file(`${FIXTURES}/${name}`).arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));