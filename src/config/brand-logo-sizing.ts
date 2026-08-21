/**
 * قواعد مقاسات شعار مِهلة — مصدر حقيقة واحد لكل الأسطح:
 * الويب (جوال/تابلت/سطح مكتب)، البريد الإلكتروني، ومخرجات PDF.
 *
 * القاعدة الأساسية: الارتفاع هو المتغيّر الوحيد، والعرض يُحسب من نسبة
 * الشعار الأصلية حتى لا يتمدد ولا يُقصّ، ولا يُسمح للشعار بأن يزيد عن
 * عرض حاويته (max-width) كي لا يدفع النص المجاور إلى الالتفاف.
 */

/** أبعاد الرسم المتجهي الأصلي (قفل: مِهلة + MEHLA). */
export const LOGO_VIEWBOX = { x: 381, y: 582, width: 744, height: 388 } as const;

/** نسبة العرض إلى الارتفاع (≈1.917) — أساس كل حساب مقاس. */
export const LOGO_ASPECT_RATIO = LOGO_VIEWBOX.width / LOGO_VIEWBOX.height;

/** عرض متناسب لأي ارتفاع مطلوب، مقرّب لأقرب بكسل/نقطة كاملة. */
export function logoWidthFor(height: number): number {
  return Math.round(height * LOGO_ASPECT_RATIO);
}

/**
 * سلّم مقاسات الويب: لكل مقاس ارتفاع للجوال وارتفاع أكبر من نقطة الانكسار
 * `sm` فما فوق، فيتكيّف الشعار تلقائياً دون تمرير أصناف يدوية في كل صفحة.
 * الحد الأدنى 24px يضمن بقاء سطر MEHLA مقروءاً.
 */
export const WEB_LOGO_HEIGHTS = {
  xs: { mobile: 20, desktop: 24 },
  sm: { mobile: 24, desktop: 28 },
  md: { mobile: 28, desktop: 36 },
  lg: { mobile: 36, desktop: 48 },
  xl: { mobile: 44, desktop: 64 },
} as const;

export type MehlaLogoSize = keyof typeof WEB_LOGO_HEIGHTS;

/** أصناف Tailwind الجاهزة لكل مقاس (h-[..] للجوال + sm:h-[..] للأكبر). */
export const WEB_LOGO_CLASSES: Record<MehlaLogoSize, string> = {
  xs: "h-5 sm:h-6",
  sm: "h-6 sm:h-7",
  md: "h-7 sm:h-9",
  lg: "h-9 sm:h-12",
  xl: "h-11 sm:h-16",
};

/**
 * البريد الإلكتروني: مقاس ثابت واحد لأن عملاء البريد (Outlook/Word) لا
 * يدعمون media queries بشكل موثوق، ويجب تصريح العرض والارتفاع معاً.
 */
export const EMAIL_LOGO_HEIGHT = 44;
export const EMAIL_LOGO_WIDTH = logoWidthFor(EMAIL_LOGO_HEIGHT); // 84

/** PDF: حدود خانة الشعار في ترويسة المستند بوحدة النقطة (pt). */
export const PDF_LOGO_MAX_HEIGHT = 40;
export const PDF_LOGO_MAX_WIDTH = 96;

/**
 * تحجيم شعار PDF: يحفظ النسبة ويحترم كلا الحدين، ويعمل أيضاً مع شعار
 * مكتب مخصّص بنسبة مختلفة (أفقي طويل أو مربّع) دون قصّ أو تشويه.
 */
export function fitPdfLogo(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(
    PDF_LOGO_MAX_WIDTH / naturalWidth,
    PDF_LOGO_MAX_HEIGHT / naturalHeight,
  );
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}
