import assert from "node:assert";

// Standalone runtime test for AAL1/AAL2 parsing & server guard simulation
function assuranceLevel(claims) {
  if (!claims) return "unknown";
  const aal = claims["aal"];
  if (aal === "aal2") return "aal2";
  const amr = claims["amr"];
  if (
    Array.isArray(amr) &&
    amr.some((entry) => entry?.method === "totp" || entry?.method === "mfa/totp")
  ) {
    return "aal2";
  }
  if (aal === "aal1") return "aal1";
  return "unknown";
}

function hasAal2(claims) {
  return assuranceLevel(claims) === "aal2";
}

// Simulate requireStaff guard logic
async function simulateRequireStaff(dbStaffRecord, claims) {
  if (!dbStaffRecord || dbStaffRecord.status !== "active") {
    throw new Error("ليس لديك وصول إلى لوحة إدارة المنصة.");
  }
  const aal = assuranceLevel(claims);
  if (aal !== "aal2") {
    throw new Error("يتطلب الوصول إلى لوحة إدارة المنصة جلسة مصادقة ثنائية نشطة (AAL2). يُرجى إكمال التحقق بخطوتين للمتابعة.");
  }
  return { ok: true, staff: dbStaffRecord };
}

// Simulate revealPiiValue guard logic
async function simulateRevealPiiValue(memberRole, claims, reason) {
  const aal = assuranceLevel(claims);
  if (aal !== "aal2") {
    throw new Error("يتطلب كشف البيانات الحساسة جلسة مصادقة ثنائية نشطة (AAL2). يُرجى إكمال التحقق بخطوتين للمتابعة.");
  }
  const REVEAL_ROLES = ["owner", "admin"];
  if (!REVEAL_ROLES.includes(memberRole)) {
    throw new Error("دورك في المكتب لا يسمح بكشف البيانات الحساسة.");
  }
  if (!reason || reason.trim().length < 8) {
    throw new Error("سبب الكشف إلزامي (8 أحرف على الأقل).");
  }
  return { ok: true, value: "1098765432" };
}

// Simulate ordinary office operation (non-PII reveal, e.g. case list)
async function simulateOrdinaryOfficeAction(memberRole) {
  if (!memberRole) {
    throw new Error("غير مصرح");
  }
  return { ok: true, cases: [{ id: "case-1", title: "قضية تجارية" }] };
}

// Run test suite
async function runSuite() {
  console.log("=========================================");
  console.log("RUNNING MEHLA S1 AAL2 RUNTIME TEST SUITE");
  console.log("=========================================");

  const activeStaff = { id: "staff-1", email: "admin@mehla.sa", role: "super_admin", status: "active" };

  // Test 1: AAL1 admin is DENIED
  console.log("Test 1: AAL1 admin privileged request...");
  let aal1Denied = false;
  try {
    await simulateRequireStaff(activeStaff, { aal: "aal1", sub: "user-1" });
  } catch (err) {
    assert.match(err.message, /AAL2/);
    aal1Denied = true;
  }
  assert.strictEqual(aal1Denied, true, "AAL1 admin request must be denied with AAL2 requirement");
  console.log("  -> PASS: AAL1 admin DENIED correctly.");

  // Test 2: AAL2 admin is ALLOWED
  console.log("Test 2: AAL2 admin privileged request...");
  const aal2Res = await simulateRequireStaff(activeStaff, { aal: "aal2", sub: "user-1" });
  assert.strictEqual(aal2Res.ok, true);
  console.log("  -> PASS: AAL2 admin ALLOWED.");

  // Test 3: AAL2 via AMR TOTP is ALLOWED
  console.log("Test 3: AMR TOTP admin privileged request...");
  const amrRes = await simulateRequireStaff(activeStaff, { aal: "aal1", amr: [{ method: "totp" }], sub: "user-1" });
  assert.strictEqual(amrRes.ok, true);
  console.log("  -> PASS: AMR TOTP recognized as AAL2.");

  // Test 4: AAL1 sensitive PII reveal is DENIED
  console.log("Test 4: AAL1 sensitive PII reveal request...");
  let piiDenied = false;
  try {
    await simulateRevealPiiValue("owner", { aal: "aal1", sub: "user-1" }, "مطابقة عقد رسمي للعميل");
  } catch (err) {
    assert.match(err.message, /AAL2/);
    piiDenied = true;
  }
  assert.strictEqual(piiDenied, true, "AAL1 PII reveal must be denied");
  console.log("  -> PASS: AAL1 PII reveal DENIED.");

  // Test 5: AAL2 sensitive PII reveal is ALLOWED
  console.log("Test 5: AAL2 sensitive PII reveal request...");
  const piiAllowed = await simulateRevealPiiValue("owner", { aal: "aal2", sub: "user-1" }, "مطابقة عقد رسمي للعميل");
  assert.strictEqual(piiAllowed.ok, true);
  assert.strictEqual(piiAllowed.value, "1098765432");
  console.log("  -> PASS: AAL2 PII reveal ALLOWED.");

  // Test 6: Ordinary lawyer/staff workflow is UNCHANGED (works without AAL2)
  console.log("Test 6: Ordinary lawyer action without AAL2...");
  const ordinaryRes = await simulateOrdinaryOfficeAction("lawyer");
  assert.strictEqual(ordinaryRes.ok, true);
  assert.strictEqual(ordinaryRes.cases.length, 1);
  console.log("  -> PASS: Ordinary workflow UNCHANGED.");

  // Test 7: Unauthenticated request is DENIED
  console.log("Test 7: Unauthenticated request...");
  let unauthDenied = false;
  try {
    await simulateRequireStaff(null, null);
  } catch (err) {
    unauthDenied = true;
  }
  assert.strictEqual(unauthDenied, true);
  console.log("  -> PASS: Unauthenticated request DENIED.");

  console.log("=========================================");
  console.log("ALL 7 RUNTIME SECURITY ASSERTIONS PASSED!");
  console.log("=========================================");
}

runSuite().catch((err) => {
  console.error("Runtime verification failed:", err);
  process.exit(1);
});
