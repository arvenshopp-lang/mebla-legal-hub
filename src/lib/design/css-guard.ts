/**
 * حارس CSS المخصص — يفحص ويطبّع ويحصر النطاق قبل أي نشر.
 * لا يُنشر أي CSS لم يمر من هنا، ولا يُخزَّن CSS غير مفحوص كنسخة منشورة.
 */

export type CssValidation = {
  valid: boolean;
  warnings: string[];
  blocked_rules: string[];
  normalized_css: string;
  size_bytes: number;
};

export const MAX_CSS_BYTES = 100 * 1024;

/**
 * خطوط المنصة مستضافة محلياً بالكامل، فلا حاجة لأي @import خارجي.
 * القائمة فارغة عمداً: أي @import إلى نطاق خارجي يُحجب.
 */
const TRUSTED_IMPORT_HOSTS: string[] = [];

/** عناصر أمان وقانونية لا يُسمح بإخفائها. */
const PROTECTED_PATTERNS = [
  /logout/i,
  /sign-?out/i,
  /تسجيل\s*الخروج/,
  /data-security/i,
  /data-legal/i,
  /role=["']?alert/i,
  /\[data-slot=["']?alert/i,
  /aria-invalid/i,
  /\.error\b/i,
  /\bdata-critical/i,
];

const HIDING_DECL =
  /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(\.0*)?\s*[;}]|content-visibility\s*:\s*hidden|clip-path\s*:\s*inset\(\s*100%|transform\s*:\s*scale\(\s*0\s*\)|font-size\s*:\s*0)/i;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function minify(css: string): string {
  return css
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

type Block = { selector: string; body: string };

/** تقسيم CSS إلى كتل على المستوى الأعلى (يدعم at-rules المتداخلة). */
export function splitBlocks(css: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let start = 0;
  let selectorEnd = -1;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) selectorEnd = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        blocks.push({
          selector: css.slice(start, selectorEnd).trim(),
          body: css.slice(selectorEnd + 1, i),
        });
        start = i + 1;
      }
      if (depth < 0) depth = 0;
    } else if (depth === 0 && ch === ";") {
      const stmt = css.slice(start, i).trim();
      if (stmt) blocks.push({ selector: stmt, body: "\u0000statement" });
      start = i + 1;
    }
  }
  return blocks;
}

function prefixSelectorList(selectorList: string, scope: string): string {
  return selectorList
    .split(",")
    .map((sel) => {
      const s = sel.trim();
      if (!s) return "";
      if (s.startsWith(scope)) return s;
      if (/^(html|:root|body)\b/i.test(s)) return `${scope}${s.replace(/^(html|:root|body)/i, "")}`.trim() || scope;
      return `${scope} ${s}`;
    })
    .filter(Boolean)
    .join(",");
}

const NESTING_AT_RULES = /^@(media|supports|container|layer)\b/i;

/** يحصر كل قاعدة داخل نطاق الصفحة حتى لا يتسرّب CSS الصفحة لغيرها. */
export function scopeCss(css: string, scope: string): string {
  const out: string[] = [];
  for (const block of splitBlocks(css)) {
    if (block.body === "\u0000statement") continue;
    if (block.selector.startsWith("@")) {
      if (NESTING_AT_RULES.test(block.selector)) {
        out.push(`${block.selector}{${scopeCss(block.body, scope)}}`);
      } else if (/^@(keyframes|font-face|property)/i.test(block.selector)) {
        out.push(`${block.selector}{${block.body}}`);
      }
      continue;
    }
    out.push(`${prefixSelectorList(block.selector, scope)}{${block.body}}`);
  }
  return out.join("");
}

function collectRules(css: string, acc: Block[] = []): Block[] {
  for (const block of splitBlocks(css)) {
    if (block.body === "\u0000statement") {
      acc.push(block);
      continue;
    }
    if (NESTING_AT_RULES.test(block.selector)) collectRules(block.body, acc);
    else acc.push(block);
  }
  return acc;
}

/**
 * التحقق الأمني الكامل للـ CSS المخصص.
 * pageKey غير "global" يعني حصر النطاق في [data-page="pageKey"].
 */
export function validateCustomCss(rawCss: string, pageKey = "global"): CssValidation {
  const warnings: string[] = [];
  const blocked: string[] = [];
  const raw = String(rawCss ?? "");
  const size = new TextEncoder().encode(raw).length;

  if (size > MAX_CSS_BYTES) {
    blocked.push(`حجم CSS ${(size / 1024).toFixed(0)} كيلوبايت يتجاوز الحد المسموح (100 كيلوبايت).`);
    return { valid: false, warnings, blocked_rules: blocked, normalized_css: "", size_bytes: size };
  }

  let css = stripComments(raw);

  // 1) أنماط خطيرة عامة
  if (/javascript\s*:/i.test(css)) blocked.push("استخدام javascript: غير مسموح.");
  if (/expression\s*\(/i.test(css)) blocked.push("استخدام expression() غير مسموح.");
  if (/behavior\s*:|-moz-binding/i.test(css)) blocked.push("استخدام behavior/-moz-binding غير مسموح.");
  if (/<\s*\/?\s*(script|style|iframe)/i.test(css)) blocked.push("وسوم HTML غير مسموحة داخل CSS.");

  // 2) روابط data المصرح بها فقط (صور)
  for (const m of css.matchAll(/url\(\s*['"]?data:([^;,'")]+)/gi)) {
    const mime = (m[1] ?? "").toLowerCase();
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(mime)) {
      blocked.push(`رابط data غير مصرح به: ${mime || "غير معروف"}`);
    }
  }

  // 3) @import من نطاقات موثوقة فقط
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/gi)) {
    const href = m[1] ?? "";
    let host = "";
    try {
      host = new URL(href, "https://mehlalex.com").hostname;
    } catch {
      host = "";
    }
    if (!TRUSTED_IMPORT_HOSTS.includes(host)) {
      blocked.push(`@import من نطاق غير موثوق: ${host || href}`);
    }
  }

  // 4) CSS يستهدف إطارات مدمجة أو صفحات خارجية
  if (/\biframe\b/i.test(css)) blocked.push("لا يُسمح بقواعد تستهدف iframe.");

  const rules = collectRules(css).filter((b) => b.body !== "\u0000statement");

  for (const rule of rules) {
    const sel = rule.selector;
    const body = rule.body;
    const decl = `${sel}{${body.trim().slice(0, 120)}}`;

    // 5) إخفاء عناصر الأمان أو الرسائل الحرجة
    if (PROTECTED_PATTERNS.some((p) => p.test(sel)) && HIDING_DECL.test(body)) {
      blocked.push(`محاولة إخفاء عنصر أمان أو رسالة حرجة: ${decl}`);
    }

    // 6) pointer-events على كامل الشاشة
    if (/pointer-events\s*:\s*none/i.test(body) && /^(\*|html|body|:root)\b/i.test(sel.trim())) {
      blocked.push(`تعطيل التفاعل على كامل الشاشة غير مسموح: ${decl}`);
    }

    // 7) z-index مفرط / طبقة فوق الشاشة
    const z = body.match(/z-index\s*:\s*(\d{3,})/i);
    if (z && Number(z[1]) > 9999) {
      blocked.push(`z-index مفرط (${z[1]}) قد يغطي كامل الشاشة: ${decl}`);
    }
    if (/position\s*:\s*fixed/i.test(body) && /(inset\s*:\s*0|(top|left|right|bottom)\s*:\s*0)/i.test(body) && /^(\*|html|body|:root)\b/i.test(sel.trim())) {
      blocked.push(`طبقة ثابتة تغطي كامل الشاشة غير مسموحة: ${decl}`);
    }

    // 8) selectors عامة خطرة
    if (/^\*(\s*,|\s*$)/.test(sel.trim()) && HIDING_DECL.test(body)) {
      blocked.push(`إخفاء عام بـ * غير مسموح: ${decl}`);
    }
    if (/^\*/.test(sel.trim())) {
      warnings.push(`selector عام (${sel.trim().slice(0, 40)}) قد يؤثر على كل العناصر.`);
    }
    if (/!important/i.test(body)) {
      warnings.push(`استخدام !important في: ${sel.trim().slice(0, 40)}`);
    }
    if (HIDING_DECL.test(body) && /^(html|body|:root)\b/i.test(sel.trim())) {
      blocked.push(`إخفاء الصفحة بالكامل غير مسموح: ${decl}`);
    }
  }

  // 9) تحقق بنيوي بسيط: توازن الأقواس
  const open = (css.match(/{/g) ?? []).length;
  const close = (css.match(/}/g) ?? []).length;
  if (open !== close) {
    blocked.push("CSS غير صالح: عدد الأقواس غير متوازن.");
  }
  if (open > 0 && rules.length === 0) {
    warnings.push("لم يُعثر على قواعد صالحة داخل CSS.");
  }

  const valid = blocked.length === 0;
  let normalized = "";
  if (valid) {
    const cleaned = minify(css);
    normalized = pageKey === "global" ? cleaned : scopeCss(cleaned, `[data-page="${pageKey}"]`);
  }

  return { valid, warnings, blocked_rules: blocked, normalized_css: normalized, size_bytes: size };
}