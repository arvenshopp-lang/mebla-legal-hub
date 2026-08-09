/**
 * PLAN 3 — مولّد جرد لوحة الإدارة (/mehla-admin).
 * يقرأ ملفات المسارات فعلياً ويستخرج: الأزرار، النماذج، النوافذ، الفلاتر،
 * الترقيم، التصدير، الإجراءات الخطرة، ودوال الخادم المستوردة لكل مسار.
 *
 *   bun scripts/e2e/plan3-inventory.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "src/routes/mehla-admin";
const files: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
})(ROOT);

const DANGEROUS =
  /delete|remove|suspend|revoke|terminate|deadLetter|rollback|cancel|retire|disqualify|purge/i;

type Entry = {
  route: string;
  file: string;
  buttons: number;
  modals: number;
  forms: number;
  handlers: number;
  hasSearch: boolean;
  hasFilter: boolean;
  hasPagination: boolean;
  hasExport: boolean;
  tabs: number;
  serverFns: string[];
  dangerous: string[];
  dead: string[];
};

const rows: Entry[] = [];
for (const file of files.sort()) {
  const src = readFileSync(file, "utf8");
  const count = (re: RegExp) => (src.match(re) ?? []).length;
  const imported = new Set<string>();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"@\/lib\/([^"]+)"/g)) {
    const mod = m[2]!;
    if (!/functions/.test(mod)) continue;
    for (const name of m[1]!.split(",")) {
      const n = name.trim().split(/\s+as\s+/)[0]!.trim();
      if (n && /^[a-z]/.test(n)) imported.add(n);
    }
  }
  const dead: string[] = [];
  if (/href="#"/.test(src)) dead.push('href="#"');
  if (/onClick=\{\(\)\s*=>\s*\{\s*\}\s*\}/.test(src)) dead.push("empty onClick");
  if (/TODO|coming soon|قريبا/i.test(src)) dead.push("TODO/coming-soon");
  const routePath =
    "/" +
    relative("src/routes", file)
      .replace(/\.tsx$/, "")
      .replace(/\/index$/, "")
      .replace(/\$/g, ":");
  rows.push({
    route: /\/route$/.test(routePath) ? routePath.replace(/\/route$/, " (layout)") : routePath,
    file,
    buttons: count(/<Btn\b/g) + count(/<Button\b/g),
    modals: count(/<Modal\b/g) + count(/<Dialog\b/g) + count(/<Sheet\b/g),
    forms: count(/<form\b/g) + count(/<FormField\b/g),
    handlers: count(/onClick=/g) + count(/onSubmit=/g),
    hasSearch: /search|بحث/i.test(src),
    hasFilter: /filter|Select\b|فلتر/i.test(src),
    hasPagination: /<Pagination|page(Size)?\b/.test(src),
    hasExport: /export(Csv|AuditLogs|Crm|Hr|Marketing|SupportTickets)|CSV|تصدير/i.test(src),
    tabs: count(/<Tab\b|TabsTrigger/g),
    serverFns: [...imported].sort(),
    dangerous: [...imported].filter((n) => DANGEROUS.test(n)).sort(),
    dead,
  });
}

const totalActions = rows.reduce((a, r) => a + r.handlers, 0);
const totalFns = new Set(rows.flatMap((r) => r.serverFns)).size;
const lines: string[] = [];
lines.push("# PLAN 3 — جرد لوحة إدارة مِهلة (/mehla-admin)", "");
lines.push(`- إجمالي المسارات: **${rows.length}**`);
lines.push(`- إجمالي عناصر الإجراء التفاعلية (onClick/onSubmit): **${totalActions}**`);
lines.push(`- إجمالي دوال الخادم المستخدمة من الواجهة: **${totalFns}**`);
lines.push(
  `- عناصر تحكم ميتة مكتشَفة: **${rows.reduce((a, r) => a + r.dead.length, 0)}**`,
  "",
  "| المسار | أزرار | نوافذ | حقول | معالجات | تبويبات | بحث | فلترة | ترقيم | تصدير | دوال خادم | إجراءات خطرة | ميتة |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
);
const yn = (b: boolean) => (b ? "✔" : "—");
for (const r of rows)
  lines.push(
    `| \`${r.route}\` | ${r.buttons} | ${r.modals} | ${r.forms} | ${r.handlers} | ${r.tabs} | ${yn(r.hasSearch)} | ${yn(r.hasFilter)} | ${yn(r.hasPagination)} | ${yn(r.hasExport)} | ${r.serverFns.length} | ${r.dangerous.length} | ${r.dead.join(", ") || "—"} |`,
  );
lines.push("", "## دوال الخادم لكل مسار", "");
for (const r of rows) {
  if (!r.serverFns.length) continue;
  lines.push(`### \`${r.route}\``, "", r.serverFns.map((f) => `\`${f}\``).join(" · "), "");
}
writeFileSync("docs/qa/plan3-admin-inventory.md", lines.join("\n"));
writeFileSync(
  "/tmp/browser/plan3/inventory.json",
  JSON.stringify({ rows, totalActions, totalFns }, null, 2),
);
console.log(
  `مسارات=${rows.length} إجراءات=${totalActions} دوال=${totalFns} ميتة=${rows.reduce((a, r) => a + r.dead.length, 0)}`,
);
