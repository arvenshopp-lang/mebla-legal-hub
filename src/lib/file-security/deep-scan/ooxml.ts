/**
 * فحص مستندات OOXML (docx وما شابه) عبر فهرس الأرشيف ومحتوى العلاقات.
 *
 * القاعدة: أي طبقة نشطة (ماكرو، OLE، ActiveX، قالب خارجي، DDE) تُرفض نهائياً.
 */
import type { ScanFinding } from "./rules";
import { indexZip, readZipEntry, ZIP_LIMITS } from "./zip";

const NAME_RULES: { test: (name: string) => boolean; rule: ScanFinding["rule"] }[] = [
  { test: (n) => /vbaproject\.bin$|vbadata\.xml$|\/macros?\//i.test(n), rule: "OOXML_MACRO" },
  { test: (n) => /oleobject\d*\.bin$|embeddings\//i.test(n), rule: "OOXML_OLE_OBJECT" },
  { test: (n) => /activex\d*\.(bin|xml)$/i.test(n), rule: "OOXML_ACTIVEX" },
];

const RELATIONSHIP_RULES: { pattern: RegExp; rule: ScanFinding["rule"] }[] = [
  { pattern: /attachedTemplate/i, rule: "OOXML_EXTERNAL_TEMPLATE" },
  { pattern: /relationships\/oleObject|relationships\/package/i, rule: "OOXML_OLE_OBJECT" },
  { pattern: /relationships\/frame|subDocument/i, rule: "OOXML_EXTERNAL_RELATIONSHIP" },
];

export type OoxmlScanResult = { findings: ScanFinding[]; unscannable: boolean };

export async function scanOoxml(bytes: Uint8Array): Promise<OoxmlScanResult> {
  const index = indexZip(bytes);
  const findings = [...index.findings];
  if (index.malformed) {
    return { findings: [{ rule: "OOXML_MALFORMED", severity: "block" }], unscannable: false };
  }
  if (index.entries.some((entry) => entry.encrypted)) {
    return { findings, unscannable: true };
  }

  for (const entry of index.entries) {
    for (const { test, rule } of NAME_RULES) {
      if (test(entry.name)) findings.push({ rule, severity: "block", locator: entry.name });
    }
  }

  const inspect = index.entries
    .filter((entry) => /\.(xml|rels)$/i.test(entry.name))
    .slice(0, ZIP_LIMITS.maxInflatedEntries);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const entry of inspect) {
    const content = await readZipEntry(bytes, entry);
    if (!content) return { findings, unscannable: true };
    const xml = decoder.decode(content);
    if (/DDEAUTO|instrText[^<]*DDE/i.test(xml)) {
      findings.push({ rule: "OOXML_DDE_FIELD", severity: "block", locator: entry.name });
    }
    for (const { pattern, rule } of RELATIONSHIP_RULES) {
      if (pattern.test(xml)) findings.push({ rule, severity: "block", locator: entry.name });
    }
    if (/TargetMode="External"/i.test(xml) && /attachedTemplate|oleObject/i.test(xml)) {
      findings.push({
        rule: "OOXML_EXTERNAL_RELATIONSHIP",
        severity: "block",
        locator: entry.name,
      });
    }
  }
  return { findings, unscannable: false };
}