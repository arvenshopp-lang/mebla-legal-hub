/**
 * مقياس أزرار موحّد للصفحات العامة (الهيدر، Hero، قائمة الجوال).
 * الهدف: تساوي الارتفاعات والحشو وتوسيط النص رأسياً في كل الأزرار
 * سواء احتوت أيقونة أو لا، مع تمييز بصري واضح بين الأساسي والثانوي والهادئ.
 */

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-m)] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** أزرار Hero: ارتفاع 48px وعرض أدنى موحّد على سطح المكتب. */
const HERO = `${BASE} h-12 w-full px-6 text-[15px] sm:w-auto sm:min-w-[190px]`;

/** أزرار الهيدر على سطح المكتب: ارتفاع 40px. */
const HEADER = `${BASE} h-10 px-4 text-[13.5px]`;

/** أزرار قائمة الجوال: هدف لمس 48px بعرض كامل. */
const SHEET = `${BASE} h-12 w-full px-4 text-[14px]`;

const PRIMARY = "bg-primary font-bold text-primary-foreground shadow-md hover:bg-primary-hover";
const SECONDARY =
  "border border-border-strong bg-surface font-semibold text-foreground shadow-2xs hover:bg-surface-muted";
const TERTIARY =
  "border border-border bg-surface font-medium text-foreground hover:border-border-strong hover:bg-surface-muted";

export const heroBtn = {
  primary: `${HERO} ${PRIMARY}`,
  secondary: `${HERO} ${SECONDARY}`,
  tertiary: `${HERO} ${TERTIARY}`,
} as const;

export const headerBtn = {
  primary: `${HEADER} ${PRIMARY} shadow-xs`,
  secondary: `${HEADER} ${SECONDARY}`,
  tertiary: `${HEADER} ${TERTIARY}`,
} as const;

export const sheetBtn = {
  primary: `${SHEET} ${PRIMARY}`,
  secondary: `${SHEET} ${SECONDARY}`,
  tertiary: `${SHEET} ${TERTIARY}`,
} as const;

/** مقاس أيقونة موحّد داخل أزرار الصفحات العامة. */
export const publicBtnIcon = "h-4 w-4 shrink-0";
