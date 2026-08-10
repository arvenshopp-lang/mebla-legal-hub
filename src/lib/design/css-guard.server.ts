/**
 * الفحص الخادمي الكامل لـ CSS المخصص — تحليل AST حقيقي بـ postcss فوق الفحص النصي.
 * لا يُخفّف أي قاعدة موجودة: يضيف كشف أخطاء الصياغة برقم السطر والعمود،
 * ويعيد فحوصات مستوى القاعدة على شجرة حقيقية بدل نص، مع أرقام أسطر عربية.
 */
import postcss, { type ChildNode, type Container } from "postcss";
import {
  checkRules,
  validateCustomCss,
  type CheckedRule,
  type CssValidation,
} from "./css-guard";

const NESTING_AT_RULES = new Set(["media", "supports", "container", "layer"]);
const ALLOWED_AT_RULES = new Set([...NESTING_AT_RULES, "keyframes", "font-face", "property"]);

function declBody(node: Container<ChildNode>): string {
  const parts: string[] = [];
  for (const child of node.nodes ?? []) {
    if (child.type === "decl") {
      parts.push(`${child.prop}:${child.value}${child.important ? " !important" : ""}`);
    }
  }
  return parts.join(";");
}

/** يجمع القواعد من الشجرة مع رقم السطر الحقيقي لكل قاعدة. */
function collectAstRules(root: Container<ChildNode>, acc: CheckedRule[] = []): CheckedRule[] {
  for (const node of root.nodes ?? []) {
    if (node.type === "rule") {
      acc.push({
        selector: node.selector,
        body: declBody(node),
        line: node.source?.start?.line,
      });
      collectAstRules(node, acc);
    } else if (node.type === "atrule") {
      if (NESTING_AT_RULES.has(node.name.toLowerCase())) collectAstRules(node, acc);
    }
  }
  return acc;
}

/**
 * الفحص المعتمد قبل أي حفظ أو نشر.
 * يعيد نفس شكل `CssValidation` مع أخطاء صياغة وأرقام أسطر.
 */
export function validateCustomCssServer(rawCss: string, pageKey = "global"): CssValidation {
  const base = validateCustomCss(rawCss, pageKey);
  const raw = String(rawCss ?? "");
  if (!raw.trim()) return base;

  let root: postcss.Root;
  try {
    root = postcss.parse(raw, { from: undefined });
  } catch (error) {
    const e = error as { reason?: string; message?: string; line?: number; column?: number };
    const line = e.line ?? 0;
    const column = e.column ?? 0;
    return {
      valid: false,
      warnings: base.warnings,
      blocked_rules: [
        `خطأ صياغة في CSS عند السطر ${line} والعمود ${column}: ${e.reason ?? e.message ?? "قاعدة غير مكتملة"}`,
      ],
      normalized_css: "",
      size_bytes: base.size_bytes,
      syntax_error: { message: e.reason ?? e.message ?? "قاعدة غير مكتملة", line, column },
    };
  }

  /** مفتاح مقارنة يتجاهل بادئة رقم السطر والمسافات حتى لا تتكرر الرسالة نفسها. */
  const norm = (message: string) => message.replace(/^سطر \d+:\s*/, "").replace(/\s+/g, "");
  const blocked = [...base.blocked_rules];
  const warnings = [...base.warnings];

  // at-rules غير المعتمدة تُرفض صراحة برقم سطرها
  root.walkAtRules((at) => {
    const name = at.name.toLowerCase();
    if (!ALLOWED_AT_RULES.has(name)) {
      blocked.push(`سطر ${at.source?.start?.line ?? 0}: قاعدة @${name} غير مسموحة.`);
      return;
    }
    if (name === "font-face") {
      const src = at.nodes?.find((n) => n.type === "decl" && n.prop.toLowerCase() === "src");
      const value = src && src.type === "decl" ? src.value : "";
      const external = /url\(\s*['"]?(?!\/)(?!data:)/i.test(value);
      if (!value || external) {
        blocked.push(
          `سطر ${at.source?.start?.line ?? 0}: @font-face يجب أن يستخدم خطاً مستضافاً داخلياً بمسار يبدأ بـ /.`,
        );
      }
    }
  });

  // فحوصات AST تحمل رقم السطر، فتحلّ محلّ النتيجة النصية المكافئة لها.
  const astFindings = checkRules(collectAstRules(root), pageKey);
  for (const item of astFindings.blocked) {
    const key = norm(item);
    const index = blocked.findIndex((existing) => norm(existing) === key);
    if (index >= 0) blocked[index] = item;
    else blocked.push(item);
  }
  for (const item of astFindings.warnings) {
    const key = norm(item);
    const index = warnings.findIndex((existing) => norm(existing) === key);
    if (index >= 0) warnings[index] = item;
    else warnings.push(item);
  }

  const valid = blocked.length === 0;
  return {
    valid,
    warnings,
    blocked_rules: blocked,
    normalized_css: valid ? base.normalized_css : "",
    size_bytes: base.size_bytes,
  };
}