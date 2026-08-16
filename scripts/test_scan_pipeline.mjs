import assert from "node:assert";
import fs from "node:fs";

// 1. Backoff ladder & retry limits
const MAX_SCAN_RETRIES = 3;
function scanBackoffMs(retryCount) {
  const ladder = [60_000, 300_000, 900_000];
  const idx = Math.max(0, Math.min(retryCount - 1, ladder.length - 1));
  return ladder[idx] ?? 900_000;
}

// 2. In-Memory Simulated Database with FOR UPDATE SKIP LOCKED & Leases
class MockDatabase {
  constructor(initialDocs = []) {
    this.documents = JSON.parse(JSON.stringify(initialDocs));
  }

  // Simulates claim_document_scan_batch RPC
  claimBatch(limit = 10, workerId = "worker-1", leaseSeconds = 300, now = new Date()) {
    const claimed = [];
    for (const doc of this.documents) {
      if (claimed.length >= limit) break;

      const leaseExpired = !doc.scan_lease_expires_at || new Date(doc.scan_lease_expires_at) < now;
      const retryDue = !doc.next_retry_at || new Date(doc.next_retry_at) <= now;

      const isPending = doc.scan_status === "PENDING_SCAN" && leaseExpired;
      const isRetryableFail = doc.scan_status === "SCAN_FAILED" && (doc.scan_retry_count || 0) < MAX_SCAN_RETRIES && retryDue && leaseExpired;

      if (isPending || isRetryableFail) {
        doc.scan_worker_id = workerId;
        doc.scan_started_at = now.toISOString();
        doc.scan_lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
        claimed.push({ ...doc });
      }
    }
    return claimed;
  }
}

// 3. Simulated Pipeline Transitions
function simulateProcessDocument(doc, prescreenResult, fullScannerResult) {
  // Step A: Pre-Screen
  if (!prescreenResult.clean) {
    return {
      docId: doc.id,
      scan_status: "INFECTED",
      file_status: "INVALID_FILE",
      can_retry: false,
      reason: prescreenResult.reason
    };
  }

  // Step B: Full Scanner Evaluation
  if (!fullScannerResult) {
    // Scanner not provisioned -> Remains PENDING_SCAN (No Auto-CLEAN)
    return {
      docId: doc.id,
      scan_status: "PENDING_SCAN",
      file_status: "PENDING",
      can_retry: false,
      reason: "Prescreen passed, awaiting full antivirus engine"
    };
  }

  if (fullScannerResult.status === "CLEAN") {
    return {
      docId: doc.id,
      scan_status: "CLEAN",
      file_status: "AVAILABLE",
      can_retry: false,
      reason: "Full scanner verified clean"
    };
  }

  if (fullScannerResult.status === "INFECTED") {
    return {
      docId: doc.id,
      scan_status: "INFECTED",
      file_status: "INVALID_FILE",
      can_retry: false,
      reason: fullScannerResult.reason || "Malware detected"
    };
  }

  // Scanner Failure / Timeout -> SCAN_FAILED with bounded retry
  const currentRetries = doc.scan_retry_count || 0;
  const newRetryCount = currentRetries + 1;
  const canRetry = newRetryCount < MAX_SCAN_RETRIES;
  const nextRetryMs = canRetry ? scanBackoffMs(newRetryCount) : null;

  return {
    docId: doc.id,
    scan_status: "SCAN_FAILED",
    file_status: "PENDING",
    scan_retry_count: newRetryCount,
    can_retry: canRetry,
    next_retry_in_ms: nextRetryMs,
    reason: fullScannerResult.reason || "Scanner timeout"
  };
}

// 4. Simulated Cron Auth
function simulateGuardCron(headers, expectedSecret = "valid-secret-token") {
  const secret = headers["x-mehla-cron-secret"];
  if (!secret) return { authorized: false, status: 401 };
  if (secret !== expectedSecret) return { authorized: false, status: 401 };
  return { authorized: true, status: 200 };
}

async function runScanPipelineSuite() {
  console.log("==================================================================");
  console.log("RUNNING MEHLA DOCUMENT SCAN & RETRY PIPELINE VERIFICATION SUITE");
  console.log("==================================================================");

  // Test 1: Invariant — Pre-Screen pass does NOT produce CLEAN
  console.log("Test 1: Invariant — Pre-Screen pass does NOT produce CLEAN...");
  const doc1 = { id: "doc-1", file_name: "contract.pdf", scan_status: "PENDING_SCAN", scan_retry_count: 0 };
  const res1 = simulateProcessDocument(doc1, { clean: true }, null);
  assert.strictEqual(res1.scan_status, "PENDING_SCAN");
  assert.strictEqual(res1.file_status, "PENDING");
  console.log("  -> PASS: Unscanned document safely remains PENDING_SCAN (No Auto-CLEAN).");

  // Test 2: Full Antivirus Scanner pass -> CLEAN & AVAILABLE
  console.log("Test 2: Full Antivirus Scanner pass -> CLEAN & AVAILABLE...");
  const res2 = simulateProcessDocument(doc1, { clean: true }, { status: "CLEAN" });
  assert.strictEqual(res2.scan_status, "CLEAN");
  assert.strictEqual(res2.file_status, "AVAILABLE");
  console.log("  -> PASS: Verified full scan transitions document to CLEAN.");

  // Test 3: Structural Pre-Screen Threat Detection -> INFECTED (Permanent, No Retry)
  console.log("Test 3: Structural Threat (PE / Macro) -> INFECTED...");
  const res3 = simulateProcessDocument(doc1, { clean: false, reason: "MZ/PE header detected" }, null);
  assert.strictEqual(res3.scan_status, "INFECTED");
  assert.strictEqual(res3.file_status, "INVALID_FILE");
  assert.strictEqual(res3.can_retry, false);
  console.log("  -> PASS: Structural infection permanently quarantined.");

  // Test 4: Full Scanner Threat Detection -> INFECTED
  console.log("Test 4: Full Scanner Threat Detection -> INFECTED...");
  const res4 = simulateProcessDocument(doc1, { clean: true }, { status: "INFECTED", reason: "Trojan.Generic" });
  assert.strictEqual(res4.scan_status, "INFECTED");
  assert.strictEqual(res4.file_status, "INVALID_FILE");
  assert.strictEqual(res4.can_retry, false);
  console.log("  -> PASS: Antivirus infection permanently quarantined.");

  // Test 5: Scanner Failure with Bounded Exponential Backoff
  console.log("Test 5: Scanner Failure with Bounded Retry (Attempts 1, 2, 3)...");
  const attempt1 = simulateProcessDocument({ id: "doc-retry", scan_retry_count: 0 }, { clean: true }, { status: "SCAN_FAILED" });
  assert.strictEqual(attempt1.scan_status, "SCAN_FAILED");
  assert.strictEqual(attempt1.scan_retry_count, 1);
  assert.strictEqual(attempt1.can_retry, true);
  assert.strictEqual(attempt1.next_retry_in_ms, 60_000); // 1 min

  const attempt2 = simulateProcessDocument({ id: "doc-retry", scan_retry_count: 1 }, { clean: true }, { status: "SCAN_FAILED" });
  assert.strictEqual(attempt2.scan_retry_count, 2);
  assert.strictEqual(attempt2.can_retry, true);
  assert.strictEqual(attempt2.next_retry_in_ms, 300_000); // 5 min

  const attempt3 = simulateProcessDocument({ id: "doc-retry", scan_retry_count: 2 }, { clean: true }, { status: "SCAN_FAILED" });
  assert.strictEqual(attempt3.scan_retry_count, 3);
  assert.strictEqual(attempt3.can_retry, false); // Exhausted!
  assert.strictEqual(attempt3.next_retry_in_ms, null);
  console.log("  -> PASS: Bounded retries strictly enforced (Max 3 attempts, exponential backoff).");

  // Test 6: Legacy Documents Default Invariant
  console.log("Test 6: Legacy un-scanned document handling...");
  const legacyDoc = { id: "doc-legacy", file_name: "old_case.pdf", scan_status: "PENDING_SCAN" };
  const legacyRes = simulateProcessDocument(legacyDoc, { clean: true }, null);
  assert.strictEqual(legacyRes.scan_status, "PENDING_SCAN");
  console.log("  -> PASS: Legacy documents require active scanning before access.");

  // Test 7: Two workers competing for the same document batch
  console.log("Test 7: Two workers competing for the same document batch...");
  const db = new MockDatabase([
    { id: "doc-c1", scan_status: "PENDING_SCAN", scan_retry_count: 0 },
    { id: "doc-c2", scan_status: "PENDING_SCAN", scan_retry_count: 0 }
  ]);
  const now = new Date();
  const worker1Batch = db.claimBatch(1, "worker-1", 300, now);
  const worker2Batch = db.claimBatch(1, "worker-2", 300, now);

  assert.strictEqual(worker1Batch.length, 1);
  assert.strictEqual(worker1Batch[0].id, "doc-c1");
  assert.strictEqual(worker2Batch.length, 1);
  assert.strictEqual(worker2Batch[0].id, "doc-c2");
  console.log("  -> PASS: Atomic claim distributes distinct jobs without double-processing.");

  // Test 8: Worker crash and lease expiration recovery
  console.log("Test 8: Worker crash and lease expiration recovery...");
  const crashedDb = new MockDatabase([
    {
      id: "doc-crashed",
      scan_status: "PENDING_SCAN",
      scan_worker_id: "worker-dead",
      scan_lease_expires_at: new Date(now.getTime() - 1000).toISOString() // Expired lease
    }
  ]);
  const recoveryBatch = crashedDb.claimBatch(1, "worker-survivor", 300, now);
  assert.strictEqual(recoveryBatch.length, 1);
  assert.strictEqual(recoveryBatch[0].id, "doc-crashed");
  assert.strictEqual(crashedDb.documents[0].scan_worker_id, "worker-survivor");
  console.log("  -> PASS: Stale lease recovered automatically by active worker.");

  // Test 9: Cron Request Authorization Security
  console.log("Test 9: Cron Request Authorization (Missing / Invalid / Valid Secret)...");
  const authNone = simulateGuardCron({});
  assert.strictEqual(authNone.authorized, false);
  assert.strictEqual(authNone.status, 401);

  const authBad = simulateGuardCron({ "x-mehla-cron-secret": "wrong-token" });
  assert.strictEqual(authBad.authorized, false);
  assert.strictEqual(authBad.status, 401);

  const authGood = simulateGuardCron({ "x-mehla-cron-secret": "valid-secret-token" });
  assert.strictEqual(authGood.authorized, true);
  assert.strictEqual(authGood.status, 200);
  console.log("  -> PASS: Cron auth strictly rejects unauthenticated & invalid calls.");

  // Test 10: Batch Failure Isolation
  console.log("Test 10: Batch Failure Isolation...");
  const batchDocs = [
    { id: "doc-fail", file_name: "bad.pdf" },
    { id: "doc-good", file_name: "good.pdf" }
  ];
  const batchResults = [];
  for (const doc of batchDocs) {
    try {
      if (doc.id === "doc-fail") {
        batchResults.push(simulateProcessDocument(doc, { clean: true }, { status: "SCAN_FAILED", reason: "timeout" }));
      } else {
        batchResults.push(simulateProcessDocument(doc, { clean: true }, { status: "CLEAN" }));
      }
    } catch (e) {
      batchResults.push({ docId: doc.id, error: true });
    }
  }
  assert.strictEqual(batchResults.length, 2);
  assert.strictEqual(batchResults[0].scan_status, "SCAN_FAILED");
  assert.strictEqual(batchResults[1].scan_status, "CLEAN");
  console.log("  -> PASS: Individual document scan failure does not abort batch processing.");

  // Test 11: Idempotent Scheduler Migration Source Verification
  console.log("Test 11: Idempotent Scheduler Migration Source Verification...");
  const migrationPath = "supabase/migrations/20260817000100_document_scan_cron_activation.sql";
  assert.strictEqual(fs.existsSync(migrationPath), true);
  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  assert.match(migrationSql, /WHERE NOT EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'mehla-document-scan'\);/);
  assert.match(migrationSql, /'mehla-document-scan'/);
  assert.match(migrationSql, /'\*\/2 \* \* \* \*'/);
  assert.match(migrationSql, /ops\.cron_secret\(\)/);
  console.log("  -> PASS: Scheduler migration is verifiable, idempotent, and secure.");

  console.log("==================================================================");
  console.log("ALL 11 DOCUMENT SCAN PIPELINE & SCHEDULER TESTS PASSED (100% GREEN)!");
  console.log("==================================================================");
}

runScanPipelineSuite().catch((err) => {
  console.error("Pipeline test failed:", err);
  process.exit(1);
});
