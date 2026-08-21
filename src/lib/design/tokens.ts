/**
 * Design Tokens المركزية لمنصة مِهلة.
 * كل رمز هنا يقابل متغير CSS حقيقياً يستخدمه نظام التصميم، فأي تعديل من محرر
 * التصميم يُنتج طبقة :root تعلو التعريفات الافتراضية دون تعديل ملفات المكونات.
 */

export type TokenType = "color" | "length" | "number" | "font" | "shadow" | "select" | "text";

export type TokenDef = {
  /** اسم متغير CSS الحقيقي */
  key: string;
  label: string;
  type: TokenType;
  /** القيمة الافتراضية المعروضة كتلميح */
  fallback: string;
  options?: { value: string; label: string }[];
  /** قاعدة إضافية تُولَّد عند ضبط الرمز (للأبعاد التي لا يقرأها Tailwind تلقائياً) */
  applyTo?: { selector: string; prop: string };
  help?: string;
};

export type TokenGroup = { id: string; label: string; description?: string; tokens: TokenDef[] };

/**
 * خط المنصة الرسمي — IBM Plex Sans Arabic مستضاف محلياً، وهو الخيار الوحيد.
 * لا يُسمح بأي خط خارجي أو رابط CDN، ولا بخيار خط نظام قد يُغيّر الهوية أو يضيف تحميلات.
 */
export const APPROVED_FONTS: { value: string; label: string }[] = [
  {
    value: '"IBM Plex Sans Arabic", sans-serif',
    label: "IBM Plex Sans Arabic (خط المنصة الرسمي)",
  },
];

const WEIGHTS = ["400", "500", "600", "700", "800"].map((w) => ({ value: w, label: w }));

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: "identity",
    label: "الهوية العامة",
    description: "الأساسيات التي تنعكس على كل شاشة في المنصة.",
    tokens: [
      { key: "--primary", label: "اللون الأساسي للهوية", type: "color", fallback: "#173F35" },
      { key: "--primary-hover", label: "الأساسي عند المرور", type: "color", fallback: "#12352C" },
      { key: "--primary-foreground", label: "نص على الأساسي", type: "color", fallback: "#FFFFFF" },
      { key: "--background", label: "الخلفية الرئيسية", type: "color", fallback: "#F5F3EE" },
      { key: "--surface", label: "خلفية الأسطح (البطاقات)", type: "color", fallback: "#FFFFFF" },
      { key: "--surface-muted", label: "الخلفية الثانوية", type: "color", fallback: "#F1F1EE" },
      { key: "--text-primary", label: "النص الأساسي", type: "color", fallback: "#1B2B26" },
      { key: "--text-secondary", label: "النص الثانوي", type: "color", fallback: "#5A6B66" },
      { key: "--text-muted", label: "النص الخفيف", type: "color", fallback: "#7C8A86" },
      { key: "--gold", label: "لون التمييز (ذهبي)", type: "color", fallback: "#C9A961" },
      { key: "--radius-s", label: "نصف قطر صغير", type: "length", fallback: "6px" },
      { key: "--radius-m", label: "نصف قطر متوسط", type: "length", fallback: "8px" },
      { key: "--radius-l", label: "نصف قطر كبير", type: "length", fallback: "12px" },
      {
        key: "--content-max-width",
        label: "عرض المحتوى الأقصى",
        type: "length",
        fallback: "1200px",
        applyTo: { selector: "main > .mx-auto, main.mx-auto", prop: "max-width" },
      },
      {
        key: "--ui-density",
        label: "كثافة الواجهة",
        type: "select",
        fallback: "عادية",
        options: [
          { value: "1", label: "عادية" },
          { value: "0.9", label: "مضغوطة" },
          { value: "1.1", label: "مريحة" },
        ],
      },
      {
        key: "--elevation-s",
        label: "الظل الصغير",
        type: "shadow",
        fallback: "0 1px 3px rgba(0,0,0,.07)",
      },
      {
        key: "--elevation-m",
        label: "الظل المتوسط",
        type: "shadow",
        fallback: "0 4px 12px rgba(0,0,0,.07)",
      },
    ],
  },
  {
    id: "colors",
    label: "الألوان الدلالية",
    tokens: [
      { key: "--success", label: "النجاح", type: "color", fallback: "#2F7D4F" },
      { key: "--success-soft", label: "خلفية النجاح", type: "color", fallback: "#EDF7F0" },
      { key: "--warning", label: "التحذير", type: "color", fallback: "#B3801F" },
      { key: "--warning-soft", label: "خلفية التحذير", type: "color", fallback: "#FBF3E4" },
      { key: "--danger", label: "الخطأ", type: "color", fallback: "#B3392C" },
      { key: "--danger-soft", label: "خلفية الخطأ", type: "color", fallback: "#FBEDEB" },
      { key: "--info", label: "المعلومات", type: "color", fallback: "#2B5EA7" },
      { key: "--info-soft", label: "خلفية المعلومات", type: "color", fallback: "#EDF2FB" },
      { key: "--border", label: "الحدود", type: "color", fallback: "#E3E7E5" },
      { key: "--border-strong", label: "الحدود القوية", type: "color", fallback: "#CBD3D0" },
    ],
  },
  {
    id: "typography",
    label: "الخطوط",
    description: "خط المنصة الرسمي المستضاف محلياً فقط — لا خطوط خارجية.",
    tokens: [
      {
        key: "--font-arabic",
        label: "الخط العربي الأساسي",
        type: "font",
        fallback: "IBM Plex Sans Arabic",
        applyTo: { selector: "html", prop: "font-family" },
      },
      {
        key: "--font-english",
        label: "الخط اللاتيني",
        type: "font",
        fallback: "IBM Plex Sans Arabic",
      },
      {
        key: "--font-headings",
        label: "خط العناوين",
        type: "font",
        fallback: "IBM Plex Sans Arabic",
        applyTo: { selector: "h1, h2, h3, h4, h5, h6", prop: "font-family" },
      },
      {
        key: "--font-size-display",
        label: "حجم العنوان الكبير",
        type: "length",
        fallback: "40px",
        applyTo: { selector: "h1", prop: "font-size" },
      },
      {
        key: "--font-size-title",
        label: "حجم عنوان الصفحة",
        type: "length",
        fallback: "28px",
        applyTo: { selector: "h2", prop: "font-size" },
      },
      {
        key: "--font-size-subtitle",
        label: "حجم العنوان الفرعي",
        type: "length",
        fallback: "20px",
        applyTo: { selector: "h3", prop: "font-size" },
      },
      {
        key: "--font-size-body",
        label: "حجم النص",
        type: "length",
        fallback: "15px",
        applyTo: { selector: "body", prop: "font-size" },
      },
      { key: "--font-size-small", label: "حجم النص الصغير", type: "length", fallback: "13px" },
      {
        key: "--font-weight-heading",
        label: "وزن العناوين",
        type: "select",
        fallback: "700",
        options: WEIGHTS,
        applyTo: { selector: "h1, h2, h3, h4", prop: "font-weight" },
      },
      {
        key: "--font-weight-body",
        label: "وزن النص",
        type: "select",
        fallback: "400",
        options: WEIGHTS,
      },
      {
        key: "--line-height-body",
        label: "ارتفاع السطر",
        type: "number",
        fallback: "1.7",
        applyTo: { selector: "body", prop: "line-height" },
      },
      {
        key: "--letter-spacing-body",
        label: "تباعد الحروف",
        type: "length",
        fallback: "0",
        applyTo: { selector: "body", prop: "letter-spacing" },
      },
    ],
  },
  {
    id: "buttons",
    label: "الأزرار",
    description: "إعدادات مستقلة لكل نوع من الأزرار مع حالات التفاعل.",
    tokens: [
      {
        key: "--button-height",
        label: "ارتفاع الزر",
        type: "length",
        fallback: "44px",
        applyTo: {
          selector: "button:not([data-slot='checkbox']):not([data-slot='switch'])",
          prop: "min-height",
        },
      },
      {
        key: "--button-radius",
        label: "نصف قطر الزر",
        type: "length",
        fallback: "8px",
        applyTo: { selector: "button, a[role='button']", prop: "border-radius" },
      },
      {
        key: "--button-padding-x",
        label: "الحشو الأفقي",
        type: "length",
        fallback: "20px",
        applyTo: { selector: "button", prop: "padding-inline" },
      },
      {
        key: "--button-font-size",
        label: "حجم خط الزر",
        type: "length",
        fallback: "14px",
        applyTo: { selector: "button", prop: "font-size" },
      },
      {
        key: "--button-font-weight",
        label: "وزن خط الزر",
        type: "select",
        fallback: "600",
        options: WEIGHTS,
        applyTo: { selector: "button", prop: "font-weight" },
      },
      {
        key: "--button-border-width",
        label: "سماكة حدود الزر",
        type: "length",
        fallback: "1px",
        applyTo: {
          selector: "button[data-variant='secondary'], .btn-secondary",
          prop: "border-width",
        },
      },
      {
        key: "--button-shadow",
        label: "ظل الزر",
        type: "shadow",
        fallback: "بدون",
        applyTo: { selector: "button", prop: "box-shadow" },
      },
      {
        key: "--button-primary-bg",
        label: "الأساسي · الخلفية",
        type: "color",
        fallback: "لون الهوية",
        applyTo: { selector: ".bg-primary", prop: "background-color" },
      },
      {
        key: "--button-primary-fg",
        label: "الأساسي · النص",
        type: "color",
        fallback: "#FFFFFF",
        applyTo: { selector: ".bg-primary", prop: "color" },
      },
      {
        key: "--button-primary-hover-bg",
        label: "الأساسي · عند المرور",
        type: "color",
        fallback: "أغمق",
        applyTo: { selector: ".bg-primary:hover", prop: "background-color" },
      },
      {
        key: "--button-secondary-bg",
        label: "الثانوي · الخلفية",
        type: "color",
        fallback: "أبيض",
        applyTo: { selector: "button.border-border, .btn-secondary", prop: "background-color" },
      },
      {
        key: "--button-secondary-fg",
        label: "الثانوي · النص",
        type: "color",
        fallback: "النص الأساسي",
        applyTo: { selector: "button.border-border, .btn-secondary", prop: "color" },
      },
      {
        key: "--button-danger-bg",
        label: "الحذف · الخلفية",
        type: "color",
        fallback: "لون الخطأ",
        applyTo: {
          selector: ".bg-danger, button[data-variant='danger']",
          prop: "background-color",
        },
      },
      {
        key: "--button-success-bg",
        label: "النجاح · الخلفية",
        type: "color",
        fallback: "لون النجاح",
        applyTo: {
          selector: ".bg-success, button[data-variant='success']",
          prop: "background-color",
        },
      },
      {
        key: "--button-focus-ring",
        label: "حلقة التركيز",
        type: "color",
        fallback: "لون الهوية",
        applyTo: { selector: "button:focus-visible", prop: "outline-color" },
      },
      {
        key: "--button-disabled-opacity",
        label: "شفافية المعطل",
        type: "number",
        fallback: "0.5",
        applyTo: { selector: "button:disabled", prop: "opacity" },
      },
    ],
  },
  {
    id: "forms",
    label: "النماذج",
    tokens: [
      {
        key: "--input-height",
        label: "ارتفاع الحقل",
        type: "length",
        fallback: "44px",
        applyTo: {
          selector: "input:not([type='checkbox']):not([type='radio']), select",
          prop: "min-height",
        },
      },
      {
        key: "--input-radius",
        label: "نصف قطر الحقل",
        type: "length",
        fallback: "8px",
        applyTo: { selector: "input, select, textarea", prop: "border-radius" },
      },
      {
        key: "--input-bg",
        label: "خلفية الحقل",
        type: "color",
        fallback: "#FFFFFF",
        applyTo: {
          selector: "input:not([type='checkbox']):not([type='radio']), select, textarea",
          prop: "background-color",
        },
      },
      {
        key: "--input-fg",
        label: "لون نص الحقل",
        type: "color",
        fallback: "النص الأساسي",
        applyTo: { selector: "input, select, textarea", prop: "color" },
      },
      {
        key: "--input-border",
        label: "لون حدود الحقل",
        type: "color",
        fallback: "لون الحدود",
        applyTo: { selector: "input, select, textarea", prop: "border-color" },
      },
      {
        key: "--input-border-width",
        label: "سماكة الحدود",
        type: "length",
        fallback: "1px",
        applyTo: { selector: "input, select, textarea", prop: "border-width" },
      },
      {
        key: "--input-font-size",
        label: "حجم خط الحقل",
        type: "length",
        fallback: "14px",
        applyTo: { selector: "input, select, textarea", prop: "font-size" },
      },
      {
        key: "--input-padding-x",
        label: "حشو الحقل",
        type: "length",
        fallback: "12px",
        applyTo: {
          selector: "input:not([type='checkbox']):not([type='radio']), select, textarea",
          prop: "padding-inline",
        },
      },
      {
        key: "--input-placeholder",
        label: "لون النص الإرشادي",
        type: "color",
        fallback: "النص الخفيف",
        applyTo: { selector: "input::placeholder, textarea::placeholder", prop: "color" },
      },
      {
        key: "--input-focus-border",
        label: "حدود التركيز",
        type: "color",
        fallback: "لون الهوية",
        applyTo: { selector: "input:focus, select:focus, textarea:focus", prop: "border-color" },
      },
      {
        key: "--input-error-border",
        label: "حدود الخطأ",
        type: "color",
        fallback: "لون الخطأ",
        applyTo: {
          selector: "input[aria-invalid='true'], textarea[aria-invalid='true']",
          prop: "border-color",
        },
      },
      {
        key: "--checkbox-accent",
        label: "لون مربعات الاختيار",
        type: "color",
        fallback: "لون الهوية",
        applyTo: { selector: "input[type='checkbox'], input[type='radio']", prop: "accent-color" },
      },
      {
        key: "--field-gap",
        label: "المسافة بين الحقول",
        type: "length",
        fallback: "16px",
        applyTo: { selector: "form .space-y-4 > * + *", prop: "margin-top" },
      },
    ],
  },
  {
    id: "surfaces",
    label: "البطاقات والجداول والتخطيط",
    tokens: [
      {
        key: "--card-bg",
        label: "خلفية البطاقة",
        type: "color",
        fallback: "أبيض",
        applyTo: { selector: ".bg-surface", prop: "background-color" },
      },
      {
        key: "--card-radius",
        label: "نصف قطر البطاقة",
        type: "length",
        fallback: "12px",
        applyTo: { selector: "[data-slot='card']", prop: "border-radius" },
      },
      {
        key: "--card-border",
        label: "حدود البطاقة",
        type: "color",
        fallback: "لون الحدود",
        applyTo: { selector: ".border-border", prop: "border-color" },
      },
      {
        key: "--card-shadow",
        label: "ظل البطاقة",
        type: "shadow",
        fallback: "بدون",
        applyTo: { selector: "[data-slot='card']", prop: "box-shadow" },
      },
      {
        key: "--table-header-bg",
        label: "خلفية رأس الجدول",
        type: "color",
        fallback: "الخلفية الثانوية",
        applyTo: { selector: "thead, thead tr", prop: "background-color" },
      },
      {
        key: "--table-row-border",
        label: "حدود صفوف الجدول",
        type: "color",
        fallback: "لون الحدود",
        applyTo: { selector: "tbody tr", prop: "border-color" },
      },
      {
        key: "--table-row-hover",
        label: "الصف عند المرور",
        type: "color",
        fallback: "الخلفية الثانوية",
        applyTo: { selector: "tbody tr:hover", prop: "background-color" },
      },
      {
        key: "--table-cell-padding",
        label: "حشو خلايا الجدول",
        type: "length",
        fallback: "12px",
        applyTo: { selector: "th, td", prop: "padding" },
      },
      {
        key: "--sidebar-width",
        label: "عرض القائمة الجانبية",
        type: "length",
        fallback: "256px",
        applyTo: { selector: "aside[data-app-sidebar], .app-sidebar", prop: "width" },
      },
      { key: "--sidebar", label: "خلفية القائمة الجانبية", type: "color", fallback: "أبيض" },
      {
        key: "--header-height",
        label: "ارتفاع الترويسة",
        type: "length",
        fallback: "64px",
        applyTo: { selector: "header[data-app-header]", prop: "height" },
      },
      {
        key: "--footer-bg",
        label: "خلفية التذييل",
        type: "color",
        fallback: "لون الهوية",
        applyTo: { selector: "footer", prop: "background-color" },
      },
      {
        key: "--section-spacing",
        label: "المسافة بين الأقسام",
        type: "length",
        fallback: "80px",
        applyTo: { selector: "main > section + section", prop: "margin-top" },
      },
    ],
  },
  {
    id: "mobile",
    label: "نسخة الجوال",
    description: "تُطبَّق داخل @media (max-width: 767px) فقط.",
    tokens: [
      {
        key: "--m-font-size-body",
        label: "حجم النص",
        type: "length",
        fallback: "15px",
        applyTo: { selector: "body", prop: "font-size" },
      },
      {
        key: "--m-font-size-display",
        label: "حجم العنوان الكبير",
        type: "length",
        fallback: "28px",
        applyTo: { selector: "h1", prop: "font-size" },
      },
      {
        key: "--m-font-size-title",
        label: "حجم عنوان الصفحة",
        type: "length",
        fallback: "22px",
        applyTo: { selector: "h2", prop: "font-size" },
      },
      {
        key: "--m-button-height",
        label: "ارتفاع الزر",
        type: "length",
        fallback: "44px",
        applyTo: { selector: "button", prop: "min-height" },
      },
      {
        key: "--m-input-height",
        label: "ارتفاع الحقل",
        type: "length",
        fallback: "44px",
        applyTo: {
          selector: "input:not([type='checkbox']):not([type='radio']), select",
          prop: "min-height",
        },
      },
      { key: "--m-radius-l", label: "نصف قطر البطاقات", type: "length", fallback: "12px" },
      {
        key: "--m-section-spacing",
        label: "المسافة بين الأقسام",
        type: "length",
        fallback: "48px",
        applyTo: { selector: "main > section + section", prop: "margin-top" },
      },
    ],
  },
];

export const ALL_TOKENS: TokenDef[] = TOKEN_GROUPS.flatMap((g) => g.tokens);
const TOKEN_MAP = new Map(ALL_TOKENS.map((t) => [t.key, t]));

export type DesignTokens = Record<string, string>;

export type ThemeMeta = {
  direction: "rtl" | "ltr";
  mode: "light" | "dark" | "auto";
};

export const DEFAULT_META: ThemeMeta = { direction: "rtl", mode: "light" };

/* ------------------------------- التحقق ------------------------------- */

const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\([^;{}]{1,120}\)|transparent|currentColor|[a-zA-Z]{3,20})$/;
const LENGTH_RE =
  /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|ch|dvh)?$|^0$|^clamp\([^;{}]{1,80}\)$|^calc\([^;{}]{1,80}\)$/;
const NUMBER_RE = /^\d*\.?\d+$/;
const SHADOW_RE = /^(none|[0-9a-zA-Z\s.,()#%/-]{1,220})$/;

/** يُعيد قيمة نظيفة أو null إذا كانت غير صالحة. */
export function sanitizeTokenValue(def: TokenDef, raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return null;
  if (/[;{}<>@]/.test(value) || /url\s*\(/i.test(value) || /expression|javascript:/i.test(value))
    return null;
  switch (def.type) {
    case "color":
      return COLOR_RE.test(value) ? value : null;
    case "length":
      return LENGTH_RE.test(value) ? value : null;
    case "number":
      return NUMBER_RE.test(value) ? value : null;
    case "shadow":
      return SHADOW_RE.test(value) ? value : null;
    case "font":
      return APPROVED_FONTS.some((f) => f.value === value) ? value : null;
    case "select":
      return def.options?.some((o) => o.value === value) ? value : null;
    case "text":
      return value.length <= 120 ? value : null;
    default:
      return null;
  }
}

/** ينظّف كائن الرموز بالكامل ويستبعد المفاتيح غير المعروفة. */
export function sanitizeTokens(input: unknown): { tokens: DesignTokens; rejected: string[] } {
  const tokens: DesignTokens = {};
  const rejected: string[] = [];
  if (!input || typeof input !== "object") return { tokens, rejected };
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const def = TOKEN_MAP.get(key);
    if (!def || typeof raw !== "string") {
      if (key !== "__meta") rejected.push(key);
      continue;
    }
    const clean = sanitizeTokenValue(def, raw);
    if (clean === null) rejected.push(key);
    else tokens[key] = clean;
  }
  return { tokens, rejected };
}

export function sanitizeMeta(input: unknown): ThemeMeta {
  const meta = (input ?? {}) as Partial<ThemeMeta>;
  return {
    direction: meta.direction === "ltr" ? "ltr" : "rtl",
    mode: meta.mode === "dark" || meta.mode === "auto" ? meta.mode : "light",
  };
}

/* ---------------------------- توليد CSS ---------------------------- */

function declarations(tokens: DesignTokens, keys: string[]): string {
  return keys
    .filter((k) => tokens[k])
    .map((k) => `${k}:${tokens[k]}`)
    .join(";");
}

const MOBILE_PREFIX = "--m-";

/**
 * ينتج CSS الرموز لنطاق معيّن.
 * scopeSelector = ":root" للتصميم العام، أو '[data-page="key"]' لصفحة محددة.
 */
export function tokensToCss(tokens: DesignTokens, scopeSelector: string): string {
  const desktopKeys = Object.keys(tokens).filter((k) => !k.startsWith(MOBILE_PREFIX));
  const mobileKeys = Object.keys(tokens).filter((k) => k.startsWith(MOBILE_PREFIX));
  const out: string[] = [];

  const vars = declarations(tokens, desktopKeys);
  if (vars) out.push(`${scopeSelector}{${vars}}`);

  // قواعد المكونات للرموز التي لا تُقرأ تلقائياً
  const rules: string[] = [];
  for (const key of desktopKeys) {
    const def = TOKEN_MAP.get(key);
    if (!def?.applyTo) continue;
    const sel =
      scopeSelector === ":root"
        ? def.applyTo.selector
        : scopeSelector.replace(/^/, "") + " " + def.applyTo.selector;
    rules.push(`${sel}{${def.applyTo.prop}:var(${key})}`);
  }
  if (rules.length) out.push(rules.join(""));

  if (mobileKeys.length) {
    const mvars = declarations(tokens, mobileKeys);
    const mrules: string[] = [];
    for (const key of mobileKeys) {
      const def = TOKEN_MAP.get(key);
      if (!def?.applyTo) continue;
      const sel =
        scopeSelector === ":root"
          ? def.applyTo.selector
          : `${scopeSelector} ${def.applyTo.selector}`;
      mrules.push(`${sel}{${def.applyTo.prop}:var(${key})}`);
    }
    out.push(`@media (max-width:767px){${scopeSelector}{${mvars}}${mrules.join("")}}`);
  }

  return out.join("\n");
}

/**
 * أوراق الأنماط المطلوبة للخطوط. الخط الرسمي مستضاف محلياً ضمن حزمة المنصة،
 * لذلك لا نحتاج أي رابط خارجي — تُعاد قائمة فارغة عمداً.
 */
export function fontLinks(_tokens: DesignTokens): string[] {
  return [];
}
