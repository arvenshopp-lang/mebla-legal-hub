/**
 * حرّاس الأمان الآليون — طبقة الكود (مِهلة)
 *
 * التشغيل: bun run security:check
 * يفشل (exit 1) عند:
 *  1. وجود سرّ/مفتاح حقيقي مكتوب داخل الكود.
 *  2. تسجيل أسرار في السجلات (console.* لمتغيّرات بيئة حسّاسة).
 *  3. تعريض سرّ للمتصفح عبر متغيّر VITE_*.
 *  4. نقص توثيق أي دالة من دوال authenticated المسموح بها في docs/security-guardrails.md.
 *
 * فحوص قاعدة البيانات (SECURITY DEFINER / RLS / RPC) في scripts/security-guardrails.sql
 * ويجب تنفيذها على القاعدة قبل كل إصدار.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts", "supabase"];
const SCAN_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".json", ".toml", ".css"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".output", ".nitro"]);

/** الدوال المسموح استدعاؤها من authenticated — مطابقة لقائمة SQL والوثيقة. */
const ALLOWED_AUTHENTICATED_RPC = [
  "admin_platform_metrics",
  "billing_match_reconciliation",
  "billing_reopen_period",
  "billing_reports",
  "billing_save_draft",
  "consume_ocr_pages",
  "create_organization_with_owner",
  "my_case_party_permissions",
  "my_subscription_overview",
  "print_copy_number",
  "record_metered_usage",
] as const;

const SECRET_PATTERNS: { id: string; label: string; re: RegExp }[] = [
  { id: "supabase_secret_key", label: "مفتاح Supabase سرّي", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  {
    id: "service_role_jwt",
    label: "رمز JWT لدور الخدمة",
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  },
  { id: "private_key_block", label: "مفتاح خاص PEM", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "openai_key", label: "مفتاح OpenAI", re: /\bsk-[A-Za-z0-9]{24,}/ },
  { id: "aws_access_key", label: "مفتاح AWS", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "sendgrid_key", label: "مفتاح SendGrid", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/ },
  { id: "resend_key", label: "مفتاح Resend", re: /\bre_[A-Za-z0-9]{24,}\b/ },
  { id: "twilio_secret", label: "مفتاح Twilio السرّي", re: /\bSK[0-9a-fA-F]{32}\b/ },
];

const SENSITIVE_ENV = /SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY|TOKEN/i;

type Violation = { check: string; file: string; line: number; detail: string };
const violations: Violation[] = [];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXT.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

function scanFile(file: string): void {
  const rel = relative(ROOT, file);
  const isGuardrailFile = rel.replace(/\\/g, "/").startsWith("scripts/security-guardrails");
  const lines = readFileSync(file, "utf8").split("\n");

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const lineNo = index + 1;
    if (line.startsWith("*") || line.startsWith("//") || line.startsWith("--")) return;

    if (!isGuardrailFile) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.re.test(raw)) {
          violations.push({
            check: `hardcoded_secret:${pattern.id}`,
            file: rel,
            line: lineNo,
            detail: `${pattern.label} مكتوب داخل الكود`,
          });
        }
      }
    }

    if (/console\.(log|info|warn|error|debug|table)\s*\(/.test(raw)) {
      const envRefs = raw.match(/process\.env\[['"][A-Z0-9_]+['"]\]|process\.env\.[A-Z0-9_]+/g) ?? [];
      for (const ref of envRefs) {
        if (SENSITIVE_ENV.test(ref)) {
          violations.push({
            check: "secret_in_logs",
            file: rel,
            line: lineNo,
            detail: `تسجيل متغيّر بيئة حسّاس في السجلات (${ref})`,
          });
        }
      }
    }

    for (const ref of raw.match(/VITE_[A-Z0-9_]+/g) ?? []) {
      if (/SECRET|SERVICE_ROLE|PRIVATE/.test(ref)) {
        violations.push({
          check: "secret_exposed_to_browser",
          file: rel,
          line: lineNo,
          detail: `متغيّر VITE_ يحمل سرّاً ويُحزَم في حِزمة المتصفح (${ref})`,
        });
      }
    }
  });
}

function checkRpcDocumentation(): void {
  const docPath = join(ROOT, "docs/security-guardrails.md");
  let doc: string;
  try {
    doc = readFileSync(docPath, "utf8");
  } catch {
    violations.push({
      check: "rpc_allowlist_doc_missing",
      file: "docs/security-guardrails.md",
      line: 0,
      detail: "وثيقة قائمة الدوال المسموح بها غير موجودة",
    });
    return;
  }

  const rows = doc.split("\n").filter((l) => l.trim().startsWith("|"));
  for (const fn of ALLOWED_AUTHENTICATED_RPC) {
    const row = rows.find((l) => l.includes("`" + fn + "`"));
    if (!row) {
      violations.push({
        check: "rpc_undocumented",
        file: "docs/security-guardrails.md",
        line: 0,
        detail: `الدالة ${fn} مسموح استدعاؤها من authenticated وغير موثّقة`,
      });
      continue;
    }
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || cells.some((c) => c.length === 0 || c === "—")) {
      violations.push({
        check: "rpc_documentation_incomplete",
        file: "docs/security-guardrails.md",
        line: 0,
        detail: `توثيق الدالة ${fn} ناقص: يجب الغرض وفحص الهوية وفحص الصلاحية والجداول وسبب السماح`,
      });
    }
  }
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) scanFile(file);
}
checkRpcDocumentation();

if (violations.length === 0) {
  console.log("✅ حرّاس الأمان (طبقة الكود): لا مخالفات.");
  console.log("ℹ️  نفّذ scripts/security-guardrails.sql على القاعدة لإكمال فحوص RLS و SECURITY DEFINER.");
  process.exit(0);
}

console.error(`❌ حرّاس الأمان: ${violations.length} مخالفة\n`);
for (const v of violations) {
  console.error(`  [${v.check}] ${v.file}${v.line ? `:${v.line}` : ""} — ${v.detail}`);
}
process.exit(1);
