import fs from "fs";
import path from "path";

console.log("=================================================");
console.log("=== التحقق الشامل من منظومة وروابط البريد الإلكتروني ===");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

// 1. فحص ملف email-worker.server.ts
const workerFile = path.resolve("src/lib/notifications/email-worker.server.ts");
const workerContent = fs.readFileSync(workerFile, "utf-8");

assert(
  !workerContent.includes("https://app.mehlalex.com"),
  "email-worker.server.ts does NOT contain broken https://app.mehlalex.com",
);
assert(
  workerContent.includes("const APP_ORIGIN = SITE_URL;"),
  "email-worker.server.ts uses canonical SITE_URL (https://mehlalex.com)",
);

// 2. فحص ملف admin-guard.server.ts
const adminGuardFile = path.resolve("src/lib/admin-guard.server.ts");
const adminGuardContent = fs.readFileSync(adminGuardFile, "utf-8");

assert(
  !adminGuardContent.includes("https://app.mehlalex.com"),
  "admin-guard.server.ts does NOT contain broken https://app.mehlalex.com fallback",
);
assert(
  adminGuardContent.includes("https://mehlalex.com${path}"),
  "admin-guard.server.ts correctly falls back to https://mehlalex.com${path}",
);

// 3. فحص جميع قوالب البريد في src/lib/email-templates/
const templatesDir = path.resolve("src/lib/email-templates");
const templateFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

for (const file of templateFiles) {
  const content = fs.readFileSync(path.join(templatesDir, file), "utf-8");
  assert(
    !content.includes("app.mehlalex.com"),
    `Template ${file} does NOT reference broken app.mehlalex.com`,
  );
}

// 4. فحص جميع ملفات البريد في src/lib/email/
const emailDir = path.resolve("src/lib/email");
const emailFiles = fs.readdirSync(emailDir).filter((f) => f.endsWith(".ts"));

for (const file of emailFiles) {
  const content = fs.readFileSync(path.join(emailDir, file), "utf-8");
  assert(
    !content.includes("app.mehlalex.com"),
    `Email core ${file} does NOT reference broken app.mehlalex.com`,
  );
}

// 5. فحص جميع ملفات التنبيهات في src/lib/notifications/
const notifDir = path.resolve("src/lib/notifications");
const notifFiles = fs.readdirSync(notifDir).filter((f) => f.endsWith(".ts"));

for (const file of notifFiles) {
  const content = fs.readFileSync(path.join(notifDir, file), "utf-8");
  assert(
    !content.includes("app.mehlalex.com"),
    `Notification module ${file} does NOT reference broken app.mehlalex.com`,
  );
}

console.log("\n=================================================");
console.log(`إجمالي الفحوصات: ${passed + failed} | النجاح: ${passed} | الفشل: ${failed}`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
