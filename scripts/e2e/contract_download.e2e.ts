/**
 * رحلة العقد الموقّع إلكترونياً: الرابط المؤقت → التوقيع → إعادة التحميل →
 * تنزيل الـPDF على حالات مختلفة، مع تحقق خادمي من سجل التدقيق ورمز QR.
 *
 *   bun scripts/e2e/org-qa-fixture.ts
 *   MEHLA_E2E_ALLOW=1 bun scripts/e2e/contract_download.e2e.ts
 *
 * fail-closed: يرفض التشغيل خارج بيئة QA المعتمدة، ويعمل على مكتب QA معزول فقط،
 * ولا يلمس أي بيانات مكتب حقيقي. المخرجات: /tmp/browser/contract-download/
 */
import {
  assertE2eEnvironmentSafe,
  APP,
  SUPABASE_URL,
  adminFetch,
  loadQaOrg,
  QA_ORG_PREFIX,
} from "./qa-support";
import { callServerFn, resolveServerFns, type ServerFnRef } from "./serverfn-rpc";

const OUT_DIR = "/tmp/browser/contract-download";

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

/** استخراج قيمة نصية لمفتاح من إطار seroval دون تخمين ترتيب الحقول. */
function stringField(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`"${key}"[\\s\\S]{0,60}?\\{"t":1,"s":"((?:[^"\\\\]|\\\\.)*)"`));
  if (m?.[1]) return JSON.parse(`"${m[1]}"`) as string;
  const plain = raw.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
  return plain?.[1] ? (JSON.parse(`"${plain[1]}"`) as string) : null;
}

/** أطول سلسلة base64 في الإطار = محتوى الـPDF. */
function base64Payload(raw: string): string | null {
  const matches = raw.match(/JVBERi0[A-Za-z0-9+/=\\]{500,}/);
  return matches ? matches[0].replace(/\\/g, "") : null;
}

async function main() {
  assertE2eEnvironmentSafe();
  const org = await loadQaOrg();
  if (!org.orgName.startsWith(QA_ORG_PREFIX)) {
    console.error("توقّف fail-closed: مكتب الاختبار لا يحمل بادئة QA المعتمدة.");
    process.exit(2);
  }
  const owner = org.accounts.find((a) => a.role === "owner");
  if (!owner) throw new Error("حساب مالك مكتب QA غير متاح.");

  const fns = await resolveServerFns(APP, "src/lib/contracts/contracts.functions.ts");
  const call = (name: string, data: unknown, token?: string) => {
    const ref = fns[name] as ServerFnRef | undefined;
    if (!ref) throw new Error(`دالة الخادم ${name} غير موجودة في الوحدة المحوّلة.`);
    return callServerFn({ appOrigin: APP, ref, token, data });
  };

  let contractId: string | null = null;
  try {
    // 1) إنشاء عقد QA وإرساله للتوقيع (يختم النسخة النهائية ويولّد رقم التحقق).
    const created = await call(
      "saveContractDraftFn",
      {
        title: "عقد أتعاب اختبار QA",
        contractType: "fee_agreement",
        totalAmount: 15000,
        clauses: [{ id: "c1", title: "البند الأول", content: "نص البند الأول للاختبار." }],
        secondParty: {
          role: "second_party",
          name: "موكل اختبار QA",
          identifierType: "national_id",
          identifierNumber: "1000000000",
          phone: "+966500000000",
        },
        status: "pending_signature",
      },
      owner.token,
    );
    check("إنشاء عقد QA وإرساله للتوقيع", created.ok, created.message);
    contractId = stringField(created.raw, "id");
    if (!contractId) throw new Error("لم يُستخرج معرّف العقد من استجابة الحفظ.");

    const link = await call("issueContractSignLinkFn", { contractId }, owner.token);
    check("إصدار رابط التوقيع", link.ok, link.message);
    const signToken = stringField(link.raw, "signToken") ?? stringField(link.raw, "token");
    if (!signToken) throw new Error("لم يُستخرج رمز رابط التوقيع.");

    // 2) قراءة العقد قبل التوقيع: لا تذكرة تحميل.
    const before = await call("getPublicContractForSigningFn", { signToken });
    check("قراءة العقد من الرابط قبل التوقيع", before.ok, before.message);
    check(
      "لا تتوفر تذكرة تحميل قبل اكتمال التوقيع",
      !stringField(before.raw, "downloadTicket"),
    );

    // 3) توقيع الموكل ثم التنزيل في نفس الجلسة.
    const signature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/f4YkAAAAAElFTkSuQmCC";
    const signed = await call("signPublicContractFn", {
      signToken,
      signatureImageBase64: signature,
      signerName: "موكل اختبار QA",
    });
    check("توقيع الموكل من الرابط المؤقت", signed.ok, signed.message);
    const ticket = stringField(signed.raw, "downloadTicket");
    check("صدور تذكرة تحميل بعد التوقيع", Boolean(ticket));

    const first = await call("downloadSignedContractByTicketFn", { downloadTicket: ticket });
    check("تنزيل الـPDF في نفس الجلسة", first.ok, first.message);
    const pdfBase64 = base64Payload(first.raw);
    check("محتوى الـPDF مُعاد فعلياً", Boolean(pdfBase64));

    // 4) جلسة/جهاز جديد بنفس الرابط: قراءة وتذكرة جديدة وتنزيل ناجح، ومنع توقيع ثانٍ.
    const reopened = await call("getPublicContractForSigningFn", { signToken });
    const renewed = stringField(reopened.raw, "downloadTicket");
    check("تجديد تذكرة التحميل بعد إعادة التحميل", Boolean(renewed));
    const second = await call("downloadSignedContractByTicketFn", { downloadTicket: renewed });
    check("تنزيل الـPDF بعد إعادة التحميل / من جهاز جديد", second.ok, second.message);

    const reSign = await call("signPublicContractFn", {
      signToken,
      signatureImageBase64: signature,
      signerName: "محاولة توقيع ثانٍ",
    });
    check(
      "منع توقيع ثانٍ بنفس الرابط",
      reSign.denied || /موقّع|وقّع|سبق/.test(reSign.raw),
      reSign.message,
    );

    // 5) تذكرة مُتلاعب بها: رفض خادمي دون تسريب تفاصيل داخلية.
    const tampered = await call("downloadSignedContractByTicketFn", {
      downloadTicket: `${renewed ?? ticket}x`,
    });
    check("رفض تذكرة تحميل مُتلاعب بها", tampered.denied, tampered.message);
    check(
      "رسالة الرفض عربية بلا تفاصيل داخلية",
      !/stack|Error:|at \/|supabase/i.test(tampered.message),
      tampered.message,
    );

    // 6) تحقق خادمي من سجل التدقيق وثبات صف العقد.
    const eventsRes = await adminFetch(
      `${SUPABASE_URL}/rest/v1/contract_events?contract_id=eq.${contractId}&event_type=eq.exported_pdf&select=id,ip_address,metadata,created_at&order=created_at.desc`,
    );
    const events = (await eventsRes.json()) as {
      id: string;
      ip_address: string | null;
      metadata: Record<string, unknown>;
    }[];
    check("تسجيل حدث تنزيل لكل عملية", events.length >= 2, `عدد الأحداث: ${events.length}`);
    const meta = events[0]?.metadata ?? {};
    check("الحدث يحمل القناة ورقم التحقق", Boolean(meta["channel"] && meta["verificationId"]));
    check("الحدث يحمل حجم الملف", typeof meta["fileBytes"] === "number");

    const noUpdate = await adminFetch(
      `${SUPABASE_URL}/rest/v1/contract_events?id=eq.${events[0]?.id}`,
      { method: "PATCH", body: JSON.stringify({ actor_label: "tamper" }) },
    );
    check("سجل التدقيق محصّن ضد التعديل", !noUpdate.ok, `الحالة ${noUpdate.status}`);
    const noDelete = await adminFetch(
      `${SUPABASE_URL}/rest/v1/contract_events?id=eq.${events[0]?.id}`,
      { method: "DELETE" },
    );
    check("سجل التدقيق محصّن ضد الحذف", !noDelete.ok, `الحالة ${noDelete.status}`);

    // 7) حفظ الـPDF للفحص البصري (QR، التذييل، اتجاه العربية).
    if (pdfBase64) {
      await Bun.$`mkdir -p ${OUT_DIR}`.quiet();
      await Bun.write(`${OUT_DIR}/signed-contract.pdf`, Buffer.from(pdfBase64, "base64"));
      console.log(`مخرج الفحص البصري: ${OUT_DIR}/signed-contract.pdf`);
    }
  } finally {
    // تنظيف: العقود الموقعة محصّنة ضد الحذف بالتصميم، فنحذف عقود QA غير الموقعة فقط.
    if (contractId) {
      await adminFetch(
        `${SUPABASE_URL}/rest/v1/contracts?id=eq.${contractId}&status=neq.signed`,
        { method: "DELETE" },
      ).catch(() => undefined);
    }
  }

  console.log(`\nنجح: ${pass} — فشل: ${failures.length}`);
  for (const f of failures) console.log(` - ${f}`);
  process.exit(failures.length ? 1 : 0);
}

await main();
