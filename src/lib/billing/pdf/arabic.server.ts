/**
 * تشكيل النص العربي لأغراض الرسم في PDF — خادمي فقط.
 *
 * pdf-lib يرسم المحارف كما هي بلا تشكيل سياقي ولا ترتيب اتجاهي، لذلك تظهر
 * الحروف منفصلة ومعكوسة. هنا نحوّل الحروف إلى أشكالها التقديمية (Presentation
 * Forms) ثم نعكس ترتيب المقطع، فيصبح المقطع جاهزاً للرسم من اليسار إلى اليمين
 * بنفس المظهر البصري العربي الصحيح.
 */
import reshaper from "arabic-persian-reshaper";

const { ArabicShaper } = reshaper;

/** علامات التشكيل تُرسم فوق الحرف السابق، فتبقى ملتصقة به بعد العكس. */
const COMBINING = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;

export function shapeArabicRun(text: string): string {
  // نعالج الأقواس لمنع الانعكاس المزدوج بين مكتبة التشكيل ومحرك الخط
  const sanitized = text
    .replace(/\(/g, "\uE000")
    .replace(/\)/g, "\uE001");

  const shaped = (ArabicShaper.convertArabic(sanitized) as string)
    .replace(/\uE000/g, ")")
    .replace(/\uE001/g, "(");

  const chars = Array.from(shaped);
  const clusters: string[] = [];
  chars.forEach((char) => {
    if (COMBINING.test(char) && clusters.length > 0) {
      clusters[clusters.length - 1] += char;
      return;
    }
    clusters.push(char);
  });
  return clusters.join("");
}
