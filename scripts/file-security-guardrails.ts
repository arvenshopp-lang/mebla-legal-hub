/**
 * حرّاس أمن الملفات (CI).
 *
 * يمنعون إنشاء مسار تسليم ملفات جديد يتجاوز البوابة المركزية:
 *   1. أي ملف يُنشئ رابطاً موقّعاً أو يُنزّل كائناً من مستودعات المستندات يجب أن
 *      يكون داخل قائمة المسارات المعتمدة.
 *   2. المسارات المعتمدة لتسليم بايتات المستندات يجب أن تستدعي بوابة الإفراج.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";

/** الملفات المصرَّح لها بلمس المخزن مباشرة، ولماذا. */
const STORAGE_ALLOWLIST: Record<string, string> = {
  "src/lib/secure-view/secure-view.server.ts": "قراءة الأصل خلف بوابة الإفراج",
  "src/lib/secure-view/cleanup.server.ts": "تنظيف مقيّد بنطاق المكتب",
  "src/lib/documents/intake.server.ts": "الإدخال والتحقق البنيوي",
  "src/lib/documents/repair.server.ts": "إصلاح سجلات المستندات",
  "src/lib/email/attachments.server.ts": "مرفقات البريد خلف بوابة الإفراج",
  "src/lib/office-page.server.ts": "وسائط الصفحة العامة (مستودع منفصل)",
  "src/lib/subscription.functions.ts": "فواتير الاشتراك (مستودع منفصل)",
  "src/lib/admin-ops.functions.ts": "فحص صحة المخزن دون قراءة بايتات",
  "src/lib/office-public.server.ts": "وسائط الصفحة العامة (مستودع منفصل)",
  "src/lib/email/agentic/provider.server.ts": "إرسال المرفقات خلف بوابة الإفراج",
  "src/lib/email/transport/hostinger.server.ts": "إرسال المرفقات خلف بوابة الإفراج",
  "src/routes/_authenticated/documents.tsx": "رفع فقط برمز رفع موقّع (بلا قراءة بايتات)",
  "src/routes/upload.$token.tsx": "رفع فقط برمز رفع موقّع (بلا قراءة بايتات)",
};

/** الملفات التي تُسلّم بايتات مستندات ويجب أن تعبر بوابة الإفراج. */
const MUST_CALL_GATE = [
  "src/routes/api/public/doc.$token.ts",
  "src/lib/email/attachments.server.ts",
  "src/lib/email/agentic/provider.server.ts",
  "src/lib/email/transport/hostinger.server.ts",
];

const STORAGE_PATTERN = /createSignedUrl\(|storage\s*\n?\s*\.from\(|\.createSignedUploadUrl\(/;
const GATE_PATTERN = /assertReleasable|assertAttachmentReleasable/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const failures: string[] = [];

for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (!STORAGE_PATTERN.test(source)) continue;
  if (!(file in STORAGE_ALLOWLIST)) {
    failures.push(
      `${file}: مسار تسليم ملفات جديد بدون اعتماد. أضِف البوابة المركزية (assertReleasable) ثم سجّل الملف في STORAGE_ALLOWLIST.`,
    );
  }
}

for (const file of MUST_CALL_GATE) {
  const source = readFileSync(file, "utf8");
  if (!GATE_PATTERN.test(source)) {
    failures.push(`${file}: مسار تسليم بايتات لا يستدعي بوابة الإفراج المركزية.`);
  }
}

if (failures.length) {
  console.error("❌ فشل حرّاس أمن الملفات:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}

console.info("✅ حرّاس أمن الملفات: كل مسارات تسليم الملفات معتمدة وتعبر البوابة المركزية.");