/**
 * حرّاس بوابة E2E الوقائية — بلا شبكة، بلا قاعدة بيانات، بلا بيانات.
 *
 *   bun scripts/e2e-gate-guardrails.ts
 *
 * يثبت أن أي تشغيل E2E تدميري يُرفض إلا عند تحقق الحارسين معاً:
 * أصل تطبيق محلي/معاينة + خادم خلفي ليس قاعدة التشغيل الفعلية.
 */
import { readFileSync } from "node:fs";
import { evaluateE2eGate } from "./e2e/qa-support";

let pass = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

/** مرجع مشروع الإنتاج من إعداد التطبيق العام (بدون طبع أي قيمة). */
function prodRef(): string {
  const env = readFileSync(".env", "utf8");
  const m = env.match(/^\s*VITE_SUPABASE_PROJECT_ID\s*=\s*(.+?)\s*$/m);
  return (m?.[1] ?? "").replace(/^["']|["']$/g, "");
}

const PROD = prodRef();
check("مرجع مشروع الإنتاج متاح للمقارنة من إعداد التطبيق", PROD.length > 0);

const QA_REF = "qaprojectrefonlyfortests";
const base = { MEHLA_E2E_ALLOW: "1" } as Record<string, string | undefined>;

const cases: { name: string; env: Record<string, string | undefined>; allowed: boolean }[] = [
  {
    name: "معاينة + خادم إنتاج ⇒ مرفوض",
    env: { ...base, APP_ORIGIN: "https://id-preview--abc.lovable.app", SUPABASE_PROJECT_ID: PROD },
    allowed: false,
  },
  {
    name: "محلي + خادم إنتاج ⇒ مرفوض",
    env: { ...base, APP_ORIGIN: "http://localhost:8080", SUPABASE_PROJECT_ID: PROD },
    allowed: false,
  },
  {
    name: "محلي + رابط خادم إنتاج ⇒ مرفوض",
    env: {
      ...base,
      APP_ORIGIN: "http://localhost:8080",
      SUPABASE_URL: `https://${PROD}.supabase.co`,
    },
    allowed: false,
  },
  {
    name: "نطاق إنتاج التطبيق + خادم QA ⇒ مرفوض",
    env: { ...base, APP_ORIGIN: "https://mehlalex.com", SUPABASE_PROJECT_ID: QA_REF },
    allowed: false,
  },
  {
    name: "www لنطاق الإنتاج مرفوض",
    env: { ...base, APP_ORIGIN: "https://www.mehlalex.com", SUPABASE_PROJECT_ID: QA_REF },
    allowed: false,
  },
  {
    name: "النطاق المنشور mebla.lovable.app مرفوض",
    env: { ...base, APP_ORIGIN: "https://mebla.lovable.app", SUPABASE_PROJECT_ID: QA_REF },
    allowed: false,
  },
  {
    name: "أصل غير محلي وغير معاينة مرفوض",
    env: { ...base, APP_ORIGIN: "https://example.com", SUPABASE_PROJECT_ID: QA_REF },
    allowed: false,
  },
  {
    name: "بلا موافقة صريحة مرفوض",
    env: { APP_ORIGIN: "http://localhost:8080", SUPABASE_PROJECT_ID: QA_REF },
    allowed: false,
  },
  {
    name: "بلا مشروع خادم مستهدف مرفوض",
    env: { ...base, APP_ORIGIN: "http://localhost:8080" },
    allowed: false,
  },
  {
    name: "APP_ORIGIN غير صالح مرفوض",
    env: { ...base, APP_ORIGIN: "not-a-url", SUPABASE_PROJECT_ID: QA_REF },
    allowed: false,
  },
  {
    name: "محلي + خادم QA ⇒ مسموح",
    env: { ...base, APP_ORIGIN: "http://localhost:8080", SUPABASE_PROJECT_ID: QA_REF },
    allowed: true,
  },
  {
    name: "معاينة -dev + خادم QA ⇒ مسموح",
    env: { ...base, APP_ORIGIN: "https://project--x-dev.lovable.app", SUPABASE_PROJECT_ID: QA_REF },
    allowed: true,
  },
];

for (const c of cases) {
  const res = evaluateE2eGate(c.env);
  check(c.name, res.allowed === c.allowed, res.allowed ? "allowed" : res.reasons.join(" | "));
  check(
    `${c.name} — الرسالة بلا أسرار`,
    res.reasons.every(
      (r) => !r.includes("://") && !r.includes(PROD) && !r.includes(QA_REF) && !/[A-Za-z]{20,}/.test(r),
    ),
    res.reasons.join(" | "),
  );
}

check(
  "الرفض يذكر سبباً واحداً على الأقل",
  evaluateE2eGate({ ...base, APP_ORIGIN: "https://mehlalex.com" }).reasons.length > 0,
);
check(
  "غياب مرجع الإنتاج للمقارنة يؤدي للرفض",
  (() => {
    const cwd = process.cwd();
    process.chdir("/tmp");
    const res = evaluateE2eGate({
      ...base,
      APP_ORIGIN: "http://localhost:8080",
      SUPABASE_PROJECT_ID: QA_REF,
    });
    process.chdir(cwd);
    return !res.allowed;
  })(),
);

/* ------------------------- حرّاس ثابتة على المصدر ------------------------- */

const support = readFileSync("scripts/e2e/qa-support.ts", "utf8");
for (const fn of ["adminFetch", "signIn", "asUser"]) {
  const body = support.slice(support.indexOf(`export ${fn.startsWith("a") && fn !== "asUser" ? "function " + fn : ""}`));
  check(
    `${fn} يستدعي البوابة قبل أي fetch`,
    new RegExp(`${fn}\\([\\s\\S]{0,220}?assertE2eEnvironmentSafe\\(\\);[\\s\\S]{0,120}?fetch\\(`).test(support),
    "",
  );
  void body;
}
check("البوابة تنهي العملية برمز 2 عند الرفض", /process\.exit\(2\)/.test(support));
check(
  "البوابة لا تطبع أي URL أو مفتاح",
  !/console\.(error|log)\([^)]*(SUPABASE_URL|SERVICE_KEY|PUBLISHABLE|APP)\b/.test(support),
);
check("لا مرجع مشروع مكتوب في مصدر البوابة", !/[a-z]{20}\.supabase\.co/.test(support));
check(
  "مراجع الإنتاج تُقرأ من إعداد التطبيق لا من ثوابت المصدر",
  support.includes("VITE_SUPABASE_PROJECT_ID") && support.includes("MEHLA_PROD_PROJECT_REF"),
);

const destructive = [
  "scripts/e2e/org-qa-fixture.ts",
  "scripts/e2e/qa-volume-fixture.ts",
  "scripts/e2e/plan2-fixture.ts",
  "scripts/e2e/plan3-fixture.ts",
  "scripts/e2e/destructive-actions.e2e.ts",
  "scripts/e2e/documents_security.e2e.ts",
];
for (const file of destructive) {
  const src = readFileSync(file, "utf8");
  check(`${file} يستورد البوابة`, src.includes("assertE2eEnvironmentSafe,"));
  check(`${file} ينادي البوابة عند التشغيل`, /assertE2eEnvironmentSafe\(\);/.test(src));
}
const fixture = readFileSync("scripts/e2e/org-qa-fixture.ts", "utf8");
check(
  "fixture ينادي البوابة قبل setup/cleanup",
  fixture.indexOf("assertE2eEnvironmentSafe();") < fixture.indexOf("await cleanup();\nelse await setup();"),
);
check(
  "documents_security لم يبقِ بوابة محلية مكررة للأصل",
  !fixture.includes("mehlalex") &&
    !readFileSync("scripts/e2e/documents_security.e2e.ts", "utf8").includes("mehlalex"),
);

console.log(`\nPASS = ${pass} | FAIL = ${failures.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
