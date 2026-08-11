/**
 * حرّاس ثابتة لمسار إدخال المستندات — تشغيل محلي بلا قاعدة بيانات وبلا شبكة.
 *
 *   bun scripts/documents-intake-guardrails.ts
 */
import { readFileSync } from "node:fs";
import {
  ALLOWED_BUCKET_MIME,
  EXTENSION_MIME,
  isOoxmlForExtension,
  verifyFileBytes,
  zipEntryNames,
} from "../src/lib/documents/file-signature";
import { ALLOWED_EXTENSIONS, ALLOWED_MIME_PREFIXES } from "../src/lib/client-portal.shared";

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

/* ---------------------------- أدوات بناء ZIP ---------------------------- */

const te = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** أرشيف ZIP حقيقي (بلا ضغط) بأسماء مدخلات محددة، لبناء حالات اختبار واقعية. */
function makeZip(entries: Record<string, string>): Uint8Array {
  const chunks: number[] = [];
  const central: number[] = [];
  const push = (arr: number[], ...bytes: number[]) => arr.push(...bytes);
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = te.encode(name);
    const body = te.encode(content);
    const crc = crc32(body);
    const offset = chunks.length;
    push(chunks, ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0));
    push(chunks, ...u32(crc), ...u32(body.length), ...u32(body.length));
    push(chunks, ...u16(nameBytes.length), ...u16(0));
    push(chunks, ...nameBytes, ...body);
    push(central, ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0));
    push(central, ...u16(0), ...u16(0), ...u32(crc), ...u32(body.length), ...u32(body.length));
    push(central, ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0));
    push(central, ...u32(0), ...u32(offset), ...nameBytes);
  }
  const count = Object.keys(entries).length;
  const eocd: number[] = [];
  push(eocd, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count));
  push(eocd, ...u32(central.length), ...u32(chunks.length), ...u16(0));
  return new Uint8Array([...chunks, ...central, ...eocd]);
}

const CONTENT_TYPES = '<?xml version="1.0"?><Types/>';

const realDocx = makeZip({
  "[Content_Types].xml": CONTENT_TYPES,
  "_rels/.rels": "<Relationships/>",
  "word/document.xml": "<w:document/>",
});
const realXlsx = makeZip({
  "[Content_Types].xml": CONTENT_TYPES,
  "xl/workbook.xml": "<workbook/>",
});
const realPptx = makeZip({
  "[Content_Types].xml": CONTENT_TYPES,
  "ppt/presentation.xml": "<p:presentation/>",
});
const randomZip = makeZip({ "notes.txt": "hello", "payload.exe": "MZ binary" });
const zipWithoutContentTypes = makeZip({ "word/document.xml": "<w:document/>" });

/* ------------------------------- OOXML ------------------------------- */

check("قراءة فهرس ZIP تُرجع أسماء المدخلات", zipEntryNames(realDocx).includes("word/document.xml"));
check("docx حقيقي مقبول", verifyFileBytes("a.docx", realDocx).ok);
check("xlsx حقيقي مقبول", verifyFileBytes("a.xlsx", realXlsx).ok);
check("pptx حقيقي مقبول", verifyFileBytes("a.pptx", realPptx).ok);
check("ZIP عشوائي باسم .docx مرفوض", !verifyFileBytes("evil.docx", randomZip).ok);
check("ZIP بلا [Content_Types].xml مرفوض", !verifyFileBytes("a.docx", zipWithoutContentTypes).ok);
check("docx باسم .xlsx مرفوض (عائلة مختلفة)", !verifyFileBytes("a.xlsx", realDocx).ok);
check("xlsx باسم .pptx مرفوض", !verifyFileBytes("a.pptx", realXlsx).ok);
check("امتداد .doc مع OOXML من نفس العائلة مقبول", verifyFileBytes("a.doc", realDocx).ok);
check("امتداد .doc مع ZIP عشوائي مرفوض", !verifyFileBytes("a.doc", randomZip).ok);
check("امتداد .xls مع docx مرفوض", !verifyFileBytes("a.xls", realDocx).ok);
check(
  "OLE2 القديم يبقى مقبولاً لـ .doc",
  verifyFileBytes(
    "legacy.doc",
    new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
  ).ok,
);
check("isOoxmlForExtension لا تقبل امتداداً غير Office", !isOoxmlForExtension(realDocx, "pdf"));

/* -------------------------------- HEIF -------------------------------- */

function heif(brand: string): Uint8Array {
  return new Uint8Array([0, 0, 0, 0x18, ...te.encode("ftyp"), ...te.encode(brand), 0, 0, 0, 0]);
}
check("heif مسموح كامتداد", (ALLOWED_EXTENSIONS as readonly string[]).includes("heif"));
check("نوع heif معياري", EXTENSION_MIME["heif"] === "image/heif");
check("ملف HEIF صالح مقبول بامتداد .heif", verifyFileBytes("p.heif", heif("mif1")).ok);
check("ملف HEIC صالح مقبول بامتداد .heic", verifyFileBytes("p.heic", heif("heic")).ok);
check("ftyp ببراند غير مدعوم مرفوض", !verifyFileBytes("p.heif", heif("qt  ")).ok);
check(
  "توافق قائمة المخزن مع الامتدادات",
  ALLOWED_EXTENSIONS.every((e) => ALLOWED_BUCKET_MIME.includes(EXTENSION_MIME[e]!)) &&
    ALLOWED_BUCKET_MIME.every((m) =>
      ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p) || p.startsWith(m)),
    ),
  ALLOWED_BUCKET_MIME.join(","),
);
check("image/heif داخل قائمة المخزن", ALLOWED_BUCKET_MIME.includes("image/heif"));

/* ------------------------- متنكرات نصية شائعة ------------------------- */

check("HTML متنكر كـ PDF مرفوض", !verifyFileBytes("a.pdf", te.encode("<!doctype html>")).ok);
check("JSON متنكر كـ docx مرفوض", !verifyFileBytes("a.docx", te.encode('{"a":1}')).ok);
check("PDF صالح مقبول", verifyFileBytes("a.pdf", te.encode("%PDF-1.4\n%%EOF")).ok);

/* --------------------- حرّاس ثابتة على شيفرة المصدر --------------------- */

const intakeFns = readFileSync("src/lib/documents/intake.functions.ts", "utf8");
const intakeSrv = readFileSync("src/lib/documents/intake.server.ts", "utf8");
const portalFns = readFileSync("src/lib/client-portal.functions.ts", "utf8");
const e2e = readFileSync("scripts/e2e/documents_security.e2e.ts", "utf8");

check(
  "الإنهاء يتحقق من انتماء القضية/العميل للمكتب",
  intakeFns.includes("assertCaseAndClientInOrg"),
);
check("الإنهاء يمنع إعادة استخدام المسار", intakeFns.includes("assertPathNotLinked"));
check("بوابة العميل تمنع إعادة استخدام المسار", portalFns.includes("assertPathNotLinked"));
check(
  "لا حذف للكائن عند تعارض مسار مرتبط",
  intakeFns.includes("isDuplicatePathError") && portalFns.includes("isDuplicatePathError"),
);
check("فحص التعارض يعتمد رمز 23505", intakeSrv.includes('"23505"'));
check("اختبار E2E fail-closed على الإنتاج", /assertNonProduction|fail-closed/.test(e2e));
check("اختبار E2E ينظّف موارده في finally", /finally\s*{/.test(e2e));

console.log(`\nالنتيجة: ${pass} PASS — ${failures.length} FAIL`);
if (failures.length) {
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
