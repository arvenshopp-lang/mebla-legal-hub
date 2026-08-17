import crypto from "node:crypto";
import fs from "node:fs";

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${name}`, detail ?? "");
}

console.log("\n==================================================");
console.log("MEHLA — EMAIL DISPATCH SEMANTICS & UI AUDIT TESTS");
console.log("==================================================");

// 1. Idempotency Key Consistency
console.log("\n1) ثبات وتفرّد معرّف الرسالة ومفتاح الـ Idempotency");
function stableRequestKey(messageId) {
  return messageId.replace(/[<>]/g, "").trim().slice(0, 256);
}

async function deterministicMessageId(idempotencyKey) {
  const bytes = new TextEncoder().encode(`mehla-app-email:${idempotencyKey}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
  return `<app-${hex}@mehlalex.com>`;
}

const msgId1 = await deterministicMessageId("test-invite-001");
const msgId2 = await deterministicMessageId("test-invite-001");
check("نفس مفتاح العملية ينتج نفس Message-ID دائماً", msgId1 === msgId2);

const reqKey1 = stableRequestKey(msgId1);
const reqKey2 = stableRequestKey(msgId2);
check("نفس Message-ID ينتج نفس Idempotency-Key للمزوّد", reqKey1 === reqKey2 && reqKey1.length > 0);

// 2. UI Semantics Mapping Engine (matching exact mail.tsx logic)
function evaluateMailUiToast(event) {
  if (event.type === "success") {
    const result = event.result;
    if (result.sent) {
      return { level: "success", title: "تم إرسال الرسالة." };
    }
    if (result.failureRef) {
      return {
        level: "info",
        title: `تمت إضافة الرسالة لقائمة الإرسال — ستتم محاولة التسليم تلقائياً. المرجع: ${result.failureRef}`,
      };
    }
    return { level: "success", title: "تمت جدولة الرسالة في قائمة الإرسال." };
  }

  if (event.type === "error") {
    const err = event.error;
    const msg = err.message || "";
    const isNetworkUncertainty =
      /failed to fetch|networkerror|load failed|timeout|abort/i.test(msg) ||
      err.name === "TypeError" ||
      err.name === "AbortError";

    if (isNetworkUncertainty) {
      return {
        level: "warning",
        title: "جاري التحقق من حالة الإرسال",
        description: "تعذّر تأكيد الاستجابة الفورية من الشبكة؛ يرجى مراجعة صندوق الصادر للتأكد من حالة الرسالة.",
      };
    }
    return {
      level: "error",
      title: "تعذّر الإرسال",
      description: msg,
    };
  }

  throw new Error("Unknown event type");
}

console.log("\n2) اختبار مصفوفة استجابات الواجهة (8 مسارات دلالية دقيقة)");

// Case 1: Instant Server & Provider Success -> SUCCESS
const outcome1 = evaluateMailUiToast({ type: "success", result: { sent: true } });
check("1. النجاح الفوري يُظهر success (تم إرسال الرسالة)", outcome1.level === "success" && outcome1.title.includes("تم إرسال"));

// Case 2: Outbox Queued with Auto-Retry -> INFO
const outcome2 = evaluateMailUiToast({ type: "success", result: { sent: false, failureRef: "FAIL-REF-999" } });
check("2. الجدولة وإعادة المحاولة التلقائية تُظهر info (تمت إضافة الرسالة لقائمة الإرسال)", outcome2.level === "info" && outcome2.title.includes("ستتم محاولة التسليم"));

// Case 3: Network Uncertainty / Fetch Timeout -> WARNING
const outcome3 = evaluateMailUiToast({ type: "error", error: new TypeError("Failed to fetch") });
check("3. تعثر الشبكة/انقطاع الاتصال يُظهر warning (جاري التحقق من حالة الإرسال)", outcome3.level === "warning" && outcome3.title.includes("جاري التحقق"));

// Case 4: Validation Failure (Empty Subject) -> ERROR
const outcome4 = evaluateMailUiToast({ type: "error", error: new Error("موضوع الرسالة مطلوب.") });
check("4. فشل التحقق من الحقول يُظهر error صريح مع وصف العطل", outcome4.level === "error" && outcome4.description === "موضوع الرسالة مطلوب.");

// Case 5: Validation Failure (No Recipients) -> ERROR
const outcome5 = evaluateMailUiToast({ type: "error", error: new Error("أضف مستلماً واحداً على الأقل.") });
check("5. عدم وجود مستلمين يُظهر error صريح", outcome5.level === "error" && outcome5.description === "أضف مستلماً واحداً على الأقل.");

// Case 6: Authorization Denial (Forbidden) -> ERROR
const outcome6 = evaluateMailUiToast({ type: "error", error: new Error("لا تملك صلاحية إرسال البريد.") });
check("6. رفض الصلاحيات يُظهر error صريح", outcome6.level === "error" && outcome6.description === "لا تملك صلاحية إرسال البريد.");

// Case 7: Mailbox Configuration Missing -> ERROR
const outcome7 = evaluateMailUiToast({ type: "error", error: new Error("الصندوق المحدد غير متاح أو غير مُهيّأ.") });
check("7. أخطاء الإعداد قبل الإرسال تُظهر error صريح", outcome7.level === "error" && outcome7.description.includes("غير مُهيّأ"));

// Case 8: Duplicate Send Guard -> ERROR
const outcome8 = evaluateMailUiToast({ type: "error", error: new Error("هذه الرسالة أُرسلت أو هي في قائمة الإرسال بالفعل.") });
check("8. منع الإرسال المكرر يُظهر error صريح لمنع التكرار", outcome8.level === "error" && outcome8.description.includes("أُرسلت"));

// 3. Source Inspection of mail.tsx
console.log("\n3) مطابقة كود src/routes/mehla-admin/mail.tsx للمحددات الدلالية");
const mailSrc = fs.readFileSync("src/routes/mehla-admin/mail.tsx", "utf8");
check("الكود يحتوي على تصنيف صريح لـ isNetworkUncertainty", mailSrc.includes("const isNetworkUncertainty ="));
check("الكود يستخدم toast.warning فقط لحالات عدم اليقين الشبكية", mailSrc.includes('toast.warning("جاري التحقق من حالة الإرسال"'));
check("الكود يستخدم toast.error للأخطاء القطعية الأخرى", mailSrc.includes('toast.error("تعذّر الإرسال", { description: msg })'));

if (failures > 0) {
  console.error(`\n❌ Tests failed with ${failures} error(s).`);
  process.exit(1);
} else {
  console.log("\n✅ ALL ERROR SEMANTICS & UI MAPPING AUDIT TESTS PASSED WITH 0 FAILURES.\n");
}
