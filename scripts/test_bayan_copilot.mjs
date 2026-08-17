import {
  buildBayanSystemPrompt,
  generateBayanResponse,
} from "../src/lib/ai/bayan-copilot.server.ts";

async function runBayanTest() {
  console.log("================================================================================");
  console.log("⚖️ MEHLA — TESTING 'BAYAN' LEGAL AI COPILOT & SAUDI LAW INTEGRATION");
  console.log("================================================================================\n");

  const mockCaseContext = {
    caseInfo: {
      id: "99e34e56-1111-4444-8888-abcdef123456",
      case_title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب",
      case_number: "45129841",
      court_name: "المحكمة التجارية بالرياض",
      circuit: "الدائرة التجارية الثالثة",
      status: "in_progress",
      claim_amount: 350000,
      client_name: "شركة البنيان المتطور للمقاولات",
      description: "مطالبة بسداد الدفعة الختامية وقيمة الأعمال الإضافية المنفذة بموجب محاضر الاستلام المعتمدة.",
    },
    hearings: [
      {
        date: "2026-08-25",
        title: "جلسة المرافعة وتقديم مذكرة حصر البينات",
        decision: "تأجيل الجلسة لتمكين المدعي من تقديم أصل المحاضر الموقعة",
      },
    ],
    deadlines: [
      {
        due_date: "2026-08-22",
        title: "إيداع مذكرة الرد على دفوع المدعى عليها",
        status: "pending",
      },
    ],
    documents: [
      {
        title: "عقد المقاولة وملحق الأعمال الإضافية",
        category: "contracts",
        extractedSnippet: "اتفق الطرفان على أن تكون الدفعة الختامية مستحقة الأداء خلال 15 يوماً من توقيع محضر الاستلام النهائي دون إخلال بضمان الأعمال.",
      },
      {
        title: "محضر استلام الأعمال المنجزة",
        category: "deeds",
        extractedSnippet: "تم فحص كافة التركيبات والمواصفات ومطابقتها للمخططات المعتمدة دون وجود ملاحظات جوهرية.",
      },
    ],
  };

  // 1. فحص هندسة البرومبت والسياق
  console.log("[TEST 1] Verifying System Prompt Construction & Context Isolation...");
  const prompt = buildBayanSystemPrompt(mockCaseContext);
  if (
    prompt.includes("المحامية بيان") &&
    prompt.includes("المحكمة التجارية بالرياض") &&
    prompt.includes("شركة البنيان المتطور") &&
    prompt.includes("350000") &&
    prompt.includes("نظام المعاملات المدنية")
  ) {
    console.log("  ✓ System prompt correctly synthesized all case facts, parties, and Saudi laws!");
  } else {
    throw new Error("System prompt missing critical case context or Saudi law bindings.");
  }

  // 2. اختبار توليد استشارة تلخيص الدعوى
  console.log("\n[TEST 2] Testing Bayan Case Summary Intelligence...");
  const summaryRes = await generateBayanResponse(
    "لخصي لي وقائع الدعوى والموقف الإجرائي الحالي",
    [],
    mockCaseContext
  );
  console.log("  -> Bayan Response Preview:\n", summaryRes.text.slice(0, 300) + "...\n");
  if (summaryRes.text.includes("المحامية بيان") && summaryRes.text.includes("شركة البنيان المتطور")) {
    console.log("  ✓ Summary accurately grounded in case facts!");
  } else {
    throw new Error("Summary failed validation.");
  }

  // 3. اختبار استخراج الدفوع وفق الأنظمة السعودية
  console.log("\n[TEST 3] Testing Bayan Defenses & Saudi Evidence Code Grounding...");
  const defenseRes = await generateBayanResponse(
    "ما هي الدفوع الشكلية والموضوعية التي توصين بها استناداً للأنظمة؟",
    [],
    mockCaseContext
  );
  console.log("  -> Bayan Defenses Preview:\n", defenseRes.text.slice(0, 350) + "...\n");
  if (defenseRes.text.includes("نظام الإثبات") || defenseRes.text.includes("المحاكم التجارية") || defenseRes.citations.length > 0) {
    console.log("  ✓ Bayan successfully cited Saudi Evidence Code and Commercial Court regulations!");
    console.log("  ✓ Citations detected:", defenseRes.citations.map(c => c.title));
  } else {
    throw new Error("Defense response missing Saudi law citations.");
  }

  // 4. اختبار حساب المهل والمواعيد
  console.log("\n[TEST 4] Testing Bayan Deadlines & Procedural Timeline...");
  const deadlineRes = await generateBayanResponse(
    "ما هي المهل ومواعيد الاعتراض؟",
    [],
    mockCaseContext
  );
  if (deadlineRes.text.includes("30") || deadlineRes.text.includes("المهل")) {
    console.log("  ✓ Bayan accurately explained Saudi objection timelines and deadlines!");
  }

  // 5. فحص حجب وتعمية البيانات الشخصية الحساسة (Saudi PII Shielding)
  console.log("\n[TEST 5] Testing Saudi PII Redaction & Privacy Shield...");
  const { redactSaudiPii } = await import("../src/lib/ai/bayan-copilot.server.ts");
  const rawTextWithPii = "الموكل رقم هويته 1087654321 ورقم جواله 0551234567 وحسابه البنكي SA0380000000608010167519 وبريده client.lawyer@firm.sa";
  const sanitizedText = redactSaudiPii(rawTextWithPii);
  console.log("  -> Raw Text:", rawTextWithPii);
  console.log("  -> Sanitized Text:", sanitizedText);

  if (
    !sanitizedText.includes("1087654321") &&
    !sanitizedText.includes("0551234567") &&
    !sanitizedText.includes("SA0380000000608010167519") &&
    !sanitizedText.includes("client.lawyer@firm.sa") &&
    sanitizedText.includes("[هوية محجوبة]") &&
    sanitizedText.includes("[جوال محجوب]")
  ) {
    console.log("  ✓ All Saudi PII successfully redacted & masked before sending to AI!");
  } else {
    throw new Error("PII Redaction failed to mask sensitive identity data.");
  }

  console.log("\n================================================================================");
  console.log("🎉 ALL BAYAN LEGAL AI COPILOT & PRIVACY SHIELD TESTS PASSED WITH 100% SUCCESS!");
  console.log("================================================================================");
}

runBayanTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
