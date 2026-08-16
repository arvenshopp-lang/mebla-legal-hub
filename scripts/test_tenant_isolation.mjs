import assert from "node:assert";

// 1. Replicate & test assertOrgScopedStoragePath logic
function assertOrgScopedStoragePath(filePath, organizationId) {
  const clean = (filePath ?? "").trim();
  if (
    !clean ||
    clean.length > 400 ||
    clean.startsWith("/") ||
    clean.includes("..") ||
    clean.includes("//") ||
    !clean.startsWith(`${organizationId}/`)
  ) {
    throw new Error("مسار المستند غير صالح.");
  }
  return clean;
}

// 2. Replicate & test assertOwnedPath from intake.server.ts
function assertOwnedPath(path, prefix) {
  const clean = (path ?? "").trim();
  if (!clean || clean.length > 400) throw new Error("مسار ملف غير صالح.");
  if (clean.includes("..") || clean.includes("//") || clean.startsWith("/")) {
    throw new Error("مسار ملف غير صالح.");
  }
  if (!clean.startsWith(prefix)) throw new Error("مسار ملف غير صالح.");
  return clean;
}

async function runTenantIsolationSuite() {
  console.log("================================================");
  console.log("RUNNING PHASE S3 TENANT ISOLATION TEST SUITE");
  console.log("================================================");

  const orgA = "a0000000-0000-0000-0000-000000000001";
  const orgB = "b0000000-0000-0000-0000-000000000002";

  // Test 1: Legitimate org-scoped path is accepted
  console.log("Test 1: Legitimate org-scoped storage path...");
  const validPath = `${orgA}/case_123/document_456.pdf`;
  const res1 = assertOrgScopedStoragePath(validPath, orgA);
  assert.strictEqual(res1, validPath);
  console.log("  -> PASS: Legitimate org path accepted.");

  // Test 2: Cross-tenant path access attempt is blocked
  console.log("Test 2: Cross-tenant path access attempt...");
  let crossTenantBlocked = false;
  try {
    assertOrgScopedStoragePath(`${orgB}/secret.pdf`, orgA);
  } catch (err) {
    crossTenantBlocked = true;
  }
  assert.strictEqual(crossTenantBlocked, true, "Cross-tenant path must be rejected");
  console.log("  -> PASS: Cross-tenant path rejected.");

  // Test 3: Directory traversal (..) attempt is blocked
  console.log("Test 3: Directory traversal (..) attempt...");
  let traversalBlocked = false;
  try {
    assertOrgScopedStoragePath(`${orgA}/../${orgB}/secret.pdf`, orgA);
  } catch (err) {
    traversalBlocked = true;
  }
  assert.strictEqual(traversalBlocked, true, "Path traversal must be rejected");
  console.log("  -> PASS: Directory traversal rejected.");

  // Test 4: Leading slash bypass attempt is blocked
  console.log("Test 4: Leading slash bypass attempt...");
  let leadingSlashBlocked = false;
  try {
    assertOrgScopedStoragePath(`/${orgA}/doc.pdf`, orgA);
  } catch (err) {
    leadingSlashBlocked = true;
  }
  assert.strictEqual(leadingSlashBlocked, true, "Leading slash path must be rejected");
  console.log("  -> PASS: Leading slash path rejected.");

  // Test 5: Double slash bypass attempt is blocked
  console.log("Test 5: Double slash bypass attempt...");
  let doubleSlashBlocked = false;
  try {
    assertOrgScopedStoragePath(`${orgA}//doc.pdf`, orgA);
  } catch (err) {
    doubleSlashBlocked = true;
  }
  assert.strictEqual(doubleSlashBlocked, true, "Double slash path must be rejected");
  console.log("  -> PASS: Double slash path rejected.");

  // Test 6: Intake prefix ownership enforcement
  console.log("Test 6: Intake assertOwnedPath prefix check...");
  const validIntake = assertOwnedPath(`${orgA}/uuid-file.pdf`, `${orgA}/`);
  assert.strictEqual(validIntake, `${orgA}/uuid-file.pdf`);

  let fakeIntakeBlocked = false;
  try {
    assertOwnedPath(`${orgB}/uuid-file.pdf`, `${orgA}/`);
  } catch (err) {
    fakeIntakeBlocked = true;
  }
  assert.strictEqual(fakeIntakeBlocked, true, "Mismatched prefix must be rejected");
  console.log("  -> PASS: Intake prefix validation passed.");

  console.log("================================================");
  console.log("ALL 6 TENANT ISOLATION TESTS PASSED!");
  console.log("================================================");
}

runTenantIsolationSuite().catch((err) => {
  console.error("Tenant isolation tests failed:", err);
  process.exit(1);
});
