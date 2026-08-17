import fs from "fs";
import path from "path";

const SKILLS_DIR = path.resolve(".agents/skills");

const REQUIRED_SKILLS = [
  "mehla-secure-development",
  "mehla-threat-modeling",
  "mehla-multitenant-security",
  "mehla-supabase-security",
  "mehla-api-security",
  "mehla-auth-identity-security",
  "mehla-file-document-security",
  "mehla-oauth-integration-security",
  "mehla-webhook-security",
  "mehla-secrets-security",
  "mehla-dependency-supply-chain-security",
  "mehla-code-security-review",
  "mehla-frontend-security",
  "mehla-admin-security",
  "mehla-ai-security",
  "mehla-legal-ai-security",
  "mehla-logging-audit-security",
  "mehla-security-testing",
  "mehla-security-release-gate",
  "mehla-incident-response",
  "mehla-saudi-security-compliance",
  "mehla-zero-trust-security",
  "mehla-security-architecture-review",
  "mehla-cryptography-review",
  "mehla-security-master-audit",
];

const MANDATORY_SECTIONS = [
  "Purpose",
  "When To Use",
  "Output Format",
  "Standards Baseline",
];

async function verifySkillsPack() {
  console.log("================================================================================");
  console.log("🛡️ MEHLA CYBERSECURITY SKILLS PACK — SELF-VALIDATION & VERIFICATION");
  console.log("================================================================================\n");

  let passedCount = 0;
  const errors = [];

  for (const skillName of REQUIRED_SKILLS) {
    const skillPath = path.join(SKILLS_DIR, skillName, "SKILL.md");

    if (!fs.existsSync(skillPath)) {
      errors.push(`Missing SKILL.md for: ${skillName}`);
      continue;
    }

    const content = fs.readFileSync(skillPath, "utf-8");

    // 1. Check YAML Frontmatter
    if (!content.startsWith("---") || !content.includes(`name: "${skillName}"`)) {
      errors.push(`Invalid frontmatter in ${skillName}`);
      continue;
    }

    // 2. Check Mandatory Sections
    let missingSection = false;
    for (const section of MANDATORY_SECTIONS) {
      if (!content.includes(section)) {
        errors.push(`Missing section '${section}' in ${skillName}`);
        missingSection = true;
      }
    }

    if (!missingSection) {
      console.log(`  ✓ Skill [${skillName}] verified: valid frontmatter, all required sections present.`);
      passedCount++;
    }
  }

  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`Summary: ${passedCount} / ${REQUIRED_SKILLS.length} MEHLA Security Skills Validated Successfully!`);
  console.log(`--------------------------------------------------------------------------------\n`);

  if (errors.length > 0) {
    console.error("Errors found:", errors);
    process.exit(1);
  } else {
    console.log("🎉 ALL 25 MEHLA CYBERSECURITY SKILLS ARE 100% COMPLIANT & READY FOR USE!");
  }
}

verifySkillsPack();
