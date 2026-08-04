/**
 * تنقية HTML الوارد من مصادر خارجية (بريد وارد).
 *
 * المبدأ: قائمة سماح مغلقة للوسوم والخصائص. كل ما عداها يُحذف.
 * الصور الخارجية تُحجب افتراضياً حتى لا يُتتبَّع المستلم عبر Remote Images،
 * ويُحفظ المصدر الأصلي في خاصية بيانات لعرضه فقط عند طلب الموظف صراحةً.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "a",
  "img",
]);

/** وسوم تُحذف مع محتواها بالكامل. */
const DROP_WITH_CONTENT = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "template",
  "noscript",
  "svg",
  "math",
  "frameset",
  "frame",
  "applet",
  "audio",
  "video",
  "canvas",
  "map",
  "meta",
  "link",
  "base",
  "title",
  "head",
];

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

export type SanitizeResult = {
  /** HTML آمن للعرض. */
  html: string;
  /** نسخة نصية آمنة دائماً (تُستخدم كعرض افتراضي). */
  text: string;
  /** عدد الصور الخارجية المحجوبة. */
  blockedImages: number;
  /** هل احتوى المصدر على محتوى نشط خطر (سكربت/إطار/معالج حدث). */
  hadActiveContent: boolean;
};

function decodeEntitiesForText(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** تنقية HTML وارد وإرجاع نسخة آمنة + نسخة نصية. */
export function sanitizeInboundHtml(input: string | null | undefined): SanitizeResult {
  let hadActiveContent = false;
  let blockedImages = 0;
  if (!input) return { html: "", text: "", blockedImages: 0, hadActiveContent: false };

  let source = input;

  // تعليقات HTML (بما فيها التعليقات الشرطية)
  source = source.replace(/<!--[\s\S]*?-->/g, " ");
  source = source.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ");
  source = source.replace(/<!DOCTYPE[^>]*>/gi, " ");

  for (const tag of DROP_WITH_CONTENT) {
    const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    if (paired.test(source)) {
      if (
        tag === "script" ||
        tag === "iframe" ||
        tag === "object" ||
        tag === "embed" ||
        tag === "svg"
      ) {
        hadActiveContent = true;
      }
      source = source.replace(paired, " ");
    }
    const selfClosing = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    if (selfClosing.test(source)) {
      if (tag === "script" || tag === "iframe") hadActiveContent = true;
      source = source.replace(selfClosing, " ");
    }
  }

  const out = source.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_match, rawName: string, rawAttrs: string) => {
      const name = rawName.toLowerCase();
      const closing = _match.startsWith("</");
      if (!ALLOWED_TAGS.has(name)) return " ";
      if (closing) return name === "img" || name === "br" || name === "hr" ? "" : `</${name}>`;

      if (/\son[a-z]+\s*=/i.test(rawAttrs)) hadActiveContent = true;

      const allowed = ALLOWED_ATTRS[name];
      const kept: string[] = [];
      if (allowed) {
        const attrRe = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
        let m: RegExpExecArray | null;
        while ((m = attrRe.exec(rawAttrs))) {
          const attr = (m[1] ?? "").toLowerCase();
          const value = (m[3] ?? m[4] ?? m[5] ?? "").trim();
          if (
            attr.startsWith("on") ||
            attr === "style" ||
            attr === "srcset" ||
            attr === "formaction"
          ) {
            hadActiveContent = hadActiveContent || attr.startsWith("on");
            continue;
          }
          if (name === "img" && attr === "src") {
            blockedImages += 1;
            continue; // الصور الخارجية محجوبة افتراضياً
          }
          if (!allowed.has(attr)) continue;
          if (attr === "href") {
            if (!SAFE_HREF.test(value)) {
              hadActiveContent =
                hadActiveContent || /^\s*(javascript|vbscript|data)\s*:/i.test(value);
              continue;
            }
          }
          if (
            (attr === "width" || attr === "height" || attr === "colspan" || attr === "rowspan") &&
            !/^\d{1,4}$/.test(value)
          ) {
            continue;
          }
          kept.push(`${attr}="${escapeAttr(value)}"`);
        }
      }

      if (name === "a") kept.push('rel="noopener noreferrer nofollow"', 'target="_blank"');
      if (name === "img") {
        // صورة محجوبة: تُستبدل بعنصر نصي بديل، فلا يُحمَّل أي مورد خارجي
        const altMatch = /alt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(rawAttrs);
        const alt = escapeAttr(decodeEntitiesForText(altMatch?.[2] ?? altMatch?.[3] ?? "صورة"));
        return `<span data-blocked-image="true">[صورة محجوبة: ${alt}]</span>`;
      }
      if (name === "br" || name === "hr") return `<${name} />`;
      return kept.length > 0 ? `<${name} ${kept.join(" ")}>` : `<${name}>`;
    },
  );

  const html = out.replace(/[ \t]{2,}/g, " ").trim();
  const text = decodeEntitiesForText(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text, blockedImages, hadActiveContent };
}

/** إخفاء البيانات الحساسة قبل تسجيل الحمولة في سجلات التشخيص. */
export function redactPayload(value: unknown, depth = 0): unknown {
  const SENSITIVE = /(secret|token|password|authorization|apikey|api_key|signature|cookie)/i;
  if (depth > 4) return "[…]";
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 60)}…[${value.length} حرفاً]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redactPayload(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.test(key) ? "[محجوب]" : redactPayload(val, depth + 1);
    }
    return out;
  }
  return value;
}

/** إخفاء جزئي لعنوان بريد في السجلات. */
export function maskAddress(address: string): string {
  const [local, domain] = address.split("@");
  if (!domain) return "[بريد غير صحيح]";
  const head = (local ?? "").slice(0, 2);
  return `${head}${"*".repeat(Math.max((local ?? "").length - 2, 1))}@${domain}`;
}
