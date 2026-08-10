/**
 * حاجز بناء: يتحقق أن أصول الخطوط المستضافة محلياً داخل ميزانية الأداء.
 * التشغيل: bun run fonts:budget
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { FONT_BUDGET, formatBytes, isFontResource } from "../src/lib/perf/font-budget";

const FONT_DIR = join(process.cwd(), "public", "fonts");

async function main(): Promise<number> {
  const names = (await readdir(FONT_DIR)).filter((name) => isFontResource(name)).sort();
  const failures: string[] = [];
  let total = 0;

  for (const name of names) {
    const { size } = await stat(join(FONT_DIR, name));
    total += size;
    const status = size > FONT_BUDGET.maxFileBytes ? "FAIL" : "PASS";
    if (status === "FAIL") {
      failures.push(
        `${name}: ${formatBytes(size)} يتجاوز حد الملف ${formatBytes(FONT_BUDGET.maxFileBytes)}`,
      );
    }
    console.log(`${status}  ${name} — ${formatBytes(size)}`);
  }

  if (total > FONT_BUDGET.maxTotalAssetBytes) {
    failures.push(
      `الإجمالي ${formatBytes(total)} يتجاوز الحد ${formatBytes(FONT_BUDGET.maxTotalAssetBytes)}`,
    );
  }

  console.log(
    `\nالملفات: ${names.length} · الإجمالي: ${formatBytes(total)} / ${formatBytes(
      FONT_BUDGET.maxTotalAssetBytes,
    )}`,
  );

  if (failures.length > 0) {
    console.error("\n❌ تجاوز ميزانية أداء الخطوط:");
    for (const failure of failures) console.error(`  • ${failure}`);
    return 1;
  }
  console.log("✅ ميزانية أداء الخطوط سليمة");
  return 0;
}

main().then((code) => process.exit(code));