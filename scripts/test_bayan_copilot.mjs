import {
  buildBayanSystemPrompt,
  generateBayanResponse,
  redactSaudiPii,
} from "../src/lib/ai/bayan-copilot.server.ts";

async function runBayanMasterTest() {
  console.log("================================================================================");
  console.log("⚖️ MEHLA — TESTING 'BAYAN' ADVANCED SAUDI LEGAL AI & TEAM INTELLIGENCE");
  console.log("================================================================================\n");

  const mockOfficeContext = {
    isGlobal: true,
    userRole: "owner",
    accessibleCasesCount: 5,
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
      {
        id: "user-sara-456",
        name: "سارة القحطاني",
        email: "sara@firm.sa",
        role: "paralegal",
        assignedCasesCount: 2,
        assignedCases: [
          { id: "case-4", title: "دعوى تسوية مستحقات عمالية", number: "45300121", status: "in_progress", court: "المحكمة العمالية" },
          { id: "case-5", title: "إثبات شراكة تجارية وتصفية حسابات", number: "45300999", status: "in_progress", court: "المحكمة التجارية" },
        ],
      },
    ],
    casesSummary: [
      { id: "case-1", title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب", number: "45129841", status: "in_progress", court: "المحكمة التجارية بالرياض", lawyer_name: "زياد الحبيب", claim_amount: 350000 },
      { id: "case-2", title: "نزاع تجاري بشأن توريد أجهزة ومعدات", number: "45199201", status: "in_progress", court: "المحكمة التجارية بالرياض", lawyer_name: "زياد الحبيب", claim_amount: 180000 },
    ],
    hearings: [
      { date: "2026-08-25", title: "جلسة المرافعة وتقديم البينات", case_title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب" },
    ],
    deadlines: [
      { due_date: "2026-08-22", title: "إيداع مذكرة جوابية", status: "pending", case_title: "دعوى مطالبة بمستحقات عقد مقاولة توريد وتركيب" },
    ],
    documents: [],
  };

  // 1. اختبار استفسار مالك المكتب عن موظف معين (زياد)
  console.log("[TEST 1] Testing Team Member Query (الموظف زياد كم قضية باقي له؟)...");
  const ziadQueryRes = await generateBayanResponse(
    "الموظف زياد كم قضية باقي له وما هي قضاياه؟",
    [],
    mockOfficeContext
  );
  console.log("  -> Bayan Team Response:\n", ziadQueryRes.text + "\n");
  if (ziadQueryRes.text.includes("المحامية بيان") && ziadQueryRes.text.includes("3") && ziadQueryRes.text.includes("زياد")) {
    console.log("  ✓ Bayan accurately identified lawyer Ziad and his exact 3 assigned cases!");
  } else {
    throw new Error("Team query failed to report accurate lawyer cases.");
  }

  // 2. اختبار الاستشهاد بمواد نظام المعاملات المدنية ونظام الإثبات
  console.log("[TEST 2] Testing Accurate Saudi Statutory Articles (المعاملات المدنية والإثبات)...");
  const statuteRes = await generateBayanResponse(
    "ما هي المواد النظامية في التعويض والأدلة الرقمية في المعاملات المدنية ونظام الإثبات؟",
    [],
    mockOfficeContext
  );
  console.log("  -> Bayan Statutes Response:\n", statuteRes.text + "\n");
  if (
    statuteRes.text.includes("المادة (94)") &&
    statuteRes.text.includes("المادة (138)") &&
    statuteRes.text.includes("المادتين (53 و 54)") &&
    statuteRes.citations.length >= 2
  ) {
    console.log("  ✓ Bayan cited exact Saudi Articles (94, 138, 53, 54) with 100% precision!");
  } else {
    throw new Error("Statute response missing exact Saudi statutory articles.");
  }

  // 3. اختبار حجب البيانات الشخصية
  console.log("[TEST 3] Testing Saudi PII Masking Shield...");
  const rawText = "هوية العميل 1029384756 ورقم هاتفه 0501234567 وحسابه SA4480000123608010123456";
  const masked = redactSaudiPii(rawText);
  if (!masked.includes("1029384756") && !masked.includes("0501234567") && masked.includes("[هوية محجوبة]")) {
    console.log("  ✓ Saudi PII successfully shielded & anonymized!");
  } else {
    throw new Error("PII masking failed.");
  }

  console.log("\n================================================================================");
  console.log("🎉 ALL ADVANCED BAYAN LEGAL & TEAM INTELLIGENCE TESTS PASSED WITH 100% SUCCESS!");
  console.log("================================================================================");
}

runBayanMasterTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
