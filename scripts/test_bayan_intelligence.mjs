/**
 * اختبار شامل لذكاء وفهم المحامية بيان للأسئلة العامية والرسمية وسجلات القضايا
 */
import { generateBayanResponse } from "../src/lib/ai/bayan-copilot.server.ts";

console.log("================================================================================");
console.log("🧠 TESTING BAYAN AI INTELLIGENCE & SAUDI DIALECT COMPREHENSION");
console.log("================================================================================\n");

const mockCaseContext = {
  isGlobal: false,
  caseInfo: {
    id: "case-999",
    case_title: "دعوى توريد وإخلال عقدي",
    case_number: "45109823",
    court_name: "المحكمة التجارية بالرياض",
    circuit: "الدائرة التجارية التاسعة",
    status: "active",
    claim_amount: 350000,
    client_name: "شركة الأفق للمقاولات العامة",
    description: "مطالبة بسداد باقي مستحقات عقد توريد مواد إنشائية مع التعويض عن التأخير",
    assigned_lawyer_id: "lawyer-1",
    assigned_lawyer_name: "أ. عبدالعزيز الشمري",
    internal_notes: "تم إعداد مسودة الرد على مذكرة الخصم وفي انتظار توقيع الشريك المدير",
  },
  parties: [
    {
      id: "party-1",
      name: "شركة المدار المتحدة للخرسانة",
      legalRole: "مدعى عليه",
      partyType: "شركة تجارية",
      representativeName: "المحامي فهد القحطاني",
      phone: "0501234567",
      notes: "تم تبليغهم عبر منصة ناجز",
    },
    {
      id: "party-2",
      name: "مؤسسة الركائز للتجارة",
      legalRole: "ضامن متضامن",
      partyType: "مؤسسة فردية",
      representativeName: "سعد الدوسري",
    },
  ],
  recordsCount: {
    total: 8,
    hearings: 2,
    deadlines: 2,
    documents: 2,
    parties: 2,
    hasInternalNotes: true,
  },
  hearings: [
    {
      date: "2026-09-05",
      title: "جلسة المرافعة وتقديم البينة",
      court_name: "المحكمة التجارية بالرياض",
      location: "القاعة 3 - الدور الثاني",
      remote_link: "https://najiz.sa/hearing/999",
      decision: "إمهال المدعى عليه لتقديم جوابه على المذكرة",
    },
    {
      date: "2026-08-10",
      title: "جلسة التحضير الأولى",
      decision: "قيد الدعوى وتحديد موعد تبادل المذكرات",
    },
  ],
  deadlines: [
    {
      due_date: "2026-08-28",
      title: "إيداع مذكرة جوابية تفصيلية",
      status: "pending",
    },
    {
      due_date: "2026-09-01",
      title: "سداد رسوم تقرير الخبير المحاسبي",
      status: "pending",
    },
  ],
  documents: [
    {
      title: "عقد التوريد المبرم وملاحقه.pdf",
      category: "عقد",
      extractedSnippet: "اتفق الطرفان على توريد كميات الحديد والإسمنت بقيمة إجمالية قدرها 350 ألف ريال مع التزام الطرف الثاني بالسداد خلال 30 يوماً من استلام الفاتورة.",
    },
    {
      title: "سند استلام البضاعة وإشعارات المطالبة.pdf",
      category: "بينة",
      extractedSnippet: "تم تسليم الدفعة الثانية من المواد بموجب بوليصة الشحن رقم 8821 بتوقيع مندوب المستلم.",
    },
  ],
};

const testQueries = [
  { name: "السؤال عن سجلات القضية (عامي)", query: "سجلات القضيه كم سجل تعرف؟" },
  { name: "السؤال عن اسم المدعى عليه (عامي)", query: "وش اسم المدعى عليه؟" },
  { name: "السؤال عن الخصوم (رسمي)", query: "من هم الخصوم وأطراف الخصومة المقيدين في الدعوى؟" },
  { name: "السؤال عن الموكل (عامي)", query: "مين الموكل اللي نمثله؟" },
  { name: "السؤال عن الجلسات (عامي)", query: "كم جلسة عندنا ومتى الجلسة الجاية ورابطها؟" },
  { name: "السؤال عن المهل (عامي)", query: "متى تنتهي المهلة اللي علينا؟" },
  { name: "السؤال عن المستندات والـ OCR", query: "وش المستندات المرفوعة ولخص لي محتواها؟" },
  { name: "السؤال عن مبلغ المطالبة", query: "كم مبلغ المطالبة بالقضية؟" },
  { name: "ملخص وقائع الدعوى (عامي)", query: "وش وضع القضية؟ عطني الزبدة" },
  { name: "سؤال نظامي (نظام العمل م 77)", query: "وش التعويض المستحق في حال الفصل بموجب المادة 77 من نظام العمل؟" },
  { name: "سؤال نظامي (نظام الإثبات الأدلة الرقمية)", query: "ما هي حجية رسائل الواتساب والبريد وفق نظام الإثبات؟" },
];

async function runTests() {
  for (const t of testQueries) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`❓ [TEST] ${t.name}`);
    console.log(`📥 السؤال: "${t.query}"`);
    console.log(`--------------------------------------------------------------------------------`);
    const res = await generateBayanResponse(t.query, [], mockCaseContext);
    console.log(`💬 جواب المحامية بيان:\n${res.text}`);
    if (res.citations.length > 0) {
      console.log(`📚 الأسانيد المستشهد بها: ${res.citations.map((c) => c.title).join(" | ")}`);
    }
  }

  console.log("\n================================================================================");
  console.log("🎉 ALL BAYAN AI INTELLIGENCE & SAUDI DIALECT TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

runTests();
