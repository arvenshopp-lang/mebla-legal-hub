import fs from "fs";
import path from "path";

const projectRoot = process.cwd();

function walkDir(dir, filter = () => true) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === "node_modules" || file === ".git" || file === ".output" || file === "dist") continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, filter));
    } else if (filter(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

const allMigrations = walkDir("supabase/migrations", (f) => f.endsWith(".sql"));
const allLibFiles = walkDir("src/lib", (f) => f.endsWith(".ts") || f.endsWith(".tsx"));
const allRoutes = walkDir("src/routes", (f) => f.endsWith(".tsx") || f.endsWith(".ts"));

// 1. Find the 1 table missing explicit RLS
const tableCreations = new Map();
const tablesWithRls = new Set();
const tableCreateRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
const rlsEnableRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

for (const migPath of allMigrations) {
  const content = fs.readFileSync(migPath, "utf-8");
  let match;
  while ((match = tableCreateRegex.exec(content)) !== null) {
    tableCreations.set(match[1].toLowerCase(), path.basename(migPath));
  }
  while ((match = rlsEnableRegex.exec(content)) !== null) {
    tablesWithRls.add(match[1].toLowerCase());
  }
}

const missingRlsTables = [];
for (const [table, mig] of tableCreations.entries()) {
  if (!tablesWithRls.has(table)) {
    missingRlsTables.push({ table, migration: mig });
  }
}

// 2. Permissive Policies Details
const permissivePolicies = [];
const permissivePolicyRegex = /CREATE\s+POLICY\s+["']?([^"'\s]+)["']?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)[\s\S]*?(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)/gi;
for (const migPath of allMigrations) {
  const content = fs.readFileSync(migPath, "utf-8");
  let match;
  while ((match = permissivePolicyRegex.exec(content)) !== null) {
    permissivePolicies.push({
      migration: path.basename(migPath),
      policy: match[1],
      table: match[2],
    });
  }
}

// 3. Secrets & Client Bundle Scan Details
const secretFindings = [];
for (const file of [...allLibFiles, ...allRoutes]) {
  const content = fs.readFileSync(file, "utf-8");
  const viteLeakRegex = /VITE_[A-Z0-9_]*(?:SECRET|KEY|PASSWORD|SERVICE_ROLE|TOKEN)[A-Z0-9_]*/gi;
  let match;
  while ((match = viteLeakRegex.exec(content)) !== null) {
    secretFindings.push({
      file: path.relative(projectRoot, file),
      match: match[0],
    });
  }
}

console.log("=== MISSING RLS TABLES ===");
console.log(JSON.stringify(missingRlsTables, null, 2));

console.log("\n=== PERMISSIVE POLICIES (USING true) ===");
console.log(JSON.stringify(permissivePolicies, null, 2));

console.log("\n=== VITE_ MATCHES IN CLIENT/SHARED CODE ===");
console.log(JSON.stringify(secretFindings, null, 2));
