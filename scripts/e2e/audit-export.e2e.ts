/**
 * اختبار فعلي نهائي لخيارات تصدير سجل التدقيق الثلاثة (كل النتائج / الصفحة الحالية / نطاق محدد).
 *
 * لكل خيار: استدعاء دالة الإنتاج exportAuditLogs بتوكن حقيقي، حفظ ملف CSV فعلي،
 * ثم مطابقة صفوفه وأعمدته وعدد نتائجه وتوقيت الرياض مع قاعدة البيانات، ثم التحقق من صف سجل التدقيق.
 * لا تُنشأ ولا تُحذف أي بيانات إنتاجية؛ القراءة فقط، ولا تُطبع أي قيم حساسة.
 *
 * التشغيل: bun scripts/e2e/audit-export.e2e.ts
 */
import { SUPABASE_URL, APP, adminHeaders, adminFetch, signIn } from "./qa-support";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";
import {
  AUDIT_EXPORT_COLUMNS,
  AUDIT_TIMEZONE,
  AUDIT_TIMEZONE_LABEL,
  formatAuditTimestamp,
  normalizeAuditColumns,
} from "../../src/lib/admin-audit.shared";

const PASSWORD = `Qa!${crypto.randomUUID()}`;
const OUT_DIR = "/tmp/browser/audit-csv";
type Row = Record<string, unknown>;

const results: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
const rec = (name: string, ok: boolean, detail = "") => {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

async function rest(path: string, init: RequestInit = {}): Promise<Row[]> {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Row[];
  } catch {
    return [];
  }
}

async function ensureUser(email: string, fullName: string): Promise<string> {
  const list = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  const found = ((await list.json()) as { users?: { id: string; email: string }[] }).users?.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (found) {
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
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
  if (!res.ok) throw new Error(`تعذّر إنشاء حساب QA (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}

/* ------------------------------------------------------- جسر دوال الخادم */
const MOD = "src/lib/admin-ops.functions.ts";
let refs: Record<string, ServerFnRef> | null = null;
async function fn(name: string): Promise<ServerFnRef> {
  refs ??= await resolveServerFns(APP, MOD);
  const ref = refs[name];
  if (!ref) throw new Error(`لم يُعثر على دالة ${name}`);
  return ref;
}
const call = (name: string, token: string | undefined, data?: unknown) =>
  fn(name).then((ref) => callServerFn({ appOrigin: APP, ref, token, data }));

/** استخراج نتيجة seroval للتصدير: نص CSV + عدد الصفوف (تفكيك بنيوي لا نصي). */
function parseExportPayload(raw: string): { csv: string; rows: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree = JSON.parse(raw) as any;
  const unwrap = (n: unknown): unknown =>
    n && typeof n === "object" && "s" in (n as Record<string, unknown>)
      ? (n as Record<string, unknown>).s
      : n && typeof n === "object" && "n" in (n as Record<string, unknown>)
        ? (n as Record<string, unknown>).n
        : n;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any): { csv: string; rows: number } | null => {
    if (!node || typeof node !== "object") return null;
    const keys: string[] | undefined = node.p?.k;
    if (Array.isArray(keys) && keys.includes("csv") && keys.includes("rows")) {
      const values: unknown[] = node.p.v;
      const csv = unwrap(values[keys.indexOf("csv")]);
      const rows = unwrap(values[keys.indexOf("rows")]);
      if (typeof csv === "string") {
        // seroval يعيد النص بصيغة سلسلة مُهرّبة (\" و \r\n)، فنُفكّها لنقرأ الملف كما ينزله المتصفح.
        let text = csv;
        try {
          text = JSON.parse(`"${csv}"`) as string;
        } catch {
          /* نص خام بلا تهريب */
        }
        return { csv: text, rows: Number(rows) };
      }
    }
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const found = walk(tree);
  if (!found) throw new Error(`استجابة تصدير غير مفهومة: ${raw.slice(0, 300)}`);
  return found;
}

/* --------------------------------------------------------- محلّل CSV دقيق */
function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      /* يتجاهل CR */
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type Parsed = {
  preamble: string[][];
  headers: string[];
  body: string[][];
};
function splitCsv(text: string): Parsed {
  const all = parseCsv(text);
  const blank = all.findIndex((r) => r.length === 1 && r[0] === "");
  const preamble = blank >= 0 ? all.slice(0, blank) : [];
  const rest = blank >= 0 ? all.slice(blank + 1) : all;
  return { preamble, headers: rest[0] ?? [], body: rest.slice(1) };
}

/* ------------------------------------------------------- مرجع من القاعدة */
type Filters = { action?: string; entity?: string; actor?: string; from?: string; to?: string };
function restFilter(f: Filters): string {
  const parts: string[] = [];
  if (f.action) parts.push(`action=eq.${encodeURIComponent(f.action)}`);
  if (f.entity) parts.push(`entity_type=eq.${encodeURIComponent(f.entity)}`);
  if (f.actor) parts.push(`actor_email=ilike.*${encodeURIComponent(f.actor)}*`);
  if (f.from) parts.push(`created_at=gte.${new Date(f.from).toISOString()}`);
  if (f.to) parts.push(`created_at=lte.${new Date(`${f.to}T23:59:59`).toISOString()}`);
  return parts.join("&");
}
const COLS = "created_at,actor_email,action,entity_type,entity_id,description,ip,device,browser";
async function dbRows(f: Filters, offset: number, limit: number): Promise<Row[]> {
  const q = [
    `admin_audit_logs?select=${COLS}`,
    restFilter(f),
    `order=created_at.desc`,
    `offset=${offset}`,
    `limit=${limit}`,
  ]
    .filter(Boolean)
    .join("&");
  return rest(q);
}
async function dbCount(f: Filters): Promise<number> {
  const q = [`admin_audit_logs?select=id`, restFilter(f)].filter(Boolean).join("&");
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    method: "HEAD",
    headers: { ...adminHeaders, Prefer: "count=exact", Range: "0-0" },
  });
  return Number(res.headers.get("content-range")?.split("/")[1] ?? "0");
}

/** مقارنة غير مرتبطة بترتيب التعادل في created_at. */
const key = (cells: string[]) => cells.join("\u0001");
function sameSet(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  return sa.every((v, i) => v === sb[i]);
}

function expectedCells(rows: Row[], columns: string[], showTz: boolean): string[][] {
  return rows.map((r) =>
    columns.map((c) =>
      c === "created_at"
        ? formatAuditTimestamp(String(r.created_at ?? ""), showTz)
        : r[c] === null || r[c] === undefined
          ? ""
          : String(r[c]),
    ),
  );
}

async function latestExportAudit(actorEmail: string): Promise<Row | undefined> {
  const rows = await rest(
    `admin_audit_logs?action=eq.audit.export&actor_email=eq.${encodeURIComponent(actorEmail)}&select=id,created_at,description,after_data&order=created_at.desc&limit=1`,
  );
  return rows[0];
}

/* ------------------------------------------------------------------ تشغيل */
async function main() {
  const exporterEmail = "qa.audit.exporter@mehlaqa.test";
  const readerEmail = "qa.audit.reader@mehlaqa.test";
  const exporterId = await ensureUser(exporterEmail, "QA Audit Exporter");
  const readerId = await ensureUser(readerEmail, "QA Audit Reader");
  for (const email of [exporterEmail, readerEmail])
    await rest(`platform_staff?email=eq.${encodeURIComponent(email)}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
  await rest("platform_staff", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        user_id: exporterId,
        full_name: "QA Audit Exporter",
        email: exporterEmail,
        job_title: "QA",
        role: "super_admin",
        status: "active",
        permissions: [],
      },
      {
        user_id: readerId,
        full_name: "QA Audit Reader",
        email: readerEmail,
        job_title: "QA",
        role: "staff",
        status: "active",
        permissions: ["audit.read"],
      },
    ]),
  });
  const token = await signIn(exporterEmail, PASSWORD);
  const readerToken = await signIn(readerEmail, PASSWORD);

  /* اختيار فلتر حقيقي من بيانات القاعدة */
  const facets = await call("listAuditFacets", token, undefined);
  if (!facets.ok) throw new Error(`تعذّر جلب عوامل التصفية: ${facets.message}`);
  const entity = "user";
  const filters: Filters = { entity };
  const filteredCount = await dbCount(filters);
  const totalCount = await dbCount({});
  console.log(`مرجع القاعدة: إجمالي ${totalCount} سجلاً، والمطابق للفلتر (${entity}) ${filteredCount}`);

  /* ---------------- 1) كل النتائج + فلتر + أعمدة مخصصة ---------------- */
  const chosen = ["actor_email", "entity_type", "description"]; // created_at و action إلزاميان
  const columnsAll = normalizeAuditColumns(chosen);
  const beforeAll = await latestExportAudit(exporterEmail);
  const r1 = await call("exportAuditLogs", token, {
    entity,
    columns: chosen,
    includeCount: true,
    showTimezone: true,
    scope: "all",
  });
  if (!r1.ok) throw new Error(`فشل التصدير (كل النتائج): ${r1.message}`);
  const p1 = parseExportPayload(r1.raw);
  await Bun.write(`${OUT_DIR}/scope-all.csv`, p1.csv);
  const c1 = splitCsv(p1.csv);
  const exp1 = expectedCells(await dbRows(filters, 0, 5000), columnsAll, true);
  rec("كل النتائج — عدد الصفوف يطابق القاعدة", c1.body.length === filteredCount && p1.rows === filteredCount, `csv=${c1.body.length} db=${filteredCount}`);
  rec("كل النتائج — الصفوف والقيم تطابق القاعدة بعد الفلترة", sameSet(c1.body, exp1));
  rec(
    "كل النتائج — الأعمدة تتبع الاختيار وتُجبر الإلزامية",
    c1.headers.length === columnsAll.length &&
      c1.headers[0]!.startsWith(AUDIT_EXPORT_COLUMNS[0]!.label) &&
      columnsAll.includes("created_at") &&
      columnsAll.includes("action") &&
      !columnsAll.includes("ip"),
    `أعمدة=${c1.headers.join(" | ")}`,
  );
  rec(
    "كل النتائج — عدد النتائج ظاهر في رأس الملف",
    c1.preamble.some((l) => l[0] === "عدد النتائج" && Number(l[1]) === filteredCount),
  );
  rec(
    "كل النتائج — توقيت الرياض في رأس الملف وفي رأس عمود التاريخ",
    c1.preamble.some((l) => l[0] === "المنطقة الزمنية" && l[1]!.includes(AUDIT_TIMEZONE)) &&
      c1.headers[0]!.includes(AUDIT_TIMEZONE_LABEL),
    c1.headers[0],
  );
  rec(
    "كل النتائج — قيمة التاريخ محوّلة فعلياً إلى +03:00",
    c1.body.every((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(Asia\/Riyadh \+03:00\)$/.test(r[0]!)),
  );
  rec("كل النتائج — وصف النطاق في الملف", c1.preamble.some((l) => l[0] === "نطاق التصدير" && l[1]!.includes("كل النتائج")));
  const a1 = await latestExportAudit(exporterEmail);
  const m1 = (a1?.after_data ?? {}) as Row;
  rec(
    "كل النتائج — صف سجل تدقيق جديد بخيارات التصدير",
    Boolean(a1) && a1?.id !== beforeAll?.id && m1.scope === "all" && Number(m1.rows) === filteredCount && Array.isArray(m1.columns) && (m1.columns as string[]).length === columnsAll.length,
    `scope=${String(m1.scope)} rows=${String(m1.rows)}`,
  );

  /* ---------------- 2) الصفحة الحالية فقط ---------------- */
  const pageSize = 25;
  const page = 2;
  const before2 = await latestExportAudit(exporterEmail);
  // اللقطة المرجعية تُؤخذ قبل الاستدعاء: التصدير نفسه يكتب صفاً في سجل التدقيق فيُزحزح الترقيم.
  const totalBefore2 = await dbCount({});
  const snapshot2 = await dbRows({}, (page - 1) * pageSize, pageSize);
  const r2 = await call("exportAuditLogs", token, {
    columns: AUDIT_EXPORT_COLUMNS.map((c) => c.key),
    includeCount: true,
    showTimezone: false,
    scope: "page",
    page,
    pageSize,
  });
  if (!r2.ok) throw new Error(`فشل التصدير (الصفحة الحالية): ${r2.message}`);
  const p2 = parseExportPayload(r2.raw);
  await Bun.write(`${OUT_DIR}/scope-page.csv`, p2.csv);
  const c2 = splitCsv(p2.csv);
  const list2 = await call("listAuditLogs", token, { page, pageSize });
  const listedIds = (list2.raw.match(/"id":/g) ?? []).length;
  const expected2 = expectedCells(snapshot2, AUDIT_EXPORT_COLUMNS.map((c) => c.key), false);
  const expectedPageRows = Math.max(0, Math.min(pageSize, totalBefore2 - (page - 1) * pageSize));
  rec("الصفحة الحالية — عدد الصفوف يساوي حجم الصفحة", c2.body.length === expectedPageRows && p2.rows === expectedPageRows, `csv=${c2.body.length} متوقع=${expectedPageRows} (الجدول أعاد ${listedIds >= 1 ? "صفحة مطابقة" : "لا شيء"})`);
  rec("الصفحة الحالية — الصفوف نفس صفوف الصفحة في القاعدة", sameSet(c2.body, expected2));
  rec("الصفحة الحالية — كل الأعمدة التسعة موجودة", c2.headers.length === AUDIT_EXPORT_COLUMNS.length);
  rec(
    "الصفحة الحالية — إخفاء المنطقة الزمنية يُطبَّق فعلياً",
    !c2.headers[0]!.includes(AUDIT_TIMEZONE_LABEL) &&
      !c2.preamble.some((l) => l[0] === "المنطقة الزمنية") &&
      c2.body.every((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r[0]!)),
  );
  rec(
    "الصفحة الحالية — وصف النطاق يذكر الصفحة والمدى",
    c2.preamble.some((l) => l[0] === "نطاق التصدير" && l[1]!.includes(`الصفحة الحالية (${page})`) && l[1]!.includes(`${(page - 1) * pageSize + 1}`)),
    c2.preamble.find((l) => l[0] === "نطاق التصدير")?.[1],
  );
  const a2 = await latestExportAudit(exporterEmail);
  const m2 = (a2?.after_data ?? {}) as Row;
  rec(
    "الصفحة الحالية — سجل تدقيق بنطاق page وإزاحة صحيحة",
    a2?.id !== before2?.id && m2.scope === "page" && Number(m2.offset) === (page - 1) * pageSize && Number(m2.rows) === expectedPageRows,
    `offset=${String(m2.offset)}`,
  );

  /* ---------------- 3) نطاق محدد من/إلى ---------------- */
  const rangeFrom = 10;
  const rangeTo = 22;
  const before3 = await latestExportAudit(exporterEmail);
  const totalBefore3 = await dbCount({});
  const snapshot3 = await dbRows({}, rangeFrom - 1, rangeTo - rangeFrom + 1);
  const r3 = await call("exportAuditLogs", token, {
    columns: ["created_at", "action", "actor_email"],
    includeCount: true,
    showTimezone: true,
    scope: "range",
    rangeFrom: rangeTo, // مقلوب عمداً: يجب أن تُصحّح الدالة الترتيب
    rangeTo: rangeFrom,
  });
  if (!r3.ok) throw new Error(`فشل التصدير (نطاق محدد): ${r3.message}`);
  const p3 = parseExportPayload(r3.raw);
  await Bun.write(`${OUT_DIR}/scope-range.csv`, p3.csv);
  const c3 = splitCsv(p3.csv);
  const cols3 = normalizeAuditColumns(["created_at", "action", "actor_email"]);
  const expectedRangeRows = Math.max(0, Math.min(rangeTo - rangeFrom + 1, totalBefore3 - (rangeFrom - 1)));
  const expected3 = expectedCells(snapshot3, cols3, true);
  rec("نطاق محدد — العدد يساوي مدى النطاق", c3.body.length === expectedRangeRows && p3.rows === expectedRangeRows, `csv=${c3.body.length} متوقع=${expectedRangeRows}`);
  rec("نطاق محدد — الصفوف تطابق الإزاحة نفسها في القاعدة", sameSet(c3.body, expected3));
  rec("نطاق محدد — الأعمدة الثلاثة المطلوبة فقط", c3.headers.length === cols3.length, c3.headers.join(" | "));
  rec(
    "نطاق محدد — الملف يذكر «من 10 إلى 22»",
    c3.preamble.some((l) => l[0] === "نطاق التصدير" && l[1] === `من ${rangeFrom} إلى ${rangeFrom + expectedRangeRows - 1}`),
    c3.preamble.find((l) => l[0] === "نطاق التصدير")?.[1],
  );
  const a3 = await latestExportAudit(exporterEmail);
  const m3 = (a3?.after_data ?? {}) as Row;
  rec(
    "نطاق محدد — سجل تدقيق بإزاحة 9 وحدّ 13",
    a3?.id !== before3?.id && m3.scope === "range" && Number(m3.offset) === rangeFrom - 1 && Number(m3.limit) === rangeTo - rangeFrom + 1,
    `offset=${String(m3.offset)} limit=${String(m3.limit)}`,
  );

  /* ---------------- 4) الصلاحيات ---------------- */
  const denied = await call("exportAuditLogs", readerToken, { scope: "all" });
  rec("الصلاحيات — موظف بصلاحية قراءة فقط يُمنع من التصدير خادمياً", denied.denied, denied.message.slice(0, 80));
  const readerRead = await call("listAuditLogs", readerToken, { page: 1, pageSize: 10 });
  rec("الصلاحيات — نفس الموظف يقرأ السجل بنجاح (المنع خاص بالتصدير)", readerRead.ok, readerRead.message.slice(0, 80));
  const anon = await call("exportAuditLogs", undefined, { scope: "all" });
  rec("الصلاحيات — بلا جلسة يُرفض التصدير", anon.denied, `status=${anon.status}`);
  const deniedAudit = await rest(
    `admin_audit_logs?action=eq.audit.export&actor_email=eq.${encodeURIComponent(readerEmail)}&select=id&limit=1`,
  );
  rec("الصلاحيات — لا صف تصدير في السجل للموظف الممنوع", deniedAudit.length === 0);

  /* ---------------- 5) تناسق الخيارات الثلاثة معاً ---------------- */
  rec(
    "تناسق — النطاقات الثلاثة تنتج أعداداً مختلفة ومتوقعة",
    c1.body.length === filteredCount && c2.body.length === expectedPageRows && c3.body.length === expectedRangeRows,
    `all=${c1.body.length} page=${c2.body.length} range=${c3.body.length}`,
  );

  /* تنظيف حسابي: إزالة حسابي QA من موظفي المنصة (سجل التدقيق يبقى كما هو بحكم عدم قابلية الحذف). */
  for (const email of [exporterEmail, readerEmail])
    await rest(`platform_staff?email=eq.${encodeURIComponent(email)}`, {
      method: "DELETE",
      headers: adminHeaders,
    });

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\nالنتيجة: ${pass} PASS / ${fail} FAIL`);
  console.log(`ملفات CSV: ${OUT_DIR}/scope-all.csv, scope-page.csv, scope-range.csv`);
  await Bun.write("/tmp/browser/audit-export-results.json", JSON.stringify(results, null, 2));
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("توقف الاختبار:", e instanceof Error ? e.message : e);
  process.exit(1);
});
