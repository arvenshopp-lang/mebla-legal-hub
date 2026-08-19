/**
 * توليد مصفوفة رمز QR للتحقق العام من المستندات — خادمي فقط.
 *
 * لا نولّد صورة PNG ثم ندمجها، بل نُخرج مصفوفة الوحدات ويرسمها محرك الـPDF
 * كمربعات متجهية. هذا يعطي رمزاً حاداً في أي تكبير، ولا يمر إطلاقاً على مسار
 * تشكيل الحروف العربية فلا يؤثر على جودة النص.
 */
import QRCode from "qrcode";

export type QrMatrix = {
  /** عدد الوحدات في كل ضلع. */
  size: number;
  /** بايت لكل وحدة (1 = وحدة داكنة) بطول size × size. */
  modules: Uint8Array;
};

/** رابط صفحة التحقق العامة لرقم تحقق معيّن. */
export function buildVerificationUrl(verificationId: string): string {
  return `https://mehlalex.com/verify?id=${encodeURIComponent(verificationId)}`;
}

/**
 * يبني مصفوفة QR لنص معطى. يعيد null عند أي فشل حتى لا يتعطّل إصدار المستند
 * بسبب الرمز.
 */
export function buildQrMatrix(text: string): QrMatrix | null {
  const value = (text || "").trim();
  if (!value) return null;
  try {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    return { size: qr.modules.size, modules: Uint8Array.from(qr.modules.data) };
  } catch {
    return null;
  }
}
