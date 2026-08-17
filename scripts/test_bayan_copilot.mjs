import {
  buildBayanSystemPrompt,
  generateBayanResponse,
  redactSaudiPii,
} from "../src/lib/ai/bayan-copilot.server.ts";

async function runBayanMasterTest() {
  console.log("================================================================================");
  console.log("⚖️ MEHLA — TESTING 'BAYAN' ENTIRE SAUDI LEGAL SYSTEM ENCYCLOPEDIA");
  console.log("================================================================================\n");

  const mockOfficeContext = {
    isGlobal: true,
    userRole: "owner",
    accessibleCasesCount: 6,
    teamMembers: [
      {
        id: "user-ziad-123",
        name: "زياد الحبيب",
        email: "ziad.emb@gmail.com",
        role: "lawyer",
        assignedCasesCount: 3,
        assignedCases: [
          { id: "case-1", title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب", number: "45129841", status: "in_progress", court: "المحكمة التجارية بالرياض" },
          { id: "case-2", title: "نزاع تجاري بشأن توريد أجهزة ومعدات", number: "45199201", status: "in_progress", court: "المحكمة التجارية بالرياض" },
          { id: "case-3", title: "مطالبة تعويض عن إخلال عقدي", number: "45200311", status: "pending", court: "المحكمة العامة بجدة" },
        ],
      },
    ],
    casesSummary: [
      { id: "case-1", title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب", number: "45129841", status: "in_progress", court: "المحكمة التجارية بالرياض", lawyer_name: "زياد الحبيب", claim_amount: 350000 },
    ],
    hearings: [
      { date: "2026-08-25", title: "جلسة تقديم البينات", case_title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب" },
    ],
    deadlines: [
      { due_date: "2026-08-22", title: "إيداع مذكرة جوابية", status: "pending", case_title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب" },
    ],
    documents: [],
  };

  // [TEST 1] اختبار نظام العمل (المادة 77 والمادة 80 ومكافأة نهاية الخدمة)
  console.log("[TEST 1] Testing Saudi Labor Law (نظام العمل والمادة 77 و 80)...");
  const laborRes = await generateBayanResponse("ما هو حكم الفصل لسبب غير مشروع بموجب المادة 77 من نظام العمل واحتساب نهاية الخدمة؟", [], mockOfficeContext);
  if (laborRes.text.includes("المادة 77") && laborRes.text.includes("المادة 84") && laborRes.citations.length > 0) {
    console.log("  ✓ Bayan cited Saudi Labor Law Articles 77 & 84 accurately!");
  } else {
    throw new Error("Labor law test failed.");
  }

  // [TEST 2] اختبار نظام الشركات الجديد ونظام الإفلاس
  console.log("[TEST 2] Testing Saudi Corporate & Bankruptcy Law (الشركات والإفلاس)...");
  const corpRes = await generateBayanResponse("ما هي مسؤولية أعضاء مجلس الإدارة في نظام الشركات وتعليق المطالبات في الإفلاس؟", [], mockOfficeContext);
  if (corpRes.text.includes("المادة 27") && corpRes.text.includes("المادة 42")) {
    console.log("  ✓ Bayan cited Corporate Article 27 & Bankruptcy Article 42 accurately!");
  } else {
    throw new Error("Corporate law test failed.");
  }

  // [TEST 3] اختبار نظام الأحوال الشخصية (الحضانة والنفقة)
  console.log("[TEST 3] Testing Saudi Personal Status Law (الأحوال الشخصية والحضانة والتركات)...");
  const personalRes = await generateBayanResponse("ما هي ضوابط أولوية الحضانة ونفقة المحضون في نظام الأحوال الشخصية؟", [], mockOfficeContext);
  if (personalRes.text.includes("المادة 125") && personalRes.text.includes("المادة 42")) {
    console.log("  ✓ Bayan cited Personal Status Articles 125 & 42 accurately!");
  } else {
    throw new Error("Personal status law test failed.");
  }

  // [TEST 4] اختبار نظام مكافحة الجرائم المعلوماتية
  console.log("[TEST 4] Testing Saudi Cybercrimes Law (جرائم المعلوماتية والتشهير)...");
  const cyberRes = await generateBayanResponse("ما هي عقوبة التشهير الإلكتروني والاحتيال المالي في نظام مكافحة جرائم المعلوماتية؟", [], mockOfficeContext);
  if (cyberRes.text.includes("المادة 3") && cyberRes.text.includes("المادة 4")) {
    console.log("  ✓ Bayan cited Cybercrimes Articles 3 & 4 accurately!");
  } else {
    throw new Error("Cybercrimes law test failed.");
  }

  // [TEST 5] اختبار قضاء التنفيذ (قرار 34 وقرار 46)
  console.log("[TEST 5] Testing Saudi Enforcement Law (نظام التنفيذ وقرار 46)...");
  const execRes = await generateBayanResponse("ما هي مهلة قرار 34 وإجراءات قرار 46 في نظام التنفيذ؟", [], mockOfficeContext);
  if (execRes.text.includes("قرار (34)") && execRes.text.includes("قرار (46)")) {
    console.log("  ✓ Bayan cited Enforcement Law decisions 34 & 46 accurately!");
  } else {
    throw new Error("Enforcement law test failed.");
  }

  // [TEST 6] اختبار استعلامات فريق المكتب (الموظف زياد)
  console.log("[TEST 6] Testing Office Team Workload Query (الموظف زياد)...");
  const teamRes = await generateBayanResponse("الموظف زياد كم قضية باقي له؟", [], mockOfficeContext);
  if (teamRes.text.includes("زياد") && teamRes.text.includes("3")) {
    console.log("  ✓ Bayan accurately tracked team member Ziad's cases!");
  } else {
    throw new Error("Team query test failed.");
  }

  // [TEST 7] اختبار حجب البيانات الشخصية
  console.log("[TEST 7] Testing Saudi PII Masking Shield...");
  const rawText = "هوية العميل 1029384756 ورقم هاتفه 0501234567 وحسابه SA4480000123608010123456";
  const masked = redactSaudiPii(rawText);
  if (!masked.includes("1029384756") && !masked.includes("0501234567") && masked.includes("[هوية محجوبة]")) {
    console.log("  ✓ Saudi PII successfully shielded & anonymized!");
  } else {
    throw new Error("PII masking failed.");
  }

  console.log("\n================================================================================");
  console.log("🎉 ALL 7 SAUDI LEGAL DOMAINS & TEAM INTELLIGENCE TESTS PASSED WITH 100% SUCCESS!");
  console.log("================================================================================");
}

runBayanMasterTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
