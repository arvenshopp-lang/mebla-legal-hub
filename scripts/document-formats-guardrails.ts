/**
 * حرّاس عقد صيغ المستندات — تشغيل محلي بلا قاعدة بيانات وبلا شبكة.
 *
 *   bun scripts/document-formats-guardrails.ts
 *
 * يثبت أن قائمة واحدة تحكم: الإدخال، أنواع المخزن، العرض الآمن، محرك
 * الاستخراج، وسمة accept في الواجهة؛ وأن صيغة مسموح بها لا تُصنَّف
 * INVALID_FILE لمجرد أنها تحتاج تمثيلاً نصياً.
 */
import { readFileSync } from "node:fs";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_PREFIXES,
  ACCEPT_ATTR,
  SUPPORTED_FORMATS_LABEL,
  UNSUPPORTED_FORMAT_MESSAGE,
} from "../src/lib/client-portal.shared";
import {
  ALLOWED_BUCKET_MIME,
  EXTENSION_MIME,
  isAllowedDocumentMime,
  isViewerNativeMime,
} from "../src/lib/documents/file-signature";
import { extractableKind } from "../src/lib/document-ai.shared";
import { viewableKind } from "../src/lib/secure-view/secure-view.shared";

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

/* ------------------------- القائمة الواحدة المعتمدة ------------------------- */

const CONTRACT = ["pdf", "docx", "jpg", "jpeg", "png", "webp", "txt", "csv"] as const;
const REMOVED = ["doc", "xls", "xlsx", "ppt", "pptx", "heic", "heif", "gif", "svg", "zip"];

check(
  "الامتدادات المسموح بها مطابقة تماماً لعقد الصيغ",
  [...ALLOWED_EXTENSIONS].sort().join(",") === [...CONTRACT].sort().join(","),
  ALLOWED_EXTENSIONS.join(","),
);
for (const ext of REMOVED) {
  check(
    `الامتداد ${ext} مُزال من كل القوائم`,
    !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext) &&
      EXTENSION_MIME[ext] === undefined &&
      !ACCEPT_ATTR.split(",").includes(`.${ext}`),
  );
}
check(
  "لكل امتداد مسموح نوع معياري داخل قائمة المخزن",
  ALLOWED_EXTENSIONS.every(
    (e) => !!EXTENSION_MIME[e] && ALLOWED_BUCKET_MIME.includes(EXTENSION_MIME[e]!),
  ),
);
check(
  "كل نوع في قائمة المخزن مغطى ببادئة مسموح بها للعميل",
  ALLOWED_BUCKET_MIME.every((m) => ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p))),
  ALLOWED_BUCKET_MIME.join(","),
);
check(
  "كل بادئة MIME للعميل تعود لنوع داخل العقد",
  ALLOWED_MIME_PREFIXES.every(
    (p) => ALLOWED_BUCKET_MIME.some((m) => m.startsWith(p)) || p === "application/csv",
  ),
);
check(
  "سمة accept مبنية من نفس القائمة",
  ACCEPT_ATTR === ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(","),
);
check(
  "رسالة المستخدم تذكر الصيغ المدعومة فقط",
  UNSUPPORTED_FORMAT_MESSAGE.includes(SUPPORTED_FORMATS_LABEL),
);
for (const word of ["Office", "Excel", "PowerPoint", "HEIC"]) {
  check(`نص الصيغ المدعومة لا يذكر ${word}`, !SUPPORTED_FORMATS_LABEL.includes(word));
}

/* --------------------- كل صيغة مسموحة لها مسار عرض --------------------- */

for (const ext of ALLOWED_EXTENSIONS) {
  const mime = EXTENSION_MIME[ext]!;
  const native = isViewerNativeMime(mime);
  const kind = extractableKind(`f.${ext}`, mime);
  check(
    `الصيغة ${ext} لها مسار عرض: ختم مباشر أو استخراج نصي`,
    native || kind !== null,
    `native=${native} kind=${kind}`,
  );
  check(`الصيغة ${ext} داخل عقد أنواع العرض الآمن`, isAllowedDocumentMime(mime));
  check(
    `viewableKind لا يعد ${ext} صورة إلا إن كانت قابلة للإدراج`,
    viewableKind(`f.${ext}`, mime) !== "image" || native,
  );
}
check("النوع الفارغ ليس داخل العقد", !isAllowedDocumentMime("") && !isAllowedDocumentMime(null));
check("text/html خارج العقد", !isAllowedDocumentMime("text/html"));
check("application/octet-stream خارج العقد", !isAllowedDocumentMime("application/octet-stream"));
check("النوع مع معامل charset يُقبل", isAllowedDocumentMime("text/plain; charset=utf-8"));
check("PDF مع charset يُعد قابلاً للختم", isViewerNativeMime("application/pdf; charset=binary"));
check("image/webp غير قابل للختم المباشر", !isViewerNativeMime("image/webp"));
check("docx غير قابل للختم المباشر", !isViewerNativeMime(EXTENSION_MIME["docx"]!));

/* --------------------- حرّاس ثابتة على مسار العرض الآمن --------------------- */

const secure = readFileSync("src/lib/secure-view/secure-view.server.ts", "utf8");
check(
  "readOriginal يستخدم عقد الصيغ لا قائمة MIME محلية",
  secure.includes("isAllowedDocumentMime") && secure.includes("isViewerNativeMime"),
);
check(
  "الصيغة المسموح بها لا تُصنَّف INVALID_FILE لمجرد نوعها",
  /const representable =[\s\S]{0,200}isAllowedDocumentMime/.test(secure),
);
check(
  "INVALID_FILE مرتبط بعدم إمكانية التمثيل أو HTML فقط",
  secure.includes('trace.contentType.includes("text/html") || !representable'),
);
check(
  "readOriginal يعيد إشارة قابلية الختم",
  /stampable: supportedViewerType/.test(secure) && secure.includes("stampable: boolean"),
);
check(
  "فحص البصمة يقتصر على الأنواع القابلة للختم",
  /supportedViewerType\s*\?\s*matchesStoredFile/.test(secure),
);
check("لا قائمة MIME مكتوبة يدوياً داخل الشرط", !/application\\\/pdf\|image\\\//.test(secure));

const route = readFileSync("src/routes/api/public/doc.$token.ts", "utf8");
check("مسار العرض يمرّر النوع المسجّل للمستند", route.includes("declaredMime: doc.file_type"));
check(
  "الصيغ غير القابلة للختم تُعرض كنسخة نصية مائية",
  /storageRead\.stampable[\s\S]{0,160}"text"/.test(route),
);
check(
  "لا يُعاد الملف الأصلي إلا لتذكرة المعالجة الداخلية",
  route.split("original as unknown as BodyInit").length === 2 &&
    /resolved\.kind === "process"[\s\S]{0,220}original as unknown as BodyInit/.test(route),
);

const stamp = readFileSync("src/lib/secure-view/stamp.server.ts", "utf8");
check(
  "توجد رسالة مائية آمنة عند غياب النص المستخرج",
  /buildTextPdf\(\s*\n?\s*input\.fallbackText\?\.trim\(\) \|\|/.test(stamp) &&
    stamp.includes("نسخة نصية مائية"),
);

const intake = readFileSync("src/lib/documents/intake.server.ts", "utf8");
check("الإدخال يستخدم رسالة الصيغ الموحدة", intake.includes("UNSUPPORTED_FORMAT_MESSAGE"));
check("لا رسالة صيغ مكتوبة يدوياً في الإدخال", !intake.includes("مستندات Office"));

const pipeline = readFileSync("src/lib/document-pipeline.ts", "utf8");
check("محرك المعالجة يعتمد extractableKind الموحدة", pipeline.includes("extractableKind"));

const shared = readFileSync("src/lib/client-portal.shared.ts", "utf8");
for (const removed of ["msword", "ms-excel", "ms-powerpoint", "image/heic", "image/heif"]) {
  check(`قائمة MIME للعميل لا تحتوي ${removed}`, !shared.includes(removed));
}

console.log(`\nPASS = ${pass} | FAIL = ${failures.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
