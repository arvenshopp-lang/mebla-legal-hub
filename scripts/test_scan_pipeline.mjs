import assert from "node:assert";

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

  // Test 7: Atomic Concurrency & Skip-Locked Claim Simulation
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

  // Test 8: Worker Crash & Lease Expiration Recovery
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

  console.log("==================================================================");
  console.log("ALL 8 DOCUMENT SCAN PIPELINE TESTS PASSED (100% GREEN)!");
  console.log("==================================================================");
}

runScanPipelineSuite().catch((err) => {
  console.error("Pipeline test failed:", err);
  process.exit(1);
});
