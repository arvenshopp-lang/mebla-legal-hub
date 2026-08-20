/**
 * اختبارات محرك الفحص العميق: يجب رفض المحتوى النشط وقبول الملفات النظيفة.
 * التشغيل: bun scripts/deep-scan.test.ts
 */
import { deepScanBytes } from "../src/lib/file-security/deep-scan/index.server";

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.error(`✗ ${name}`);
  }
}

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

const cleanPdf = bytes(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF\n",
);
const jsPdf = bytes(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/OpenAction<</S/JavaScript/JS(app.alert(1))>>>>endobj\nstartxref\n0\n%%EOF\n",
);
const obfuscatedPdf = bytes(
  "%PDF-1.4\n1 0 obj<</J#61vaScript 2 0 R>>endobj\nstartxref\n0\n%%EOF\n",
);
const launchPdf = bytes("%PDF-1.4\n<</A<</S/Launch/F(cmd.exe)>>>>\nstartxref\n0\n%%EOF\n");
const truncatedPdf = bytes("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n");
const encryptedPdf = bytes("%PDF-1.6\ntrailer<</Encrypt 9 0 R>>\nstartxref\n0\n%%EOF\n");
const executable = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
const shellScript = bytes("#!/bin/sh\nrm -rf /\n");
const csvFormula = bytes("name,total\n=cmd|'/c calc'!A1,5\n");

const results = await Promise.all([
  deepScanBytes("pdf", cleanPdf),
  deepScanBytes("pdf", jsPdf),
  deepScanBytes("pdf", obfuscatedPdf),
  deepScanBytes("pdf", launchPdf),
  deepScanBytes("pdf", truncatedPdf),
  deepScanBytes("pdf", encryptedPdf),
  deepScanBytes("pdf", executable),
  deepScanBytes("txt", shellScript),
  deepScanBytes("csv", csvFormula),
  deepScanBytes("png", bytes("not a real png")),
]);

const [
  clean,
  js,
  obfuscated,
  launch,
  truncated,
  encrypted,
  exe,
  script,
  csv,
  fakePng,
] = results;

check("PDF نظيف يُقبل", clean!.verdict === "clean");
check("PDF يحتوي JavaScript يُرفض", js!.verdict === "malicious");
check("اسم مموّه بترميز سداسي يُرفض", obfuscated!.verdict === "malicious");
check("فعل Launch يُرفض", launch!.verdict === "malicious");
check("PDF مقطوع البنية يُرفض", truncated!.verdict === "malicious");
check("PDF مشفّر يُعامل كغير قابل للفحص", encrypted!.verdict === "unscannable");
check("ملف تنفيذي باسم PDF يُرفض", exe!.verdict === "malicious");
check("سكربت shell داخل txt يُرفض", script!.verdict === "malicious");
check("صيغة CSV قابلة للتنفيذ تُرفض", csv!.verdict === "malicious");
check("PNG تالف يُرفض", fakePng!.verdict === "malicious");
check("إصدار المحرك مسجَّل مع كل قرار", results.every((r) => Boolean(r.engineVersion)));

if (failures > 0) {
  console.error(`\n${failures} اختبار فاشل.`);
  process.exit(1);
}
console.log("\nجميع اختبارات الفحص العميق ناجحة.");