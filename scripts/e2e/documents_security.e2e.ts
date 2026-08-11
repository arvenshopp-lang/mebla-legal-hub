/**
 * إثبات الإغلاق الأمني للمستندات (مكتب QA معزول — لا بيانات عملاء).
 *
 * يشغّل الرحلات الحقيقية: رفع خادمي، عرض مائي، حجب القراءة المباشرة من المخزن،
 * حجب استهلاك حصة OCR على «قارئ فقط»، ومنع ربط مسار خارج مجلد الطلب.
 *
 *   bun scripts/e2e/org-qa-fixture.ts
 *   MEHLA_E2E_ALLOW=1 bun scripts/e2e/documents_security.e2e.ts
 *
 * fail-closed: يرفض التشغيل على أي نطاق/بيئة إنتاج، ويشترط موافقة صريحة عبر
 * MEHLA_E2E_ALLOW، ومكتب QA بالبادئة المعتمدة. أي موارد اختبار تُنظّف في finally.
 */
import {
  APP,
  SUPABASE_URL,
  PUBLISHABLE,
  adminFetch,
  adminHeaders,
  loadQaOrg,
  QA_ORG_PREFIX,
  type QaOrg,
} from "./qa-support";
import { callServerFn, resolveServerFns } from "./serverfn-rpc";

/** بوابة fail-closed: لا تشغيل إلا على أصل تطوير/معاينة مع موافقة صريحة. */
function assertNonProduction(orgName: string) {
  const reasons: string[] = [];
  if (process.env["MEHLA_E2E_ALLOW"] !== "1") {
    reasons.push("MEHLA_E2E_ALLOW=1 غير مضبوط (موافقة صريحة مطلوبة).");
  }
  let host = "";
  try {
    host = new URL(APP).hostname.toLowerCase();
  } catch {
    reasons.push("APP_ORIGIN غير صالح.");
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  const isPreview = /(^|\.)id-preview--|-dev\.lovable\.app$/.test(host);
  if (!isLocal && !isPreview) reasons.push(`أصل غير مسموح للاختبار: ${host}`);
  if (/mehlalex\.com$/.test(host) || host === "mebla.lovable.app") {
    reasons.push("نطاق إنتاج مرفوض.");
  }
  if (!orgName.startsWith(QA_ORG_PREFIX)) {
    reasons.push("مكتب الاختبار لا يحمل بادئة QA المعتمدة.");
  }
  if (reasons.length) {
    console.error("توقّف fail-closed قبل إنشاء أي بيانات:");
    for (const r of reasons) console.error(` - ${r}`);
    process.exit(2);
  }
}

let pass = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

/** استخراج قيم نصية من إطار seroval بترتيب المفاتيح، بدل التخمين. */
function slotFrom(raw: string): { path: string; uploadToken: string; contentType: string } | null {
  const m = raw.match(
    /"k":\["path","uploadToken","contentType"(?:,"name")?\],"v":\[\{"t":1,"s":"([^"]+)"\},\{"t":1,"s":"([^"]+)"\},\{"t":1,"s":"([^"]+)"\}/,
  );
  return m ? { path: m[1]!, uploadToken: m[2]!, contentType: m[3]! } : null;
}

function documentIdFrom(raw: string): string | null {
  return raw.match(/"k":\["documentId"[^\]]*\],"v":\[\{"t":1,"s":"([0-9a-f-]{36})"/)?.[1] ?? null;
}

const MINIMAL_PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const FAKE_PDF = new TextEncoder().encode("<!doctype html><html><body>not a pdf</body></html>");

function token(qa: QaOrg, role: string) {
  const acc = qa.accounts.find((a) => a.role === role);
  if (!acc) throw new Error(`حساب QA للدور ${role} غير متاح`);
  return acc.token;
}

async function uploadToSlot(
  slot: { path: string; uploadToken: string; contentType: string },
  bytes: Uint8Array,
) {
  return fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/documents/${slot.path}?token=${slot.uploadToken}`,
    {
      method: "PUT",
      headers: { apikey: PUBLISHABLE, "content-type": slot.contentType },
      body: bytes,
    },
  );
}

async function objectExists(path: string) {
  const res = await adminFetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`);
  return res.status === 200;
}

async function main() {
  const qa = await loadQaOrg();
  assertNonProduction(qa.orgName);
  const org = qa.organizationId;
  const intake = await resolveServerFns(APP, "src/lib/documents/intake.functions.ts");
  const secure = await resolveServerFns(APP, "src/lib/secure-view/secure-view.functions.ts");
  const portal = await resolveServerFns(APP, "src/lib/client-portal.functions.ts");

  // 1) رفع صالح بدور محامي عبر المسار الخادمي فقط.
  const prep = await callServerFn({
    appOrigin: APP,
    ref: intake["prepareDocumentUpload"]!,
    token: token(qa, "lawyer"),
    data: { organizationId: org, fileName: "qa-valid.pdf", fileSize: MINIMAL_PDF.byteLength },
  });
  check("تجهيز رفع لدور محامي ينجح", prep.ok, prep.message);
  const slot = prep.ok ? slotFrom(prep.raw) : null;
  check(
    "فتحة الرفع داخل مجلد المكتب",
    !!slot && slot.path.startsWith(`${org}/`),
    slot?.path ?? "لا فتحة",
  );
  if (!slot) throw new Error("تعذّر متابعة الاختبار بلا فتحة رفع");

  const up = await uploadToSlot(slot, MINIMAL_PDF);
  check("رفع البايتات إلى الفتحة الموقّعة", up.ok, `${up.status}`);

  const fin = await callServerFn({
    appOrigin: APP,
    ref: intake["finalizeDocumentUpload"]!,
    token: token(qa, "lawyer"),
    data: { organizationId: org, path: slot.path, fileName: "qa-valid.pdf", category: "QA" },
  });
  check("إنهاء الرفع بعد تحقق البصمة ينجح", fin.ok, fin.message);
  const documentId = documentIdFrom(fin.raw);
  check("سجل المستند أُنشئ", !!documentId, fin.raw.slice(0, 120));

  // 2) قارئ فقط لا يستطيع تجهيز رفع.
  const viewerPrep = await callServerFn({
    appOrigin: APP,
    ref: intake["prepareDocumentUpload"]!,
    token: token(qa, "viewer"),
    data: { organizationId: org, fileName: "qa-viewer.pdf", fileSize: 100 },
  });
  check("قارئ فقط لا يستطيع الرفع", viewerPrep.denied, viewerPrep.message);

  // 3) لا قراءة مباشرة للأصل من المخزن بأي توكن مستخدم.
  for (const role of ["viewer", "lawyer", "owner"]) {
    const direct = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${slot.path}`, {
      headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${token(qa, role)}` },
    });
    check(`${role}: منع تحميل الأصل مباشرة من المخزن`, direct.status !== 200, `${direct.status}`);
    const signed = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${slot.path}`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${token(qa, role)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    check(`${role}: منع توقيع رابط للأصل`, signed.status !== 200, `${signed.status}`);
  }

  // 4) العرض القانوني: تذكرة → نسخة مائية PDF بلا كشف المسار.
  if (documentId) {
    const access = await callServerFn({
      appOrigin: APP,
      ref: secure["requestDocumentAccess"]!,
      token: token(qa, "lawyer"),
      data: { organizationId: org, documentId, kind: "view" },
    });
    check("طلب تذكرة عرض ينجح للمحامي", access.ok, access.message);
    check("التذكرة لا تكشف مسار التخزين", !access.raw.includes(slot.path));
    const url = access.raw.match(/\/api\/public\/doc\/[A-Za-z0-9._~-]+/)?.[0] ?? null;
    check("رابط النسخة المائية موجود", !!url, access.raw.slice(0, 120));
    if (url) {
      const view = await fetch(`${APP}${url}`);
      const ct = view.headers.get("content-type") ?? "";
      const head = new TextDecoder().decode((await view.arrayBuffer()).slice(0, 5));
      check(
        "العرض يعيد PDF مائي",
        view.ok && ct.startsWith("application/pdf") && head === "%PDF-",
        `${view.status} ${ct} ${head}`,
      );
    }
    const viewerAccess = await callServerFn({
      appOrigin: APP,
      ref: secure["requestDocumentAccess"]!,
      token: token(qa, "viewer"),
      data: { organizationId: org, documentId, kind: "process" },
    });
    check("قارئ فقط لا يحصل على تذكرة OCR", viewerAccess.denied, viewerAccess.message);
  }

  // 5) حصص OCR: قارئ فقط محجوب، محامي مسموح.
  for (const [role, expectDenied] of [
    ["viewer", true],
    ["lawyer", false],
  ] as const) {
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ocr_pages`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${token(qa, role)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ _organization_id: org, _pages: 1 }),
    });
    check(
      `consume_ocr_pages ${role}: ${expectDenied ? "مرفوض" : "مسموح"}`,
      expectDenied ? rpc.status >= 400 : rpc.ok,
      `${rpc.status}`,
    );
    const metered = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_metered_usage`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${token(qa, role)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ _organization_id: org, _metric: "ocr_pages", _amount: 1 }),
    });
    check(
      `record_metered_usage ${role}: ${expectDenied ? "مرفوض" : "مسموح"}`,
      expectDenied ? metered.status >= 400 : metered.ok,
      `${metered.status}`,
    );
  }

  // 6) ملف متنكر: يفشل الإنهاء ولا يبقى كائن يتيم.
  const badPrep = await callServerFn({
    appOrigin: APP,
    ref: intake["prepareDocumentUpload"]!,
    token: token(qa, "lawyer"),
    data: { organizationId: org, fileName: "qa-fake.pdf", fileSize: FAKE_PDF.byteLength },
  });
  const badSlot = slotFrom(badPrep.raw);
  check("تجهيز رفع الملف المتنكر", !!badSlot, badPrep.message);
  if (badSlot) {
    await uploadToSlot(badSlot, FAKE_PDF);
    const badFin = await callServerFn({
      appOrigin: APP,
      ref: intake["finalizeDocumentUpload"]!,
      token: token(qa, "lawyer"),
      data: { organizationId: org, path: badSlot.path, fileName: "qa-fake.pdf" },
    });
    check("ملف HTML متنكر كـ PDF يُرفض", badFin.denied, badFin.message);
    check("الكائن اليتيم حُذف بعد الرفض", !(await objectExists(badSlot.path)));
    const rows = await adminFetch(
      `${SUPABASE_URL}/rest/v1/documents?file_path=eq.${encodeURIComponent(badSlot.path)}&select=id`,
    );
    check("لا سجل مستند للملف المرفوض", ((await rows.json()) as unknown[]).length === 0);
  }

  // 7) مسار خارج مجلد المكتب يُرفض حتى مع فتحة صالحة.
  const escapeFin = await callServerFn({
    appOrigin: APP,
    ref: intake["finalizeDocumentUpload"]!,
    token: token(qa, "lawyer"),
    data: {
      organizationId: org,
      path: `${crypto.randomUUID()}/qa-valid.pdf`,
      fileName: "qa-valid.pdf",
    },
  });
  check("مسار خارج مجلد المكتب يُرفض", escapeFin.denied, escapeFin.message);

  // 8) بوابة العميل: لا يمكن إرفاق مسار خارج طلب الرفع.
  const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const clientRes = await adminFetch(`${SUPABASE_URL}/rest/v1/clients`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      full_name: "QA عميل الاختبار",
      client_type: "individual",
    }),
  });
  const clientId = ((await clientRes.json()) as { id?: string }[])[0]?.id ?? null;
  const caseRes = await adminFetch(`${SUPABASE_URL}/rest/v1/cases`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      client_id: clientId,
      case_title: "QA قضية الاختبار",
      status: "open",
    }),
  });
  const caseBody = (await caseRes.json()) as { id?: string }[] | { message?: string };
  const caseId = Array.isArray(caseBody) ? (caseBody[0]?.id ?? null) : null;
  check("تهيئة قضية QA لطلب الرفع", !!caseId, JSON.stringify(caseBody).slice(0, 200));
  const reqRes = await adminFetch(`${SUPABASE_URL}/rest/v1/document_requests`, {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_id: caseId,
      title: "QA طلب رفع",
      requested_items: [],
      token_hash: tokenHash,
      status: "active",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  });
  const reqRow = (await reqRes.json()) as { id?: string }[];
  const requestId = reqRow[0]?.id ?? null;
  check("تهيئة طلب رفع QA", !!requestId, JSON.stringify(reqRow).slice(0, 160));
  if (requestId) {
    const escape = await callServerFn({
      appOrigin: APP,
      ref: portal["submitUploadRequest"]!,
      data: {
        token: rawToken,
        files: [
          {
            name: "qa-valid.pdf",
            size: MINIMAL_PDF.byteLength,
            type: "application/pdf",
            path: slot.path,
          },
        ],
      },
    });
    check("بوابة العميل ترفض مسار خارج الطلب", escape.denied, escape.message);
    const ok = await callServerFn({
      appOrigin: APP,
      ref: portal["createUploadSlots"]!,
      data: {
        token: rawToken,
        files: [{ name: "qa-client.pdf", size: MINIMAL_PDF.byteLength, type: "application/pdf" }],
      },
    });
    const clientSlot = slotFrom(ok.raw);
    check(
      "بوابة العميل تجهّز فتحة داخل مجلد الطلب",
      !!clientSlot && clientSlot.path.includes(`client-uploads/${requestId}/`),
      ok.message || (clientSlot?.path ?? ""),
    );
    if (clientSlot) {
      await uploadToSlot(clientSlot, MINIMAL_PDF);
      const submit = await callServerFn({
        appOrigin: APP,
        ref: portal["submitUploadRequest"]!,
        data: {
          token: rawToken,
          files: [
            {
              name: "qa-client.pdf",
              size: MINIMAL_PDF.byteLength,
              type: "application/pdf",
              path: clientSlot.path,
            },
          ],
        },
      });
      check("رفع صالح من بوابة العميل ينجح", submit.ok, submit.message);
    }
    await adminFetch(`${SUPABASE_URL}/rest/v1/document_requests?id=eq.${requestId}`, {
      method: "DELETE",
    });
  }
  if (caseId) {
    await adminFetch(`${SUPABASE_URL}/rest/v1/documents?case_id=eq.${caseId}`, {
      method: "DELETE",
    });
    await adminFetch(`${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}`, { method: "DELETE" });
  }

  console.log(`\nالنتيجة: ${pass} PASS — ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(` - ${f}`);
    process.exit(1);
  }
}

await main();
