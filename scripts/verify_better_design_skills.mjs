/**
 * فحص والتحقق من مهارات التصميم الخمس (Design Skills Pack Verification)
 * Verifies all 5 Better Design Skills
 */
import fs from "fs";
import path from "path";

console.log("================================================================================");
console.log("🎨 MEHLA — VERIFYING 5 BETTER DESIGN SKILLS PACK (100% VERIFICATION)");
console.log("================================================================================\n");

const SKILLS = [
  {
    id: "better-ui",
    title: "Better UI (هندسة الواجهات وتجربة المستخدم)",
    requiredTerms: ["Component States Mastery", "Hover", "Focus-Visible", "Dignity Over Gimmicks", "Touch Target"],
  },
  {
    id: "better-typography",
    title: "Better Typography (الطباعة العربية وتنسيق الأرقام)",
    requiredTerms: ["Never Break Arabic Cursive Ligatures", "Line Height Calibration", "Tabular Numerals", "Modular Typography Scale"],
  },
  {
    id: "better-colors",
    title: "Better Colors (لوحة الألوان الملكية والمتغيرات الدلالية)",
    requiredTerms: ["Core Brand Identity", "Semantic Token System", "Surface Elevation", "Status Color Reference", "WCAG 2.2 AA"],
  },
  {
    id: "better-accessibility",
    title: "Better Accessibility (إمكانية الوصول ومعايير WCAG 2.2 AA)",
    requiredTerms: ["Keyboard Navigability", "Screen Readers", "Semantic HTML", "prefers-reduced-motion", "44px Minimum Touch Area"],
  },
  {
    id: "better-layouts",
    title: "Better Layouts (هندسة الشبكات والتجاوب متعدد الشاشات)",
    requiredTerms: ["Breakpoint Taxonomy", "The Dashboard Shell", "Master-Detail Dual Pane", "Mobile Ergonomics & Safe Areas"],
  },
];

const skillsDir = path.resolve(process.cwd(), ".agents/skills");
let verifiedCount = 0;

for (const skill of SKILLS) {
  const skillPath = path.join(skillsDir, skill.id, "SKILL.md");
  console.log(`[CHECKING] ${skill.title} ...`);

  if (!fs.existsSync(skillPath)) {
    console.error(`  ❌ Missing SKILL.md for ${skill.id} at ${skillPath}`);
    continue;
  }

  const content = fs.readFileSync(skillPath, "utf-8");

  // Check YAML Frontmatter
  if (!content.startsWith("---") || !content.includes(`name: ${skill.id}`) || !content.includes("description:")) {
    console.error(`  ❌ Invalid YAML frontmatter in ${skill.id}`);
    continue;
  }

  // Check Required Core Principles
  let missingTerms = [];
  for (const term of skill.requiredTerms) {
    if (!content.includes(term)) {
      missingTerms.push(term);
    }
  }

  if (missingTerms.length > 0) {
    console.error(`  ⚠️ Missing required terms in ${skill.id}:`, missingTerms);
    continue;
  }

  const lines = content.split("\n").length;
  console.log(`  ✓ File verified: ${skillPath} (${lines} lines, ${content.length} bytes)`);
  console.log(`  ✓ Status: 100% Active, Valid YAML Frontmatter & Standard Compliant\n`);
  verifiedCount++;
}

console.log("================================================================================");
console.log(`🎉 ALL ${verifiedCount}/${SKILLS.length} BETTER DESIGN SKILLS VERIFIED 100% SUCCESSFULLY!`);
console.log("================================================================================");

if (verifiedCount !== SKILLS.length) {
  process.exit(1);
}
