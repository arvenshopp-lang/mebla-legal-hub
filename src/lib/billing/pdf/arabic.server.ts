/**
 * تشكيل النص العربي لأغراض الرسم في PDF — خادمي فقط.
 *
 * pdf-lib يرسم المحارف كما هي بلا تشكيل سياقي ولا ترتيب اتجاهي، لذلك تظهر
 * الحروف منفصلة ومعكوسة. هنا نحوّل الحروف إلى أشكالها التقديمية (Presentation
 * Forms) ثم نعكس ترتيب المقطع، فيصبح المقطع جاهزاً للرسم من اليسار إلى اليمين
 * بنفس المظهر البصري العربي الصحيح.
 */
import { ArabicShaper } from "arabic-persian-reshaper";

/** علامات التشكيل تُرسم فوق الحرف السابق، فتبقى ملتصقة به بعد العكس. */
const COMBINING = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;

export function shapeArabicRun(text: string): string {
  const shaped = ArabicShaper.convertArabic(text) as string;
  const chars = Array.from(shaped);
  const clusters: string[] = [];
  chars.forEach((char) => {
    if (COMBINING.test(char) && clusters.length > 0) {
      clusters[clusters.length - 1] += char;
      return;
    }
    clusters.push(char);
  });
  return clusters.reverse().join("");
}
