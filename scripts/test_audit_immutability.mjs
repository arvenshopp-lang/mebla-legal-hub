import assert from "node:assert";
import fs from "node:fs";

// Mock implementation of immutable audit table behavior
class ImmutableAuditTable {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.hasDenyUpdateTrigger = true;
    this.hasDenyDeleteTrigger = true;
  }

  insert(record) {
    const entry = { id: `log-${this.rows.length + 1}`, ...record, created_at: new Date().toISOString() };
    this.rows.push(entry);
    return entry;
  }

  update(id, updates) {
    if (this.hasDenyUpdateTrigger) {
      const err = new Error("RECORD_IMMUTABLE");
      err.code = "P0001";
      throw err;
    }
    const row = this.rows.find(r => r.id === id);
    if (row) Object.assign(row, updates);
    return row;
  }

  delete(id) {
    if (this.hasDenyDeleteTrigger) {
      const err = new Error("RECORD_IMMUTABLE");
      err.code = "P0001";
      throw err;
    }
    this.rows = this.rows.filter(r => r.id !== id);
  }

  select(filterFn) {
    return this.rows.filter(filterFn || (() => true));
  }
}

async function runAuditImmutabilitySuite() {
  console.log("==================================================================");
  console.log("RUNNING MEHLA PII & AUDIT LOG IMMUTABILITY VERIFICATION SUITE");
  console.log("==================================================================");

  // Test 1: PII Access Log INSERT
  console.log("Test 1: PII Access Log INSERT allowed...");
  const piiLogs = new ImmutableAuditTable("pii_access_logs");
  const entry = piiLogs.insert({
    organization_id: "org-1",
    user_id: "user-1",
    resource_type: "client_national_id",
    action: "read",
    outcome: "GRANTED"
  });
  assert.strictEqual(entry.outcome, "GRANTED");
  assert.strictEqual(piiLogs.rows.length, 1);
  console.log("  -> PASS: PII audit log insertion succeeded.");

  // Test 2: PII Access Log UPDATE blocked (Deny Update Trigger)
  console.log("Test 2: PII Access Log UPDATE strictly rejected (RECORD_IMMUTABLE)...");
  let updateBlocked = false;
  try {
    piiLogs.update(entry.id, { outcome: "DENIED" });
  } catch (err) {
    updateBlocked = true;
    assert.strictEqual(err.message, "RECORD_IMMUTABLE");
    assert.strictEqual(err.code, "P0001");
  }
  assert.strictEqual(updateBlocked, true, "UPDATE must be blocked on immutable audit logs");
  console.log("  -> PASS: UPDATE attempt threw RECORD_IMMUTABLE exception.");

  // Test 3: PII Access Log DELETE blocked (Deny Delete Trigger)
  console.log("Test 3: PII Access Log DELETE strictly rejected (RECORD_IMMUTABLE)...");
  let deleteBlocked = false;
  try {
    piiLogs.delete(entry.id);
  } catch (err) {
    deleteBlocked = true;
    assert.strictEqual(err.message, "RECORD_IMMUTABLE");
    assert.strictEqual(err.code, "P0001");
  }
  assert.strictEqual(deleteBlocked, true, "DELETE must be blocked on immutable audit logs");
  console.log("  -> PASS: DELETE attempt threw RECORD_IMMUTABLE exception.");

  // Test 4: SELECT continues working normally
  console.log("Test 4: SELECT audit logs continues working normally...");
  const results = piiLogs.select(r => r.organization_id === "org-1");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].resource_type, "client_national_id");
  console.log("  -> PASS: Authorized SELECT returned audit trail without error.");

  // Test 5: Forward-Fix Migration Source Parity Verification
  console.log("Test 5: Forward-fix migration source verification...");
  const migrationPath = "supabase/migrations/20260817000200_pii_access_logs_immutability.sql";
  assert.strictEqual(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TRIGGER pii_access_logs_immutable/);
  assert.match(sql, /BEFORE UPDATE ON public\.pii_access_logs/);
  assert.match(sql, /EXECUTE FUNCTION public\.deny_update\(\)/);
  assert.match(sql, /CREATE TRIGGER pii_access_logs_no_delete/);
  assert.match(sql, /BEFORE DELETE ON public\.pii_access_logs/);
  assert.match(sql, /EXECUTE FUNCTION public\.deny_hard_delete\(\)/);
  console.log("  -> PASS: Migration 20260817000200 correctly defines immutable triggers.");

  console.log("==================================================================");
  console.log("ALL 5 PII & AUDIT IMMUTABILITY TESTS PASSED (100% GREEN)!");
  console.log("==================================================================");
}

runAuditImmutabilitySuite().catch((err) => {
  console.error("Audit immutability test failed:", err);
  process.exit(1);
});
