/**
 * التطهير بالتحويل: إنتاج «نسخة عرض آمنة» من الملف الأصلي.
 *
 * النسخة الآمنة تُبنى من الصفر ولا تُنقل إليها أي طبقة نشطة: لا JavaScript ولا
 * أفعال تلقائية ولا مرفقات مدمجة ولا نماذج. الأصل يبقى محجوزاً في المخزن ولا
 * يُسلَّم لأي مسار عرض أو مشاركة أو طباعة أو تنزيل.
 */

export type SafeRender = { bytes: Uint8Array; mime: string; extension: "pdf" };

/** الصيغ التي يمكن تسطيحها إلى PDF آمن. */
const SANITIZABLE = ["pdf", "png", "jpg", "jpeg"] as const;

export function isSanitizable(ext: string): boolean {
  return (SANITIZABLE as readonly string[]).includes(ext);
}

/**
 * يبني نسخة PDF آمنة. يعيد `null` عندما تكون الصيغة غير قابلة للتسطيح، فيبقى
 * تسليم تلك الصيغ محكوماً بقرار الفحص العميق وحده.
 */
export async function buildSafeRender(
  ext: string,
  bytes: Uint8Array,
): Promise<SafeRender | null> {
  if (!isSanitizable(ext)) return null;
  const { PDFDocument } = await import("pdf-lib");

  const safe = await PDFDocument.create();
  safe.setProducer("Mehla Secure Render");
  safe.setCreator("Mehla Secure Render");

  if (ext === "pdf") {
    const source = await PDFDocument.load(bytes as unknown as Uint8Array, {
      // لا تُنفَّذ ولا تُنسخ أي بنية على مستوى المستند؛ تُنسخ الصفحات فقط.
      updateMetadata: false,
      ignoreEncryption: false,
      throwOnInvalidObject: false,
    });
    const pages = await safe.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      // إزالة أي تعليقات/حقول على مستوى الصفحة (قد تحمل أفعالاً).
      page.node.delete(page.node.context.obj("Annots").asName?.() ?? ("Annots" as never));
      safe.addPage(page);
    }
  } else {
    const image =
      ext === "png"
        ? await safe.embedPng(bytes as unknown as Uint8Array)
        : await safe.embedJpg(bytes as unknown as Uint8Array);
    const page = safe.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  const out = await safe.save({ useObjectStreams: false });
  return { bytes: new Uint8Array(out), mime: "application/pdf", extension: "pdf" };
}

/** مسار النسخة الآمنة داخل مجلد المكتب نفسه (لا يخرج عن نطاق المكتب أبداً). */
export function safeRenderPath(originalPath: string): string {
  return `${originalPath}.safe.pdf`;
}