/**
 * جسر استدعاء دوال الخادم (createServerFn) من سكربتات الاختبار.
 *
 * لا يخمّن معرّف الدالة: يقرأ الوحدة كما يحوّلها Vite فعلياً من خادم التطوير
 * ويستخرج المعرّف الحقيقي الذي يبنيه مُحوّل TanStack Start (`createClientRpc`)،
 * ثم يرسل الطلب بنفس البروتوكول (نفس الترويسات وترميز seroval وترويسة الأصل
 * التي تتطلبها حماية CSRF).
 */
import { toJSONAsync } from "seroval";

export type ServerFnRef = { method: "GET" | "POST"; id: string };

const cache = new Map<string, Record<string, ServerFnRef>>();

/** خريطة اسم التصدير → معرّف الدالة الحقيقي، من الوحدة المحوّلة نفسها. */
export async function resolveServerFns(
  appOrigin: string,
  modulePath: string,
): Promise<Record<string, ServerFnRef>> {
  const cached = cache.get(modulePath);
  if (cached) return cached;
  const res = await fetch(`${appOrigin}/${modulePath.replace(/^\/+/, "")}`);
  if (!res.ok) throw new Error(`تعذّر قراءة الوحدة المحوّلة: ${modulePath} (${res.status})`);
  const src = await res.text();
  const map: Record<string, ServerFnRef> = {};
  const re =
    /export const (\w+) = createServerFn\(\{\s*method:\s*"(GET|POST)"[\s\S]*?createClientRpc\("([^"]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) map[m[1]!] = { method: m[2] as "GET" | "POST", id: m[3]! };
  if (Object.keys(map).length === 0)
    throw new Error(`لم يُعثر على أي دالة خادم في ${modulePath} — تغيّر شكل التحويل.`);
  cache.set(modulePath, map);
  return map;
}

export type ServerFnResult = {
  status: number;
  ok: boolean;
  denied: boolean;
  /** رسالة الخطأ العربية كما يعيدها الخادم، إن وُجدت. */
  message: string;
  raw: string;
};

/** الرسالة المسلسلة تأتي بشكل seroval؛ نستخرج أول نص يشبه رسالة الخطأ. */
function extractMessage(raw: string): string {
  const serialized = raw.match(/"message"[\s\S]{0,40}?\{"t":\d+,"s":"((?:[^"\\]|\\.)*)"/);
  if (serialized?.[1]) return JSON.parse(`"${serialized[1]}"`) as string;
  const plain = raw.match(/"message":"((?:[^"\\]|\\.)*)"/);
  if (plain?.[1]) return JSON.parse(`"${plain[1]}"`) as string;
  return raw.slice(0, 200);
}

export async function callServerFn(opts: {
  appOrigin: string;
  ref: ServerFnRef;
  token?: string;
  data?: unknown;
}): Promise<ServerFnResult> {
  const { appOrigin, ref, token, data } = opts;
  let url = `${appOrigin}/_serverFn/${ref.id}`;
  const headers: Record<string, string> = {
    "x-tsr-serverFn": "true",
    accept: "application/x-tss-framed;v=1, application/x-ndjson, application/json",
    // حماية CSRF في TanStack Start ترفض الطلب بـ 403 بلا ترويسة أصل مطابقة.
    Origin: appOrigin,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let body: string | undefined;
  const payload = data === undefined ? {} : { data };
  const serialized = JSON.stringify(await toJSONAsync(payload));
  if (ref.method === "POST") {
    headers["content-type"] = "application/json";
    body = serialized;
  } else if (data !== undefined) {
    url += `?payload=${encodeURIComponent(serialized)}`;
  }
  const res = await fetch(url, { method: ref.method, headers, body });
  const raw = await res.text();
  // الرفض يظهر إما بحالة غير 2xx أو بإطار خطأ مسلسل داخل استجابة 200.
  const errorFramed = /"\$TSR\/Error"|"__tsrError"|"isSerializedError"/.test(raw);
  const denied = !res.ok || errorFramed;
  return {
    status: res.status,
    ok: res.ok && !errorFramed,
    denied,
    message: denied ? extractMessage(raw) : "",
    raw,
  };
}
