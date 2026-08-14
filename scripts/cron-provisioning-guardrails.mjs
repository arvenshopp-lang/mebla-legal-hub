import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const expected = [
  [
    "mehla-cleanup-secure-artifacts",
    "17 * * * *",
    "/api/public/hooks/cleanup-secure-artifacts",
  ],
  ["mehla-email-dispatch", "* * * * *", "/api/public/hooks/email-dispatch"],
  ["mehla-mail-sync", "*/5 * * * *", "/api/public/hooks/mail-sync"],
  [
    "mehla-notifications-dispatch",
    "* * * * *",
    "/api/public/hooks/notifications-dispatch",
  ],
];

let failures = 0;
let passes = 0;
function check(name, condition) {
  if (condition) {
    passes += 1;
    console.log(`PASS  ${name}`);
  }
  else {
    failures += 1;
    console.error(`FAIL  ${name}`);
  }
}

const migrationNames = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const provisioningNames = migrationNames.filter((name) =>
  readFileSync(join(MIGRATIONS, name), "utf8").includes(
    "FUNCTION ops.reconcile_mehla_cron_jobs",
  ),
);

check("one source-controlled provisioning migration", provisioningNames.length === 1);
const sql = provisioningNames.length
  ? readFileSync(join(MIGRATIONS, provisioningNames[0]), "utf8")
  : "";
const calls = [...sql.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\$cron\$([\s\S]*?)\$cron\$\s*\)/gi)].map(
  ([, name, schedule, command]) => ({
    name,
    schedule,
    route: command.match(/(\/api\/public\/hooks\/[a-z0-9-]+)/i)?.[1] ?? "",
  }),
);

check("exactly 4 schedule calls", calls.length === 4);
check("job names are unique", new Set(calls.map(({ name }) => name)).size === 4);
for (const [name, schedule, route] of expected) {
  check(
    `${name}: exact schedule and route`,
    calls.some(
      (job) => job.name === name && job.schedule === schedule && job.route === route,
    ),
  );
}

const canonicalNames = new Set(calls.map(({ name }) => name));
let simulatedJobs = [...calls, ...calls];
for (let run = 0; run < 2; run += 1) {
  simulatedJobs = simulatedJobs.filter(({ name }) => !canonicalNames.has(name));
  simulatedJobs.push(...calls);
}
check(
  "two reconciliation runs converge to 4 unique jobs",
  simulatedJobs.length === 4 && new Set(simulatedJobs.map(({ name }) => name)).size === 4,
);

check(
  "canonical jobs are removed before recreation",
  /FROM\s+cron\.job[\s\S]*?jobname\s*=\s*ANY[\s\S]*?cron\.unschedule\s*\(/i.test(sql),
);
check("reconciliation is serialized", /pg_advisory_xact_lock\s*\(/i.test(sql));
const baseUrlValidationIndex = sql.indexOf("PERFORM ops.cron_base_url();");
const secretValidationIndex = sql.indexOf("PERFORM ops.require_cron_secret();");
const firstUnscheduleIndex = sql.indexOf("PERFORM cron.unschedule(");
check(
  "runtime dependencies are validated before unscheduling",
  baseUrlValidationIndex >= 0 &&
    secretValidationIndex >= 0 &&
    firstUnscheduleIndex >= 0 &&
    baseUrlValidationIndex < firstUnscheduleIndex &&
    secretValidationIndex < firstUnscheduleIndex,
);
check(
  "environment URL comes from runtime configuration",
  sql.includes("WHERE name = 'cron_base_url'") && sql.includes("ops.cron_base_url()"),
);
check(
  "guard header uses the runtime secret",
  calls.every(({ name }) => name) &&
    (sql.match(/'x-mehla-cron-secret',\s*ops\.require_cron_secret\(\)/g)?.length ?? 0) === 4,
);
check(
  "missing URL and secret fail closed",
  /cron_base_url[\s\S]*?RAISE\s+EXCEPTION/i.test(sql) &&
    /cron_secret[\s\S]*?RAISE\s+EXCEPTION/i.test(sql),
);
check(
  "no fixed environment URL literal",
  !/'https:\/\/[A-Za-z0-9]/i.test(sql),
);
check(
  "no key-like secret literal",
  !/(?:sb_publishable_|sb_secret_|eyJ[A-Za-z0-9])/i.test(sql),
);
check(
  "new cron helpers do not use SECURITY DEFINER",
  !/SECURITY\s+DEFINER/i.test(sql) && (sql.match(/SECURITY\s+INVOKER/gi)?.length ?? 0) === 3,
);
check(
  "SQL dollar-quoted bodies are balanced",
  (sql.match(/\$function\$/g)?.length ?? 0) === 6 &&
    (sql.match(/\$cron\$/g)?.length ?? 0) === 8,
);
const priorMigrationSql = migrationNames
  .filter((name) => provisioningNames.length === 1 && name < provisioningNames[0])
  .map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
  .join("\n");
check(
  "pg_cron and pg_net are declared before provisioning",
  /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_cron/i.test(priorMigrationSql) &&
    /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_net/i.test(priorMigrationSql),
);
check(
  "provisioning migration is last in source order",
  provisioningNames.length === 1 && migrationNames.at(-1) === provisioningNames[0],
);

const changedRoutes = execFileSync(
  "git",
  ["status", "--short", "--", "src/routes/api/public/hooks"],
  { cwd: ROOT, encoding: "utf8" },
).trim();
check("existing cron route files unchanged", changedRoutes === "");

console.log(`\nPASS = ${passes} / FAIL = ${failures}`);
if (failures > 0) process.exit(1);
