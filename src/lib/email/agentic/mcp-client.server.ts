/**
 * عميل MCP لخادم Hostinger Agentic Mail — خادمي فقط.
 *
 * قواعد ثابتة:
 *  - الرمز يُقرأ من البيئة داخل الدالة فقط، ولا يُعاد، ولا يُسجَّل، ولا يُخزَّن.
 *  - لا تُسجَّل أي ترويسة طلب مطلقاً؛ ويُعقَّم كل نص خطأ قبل الإرجاع.
 *  - مدة انتظار قصوى، حد لحجم الاستجابة، منع اتباع إعادة التوجيه، وفحص SSRF.
 *  - قاطع دائرة ومحدّد معدل داخل نفس النسخة لمنع إغراق المزوّد عند التعطل.
 */
import { assertUrlAllowed } from "@/lib/integrations/ssrf.server";

const DEFAULT_URL = "https://mcp.mail.hostinger.com/mcp";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

export class AgenticMailError extends Error {
  code: string;
  status: number | null;
  requestId: string;
  constructor(code: string, message: string, status: number | null, requestId: string) {
    super(`${code}: ${message}`.slice(0, 500));
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export type McpTool = {
  name: string;
  title: string | null;
  description: string | null;
  inputSchema: { properties: Record<string, unknown>; required: string[] };
};

export type McpCallResult = {
  isError: boolean;
  text: string;
  json: unknown | null;
  latencyMs: number;
  requestId: string;
};

/** حالة تشغيلية داخل النسخة فقط (لا تُخزَّن ولا تُعاد للواجهة). */
const runtime = {
  windowStart: 0,
  windowCount: 0,
  failures: 0,
  openedAt: 0,
  sessionId: null as string | null,
  sessionAt: 0,
};

export function agenticMcpUrl(): string {
  return (process.env["HOSTINGER_MAIL_MCP_URL"] ?? "").trim() || DEFAULT_URL;
}

/** هل السر موجود؟ لا تُعاد قيمته أبداً. */
export function agenticSecretPresent(): boolean {
  return (process.env["HOSTINGER_MAIL_API_TOKEN"] ?? "").trim().length >= 8;
}

function token(): string {
  const value = (process.env["HOSTINGER_MAIL_API_TOKEN"] ?? "").trim();
  if (value.length < 8) {
    throw new AgenticMailError(
      "secret_missing",
      "لم يُضَف مفتاح Hostinger Agentic Mail في أسرار المنصة.",
      null,
      "-",
    );
  }
  return value;
}

/** تعقيم أي نص قبل التسجيل أو الإرجاع: يمنع ظهور الرمز أو ترويسة المصادقة. */
export function redactAgentic(input: string): string {
  const secret = (process.env["HOSTINGER_MAIL_API_TOKEN"] ?? "").trim();
  let out = String(input)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 600);
  if (secret.length >= 8) out = out.split(secret).join("«محجوب»");
  return out
    .replace(/authorization\s*[:=]\s*\S+/gi, "authorization: «محجوب»")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "Bearer «محجوب»")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "«محجوب»");
}

function guardRate(requestId: string): void {
  const now = Date.now();
  if (now - runtime.windowStart > RATE_WINDOW_MS) {
    runtime.windowStart = now;
    runtime.windowCount = 0;
  }
  runtime.windowCount += 1;
  if (runtime.windowCount > RATE_LIMIT) {
    throw new AgenticMailError(
      "rate_limited",
      "تجاوز عدد الطلبات الحد المسموح داخلياً؛ أعد المحاولة بعد دقيقة.",
      null,
      requestId,
    );
  }
  if (runtime.openedAt && now - runtime.openedAt < BREAKER_COOLDOWN_MS) {
    throw new AgenticMailError(
      "circuit_open",
      "أُوقفت المحاولات مؤقتاً بعد فشل متكرر مع المزوّد.",
      null,
      requestId,
    );
  }
  if (runtime.openedAt) {
    runtime.openedAt = 0;
    runtime.failures = 0;
  }
}

function noteFailure(): void {
  runtime.failures += 1;
  if (runtime.failures >= BREAKER_THRESHOLD) runtime.openedAt = Date.now();
}

async function readLimited(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** استخراج حِزم JSON من استجابة عادية أو تدفق SSE (Streamable HTTP). */
function parseRpcBody(raw: string): Record<string, unknown>[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? (parsed as Record<string, unknown>[])
        : [parsed as Record<string, unknown>];
    } catch {
      return [];
    }
  }
  const packets: Record<string, unknown>[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      packets.push(JSON.parse(payload) as Record<string, unknown>);
    } catch {
      /* حزمة غير مكتملة تُهمل */
    }
  }
  return packets;
}

export type RpcOutcome = {
  result: Record<string, unknown> | null;
  latencyMs: number;
  requestId: string;
  sessionId: string | null;
};

/** نداء JSON-RPC واحد. correlationId يربط كل نداءات العملية الواحدة في السجل. */
async function rpc(
  method: string,
  params: Record<string, unknown> | undefined,
  options: { correlationId: string; timeoutMs?: number; sessionId?: string | null },
): Promise<RpcOutcome> {
  const requestId = `${options.correlationId}:${crypto.randomUUID().slice(0, 8)}`;
  guardRate(requestId);

  const url = agenticMcpUrl();
  assertUrlAllowed(url, { environment: "production" });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token()}`,
    "MCP-Protocol-Version": "2025-06-18",
    "X-Request-Id": requestId,
  };
  const session = options.sessionId ?? runtime.sessionId;
  if (session) headers["Mcp-Session-Id"] = session;

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params: params ?? {} }),
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30_000)),
    });
  } catch (error) {
    noteFailure();
    const detail = error instanceof Error ? error.message : String(error);
    throw new AgenticMailError("network_error", redactAgentic(detail), null, requestId);
  }

  const latencyMs = Date.now() - started;
  const newSession = response.headers.get("mcp-session-id");
  if (newSession) runtime.sessionId = newSession;

  if (response.status >= 300 && response.status < 400) {
    noteFailure();
    throw new AgenticMailError(
      "redirect_blocked",
      "رفضت المنصة إعادة توجيه المزوّد.",
      response.status,
      requestId,
    );
  }
  const raw = await readLimited(response);

  if (response.status === 401 || response.status === 403) {
    noteFailure();
    runtime.sessionId = null;
    throw new AgenticMailError(
      "unauthorized",
      "رفض المزوّد المفتاح الحالي — تأكد من صلاحيته وعدم إلغائه.",
      response.status,
      requestId,
    );
  }
  if (response.status === 429) {
    noteFailure();
    throw new AgenticMailError("provider_rate_limited", "تجاوزت حدود المزوّد.", 429, requestId);
  }
  if (!response.ok) {
    noteFailure();
    throw new AgenticMailError(
      "provider_error",
      redactAgentic(raw.slice(0, 300)) || "استجابة غير ناجحة من المزوّد.",
      response.status,
      requestId,
    );
  }

  const packets = parseRpcBody(raw);
  const answer =
    packets.find((p) => p.id === requestId) ?? packets.find((p) => "result" in p || "error" in p);
  if (!answer) {
    noteFailure();
    throw new AgenticMailError(
      "invalid_response",
      "استجابة غير مفهومة من خادم MCP.",
      response.status,
      requestId,
    );
  }
  if (answer.error) {
    const err = answer.error as { code?: number; message?: string };
    throw new AgenticMailError(
      "rpc_error",
      redactAgentic(err.message ?? "خطأ من خادم MCP."),
      response.status,
      requestId,
    );
  }

  runtime.failures = 0;
  return {
    result: (answer.result ?? null) as Record<string, unknown> | null,
    latencyMs,
    requestId,
    sessionId: runtime.sessionId,
  };
}

/** تهيئة الجلسة (initialize + notifications/initialized) مع إعادة استخدام قصيرة. */
async function ensureSession(correlationId: string): Promise<void> {
  if (runtime.sessionId && Date.now() - runtime.sessionAt < 5 * 60_000) return;
  runtime.sessionId = null;
  const outcome = await rpc(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mehla-email-workspace", version: "1.0.0" },
    },
    { correlationId, sessionId: null },
  );
  runtime.sessionAt = Date.now();
  if (runtime.sessionId) {
    // إشعار بلا معرّف: تجاهل أي فشل لأنه ليس نداءً يتطلب استجابة.
    await rpc("notifications/initialized", {}, { correlationId }).catch(() => undefined);
  }
  void outcome;
}

export type ConnectionProbe = {
  ok: boolean;
  latencyMs: number;
  serverName: string | null;
  serverVersion: string | null;
  protocolVersion: string | null;
  requestId: string;
  error: { code: string; message: string } | null;
};

/** اختبار اتصال حقيقي: initialize فعلي دون أي تعديل على البريد. */
export async function probeConnection(correlationId: string): Promise<ConnectionProbe> {
  runtime.sessionId = null;
  runtime.sessionAt = 0;
  try {
    const outcome = await rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mehla-email-workspace", version: "1.0.0" },
      },
      { correlationId, sessionId: null },
    );
    runtime.sessionAt = Date.now();
    const info = (outcome.result?.serverInfo ?? {}) as { name?: string; version?: string };
    return {
      ok: true,
      latencyMs: outcome.latencyMs,
      serverName: info.name ?? null,
      serverVersion: info.version ?? null,
      protocolVersion: (outcome.result?.protocolVersion as string | undefined) ?? null,
      requestId: outcome.requestId,
      error: null,
    };
  } catch (error) {
    const failure =
      error instanceof AgenticMailError
        ? { code: error.code, message: error.message }
        : { code: "unknown_error", message: redactAgentic(String(error)) };
    return {
      ok: false,
      latencyMs: 0,
      serverName: null,
      serverVersion: null,
      protocolVersion: null,
      requestId: error instanceof AgenticMailError ? error.requestId : "-",
      error: failure,
    };
  }
}

function schemaOf(raw: unknown): McpTool["inputSchema"] {
  const schema = (raw ?? {}) as { properties?: unknown; required?: unknown };
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((r): r is string => typeof r === "string")
    : [];
  return { properties, required };
}

/** اكتشاف الأدوات الفعلية التي يعرضها الخادم — لا تُفترض أي أداة مسبقاً. */
export async function listTools(correlationId: string): Promise<McpTool[]> {
  await ensureSession(correlationId);
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const outcome = await rpc("tools/list", cursor ? { cursor } : {}, { correlationId });
    const list = Array.isArray(outcome.result?.tools) ? (outcome.result?.tools as unknown[]) : [];
    for (const entry of list) {
      const tool = entry as {
        name?: unknown;
        title?: unknown;
        description?: unknown;
        inputSchema?: unknown;
      };
      if (typeof tool.name !== "string" || !tool.name.trim()) continue;
      tools.push({
        name: tool.name.trim(),
        title: typeof tool.title === "string" ? tool.title : null,
        description: typeof tool.description === "string" ? tool.description.slice(0, 300) : null,
        inputSchema: schemaOf(tool.inputSchema),
      });
    }
    const next = outcome.result?.nextCursor;
    if (typeof next === "string" && next) cursor = next;
    else break;
  }
  return tools;
}

/** تنفيذ أداة واحدة. تُعاد النتيجة نصاً وJSON دون أي ترويسة أو سر. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  options: { correlationId: string; timeoutMs?: number },
): Promise<McpCallResult> {
  await ensureSession(options.correlationId);
  const outcome = await rpc(
    "tools/call",
    { name, arguments: args },
    { correlationId: options.correlationId, timeoutMs: options.timeoutMs },
  );
  const result = outcome.result ?? {};
  const content = Array.isArray(result.content)
    ? (result.content as Record<string, unknown>[])
    : [];
  const text = content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .slice(0, 400_000);

  let json: unknown | null = (result.structuredContent as unknown) ?? null;
  if (json === null && text.trim().startsWith("{")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (json === null && text.trim().startsWith("[")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return {
    isError: result.isError === true,
    text,
    json,
    latencyMs: outcome.latencyMs,
    requestId: outcome.requestId,
  };
}
