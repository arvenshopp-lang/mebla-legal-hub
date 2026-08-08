/**
 * خريطة العناصر الحقيقية للصفحة + قوالب بداية CSS مبنية عليها.
 * الأنماط الأساسية للمنصة مكتوبة بـ Tailwind داخل مكوّنات React،
 * لذلك لا يوجد «ملف CSS أساسي» قابل للتحرير؛ ما يمكن تحريره هو طبقة
 * CSS مخصصة تُحصر داخل [data-page="key"] وتُطبَّق فوق الأساس.
 */

export type HarvestedSelector = {
  selector: string;
  count: number;
  label: string;
};

/** عناصر بنيوية ودلالية نبحث عنها داخل الصفحة الحقيقية. */
const STRUCTURAL: { selector: string; label: string }[] = [
  { selector: "header", label: "الترويسة" },
  { selector: "nav", label: "التنقل" },
  { selector: "aside", label: "القائمة الجانبية" },
  { selector: "main", label: "المحتوى الرئيسي" },
  { selector: "footer", label: "التذييل" },
  { selector: "section", label: "الأقسام" },
  { selector: "h1", label: "العنوان الرئيسي" },
  { selector: "h2", label: "عناوين فرعية" },
  { selector: "h3", label: "عناوين صغيرة" },
  { selector: "p", label: "نص" },
  { selector: "a", label: "روابط" },
  { selector: "button", label: "أزرار" },
  { selector: "table", label: "جداول" },
  { selector: "thead th", label: "رؤوس الجداول" },
  { selector: "tbody td", label: "خلايا الجداول" },
  { selector: "input", label: "حقول إدخال" },
  { selector: "textarea", label: "حقول نصية" },
  { selector: "select", label: "قوائم منسدلة" },
  { selector: "label", label: "تسميات الحقول" },
  { selector: "img", label: "صور" },
  { selector: "svg", label: "أيقونات" },
  { selector: "ul", label: "قوائم" },
  { selector: "dl", label: "قوائم تعريف" },
  { selector: "form", label: "نماذج" },
];

const MAX_SLOTS = 24;

/**
 * يقرأ DOM المعاينة (نفس الأصل) ويستخرج selectors فعلية قابلة للاستهداف:
 * عناصر دلالية + قيم data-slot لمكوّنات shadcn + سمات data-* المستقرة.
 * لا يُستخرج أي نص أو بيانات من الصفحة — أسماء العناصر فقط.
 */
export function harvestSelectors(doc: Document): HarvestedSelector[] {
  const out: HarvestedSelector[] = [];

  for (const item of STRUCTURAL) {
    let count = 0;
    try {
      count = doc.querySelectorAll(item.selector).length;
    } catch {
      count = 0;
    }
    if (count > 0) out.push({ selector: item.selector, count, label: item.label });
  }

  const slots = new Map<string, number>();
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-slot]"))) {
    const slot = el.dataset.slot;
    if (!slot || !/^[a-z0-9-]+$/i.test(slot)) continue;
    slots.set(slot, (slots.get(slot) ?? 0) + 1);
  }
  for (const [slot, count] of Array.from(slots.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SLOTS)) {
    out.push({ selector: `[data-slot="${slot}"]`, count, label: `مكوّن ${slot}` });
  }

  for (const attr of ["data-app-header", "data-app-sidebar", "data-page-header", "data-empty"]) {
    const count = doc.querySelectorAll(`[${attr}]`).length;
    if (count > 0) out.push({ selector: `[${attr}]`, count, label: attr });
  }

  return out;
}

function scopeNote(pageKey: string) {
  return pageKey === "global"
    ? "/* CSS عام — يُطبَّق على كل صفحات المنصة */"
    : `/* يُحصر تلقائياً داخل [data-page="${pageKey}"] — لا يؤثر على بقية الصفحات */`;
}

/**
 * قالب بداية مبني على العناصر الموجودة فعلياً في الصفحة المختارة.
 * لا يُولَّد أي CSS مضغوط ولا قواعد لعناصر غير موجودة.
 */
export function starterTemplate(pageKey: string, selectors: HarvestedSelector[]): string {
  const has = (sel: string) => selectors.some((s) => s.selector === sel);
  const lines: string[] = [scopeNote(pageKey), ""];

  if (has("h1")) {
    lines.push("h1 {", "  letter-spacing: -0.4px;", "  line-height: 1.35;", "}", "");
  }
  if (has("main")) {
    lines.push("main {", "  padding-block: 32px;", "}", "");
  }
  if (has('[data-slot="card"]')) {
    lines.push(
      '[data-slot="card"] {',
      "  border-radius: var(--radius-l);",
      "  box-shadow: var(--elevation-s);",
      "}",
      "",
    );
  }
  if (has("table")) {
    lines.push("thead th {", "  font-weight: 700;", "}", "");
  }
  if (has("button")) {
    lines.push("button {", "  min-height: 44px;", "}", "");
  }

  if (lines.length === 2) {
    lines.push("/* لم يُعثر على عناصر مقترحة — اكتب قواعدك مباشرة */", ".mehla-custom {", "}", "");
  }

  return lines.join("\n");
}
