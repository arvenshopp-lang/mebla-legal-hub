/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN LEGAL AI COPILOT ENGINE
 * محرك المستشارة القانونية والباحثة الرقمية «المحامية بيان»
 * ==============================================================================
 */
// Dynamic supabaseAdmin loader for universal Node/Vite execution
async function getSupabaseAdmin() {
  try {
    const mod = await import("../../integrations/supabase/client.server.js");
    return mod.supabaseAdmin;
  } catch {
    const mod = await import("@/integrations/supabase/client.server");
    return mod.supabaseAdmin;
  }
}

export type BayanCitation = {
  sourceType: "statute" | "document" | "hearing" | "precedent";
  title: string;
  reference?: string;
  snippet?: string;
};

export type CaseContextData = {
  caseInfo: {
    id: string;
    case_title: string;
    case_number: string | null;
    court_name: string | null;
    circuit: string | null;
    status: string;
    claim_amount: number | null;
    client_name?: string | null;
    description: string | null;
  };
  hearings: Array<{ date: string; title: string; decision?: string | null }>;
  deadlines: Array<{ due_date: string; title: string; status: string }>;
  documents: Array<{ title: string; category?: string; extractedSnippet?: string }>;
};

/**
 * بناء وتجميع سياق القضية بالكامل من قاعدة البيانات
 */
export async function buildCaseContext(caseId: string, orgId: string): Promise<CaseContextData> {
  const supabaseAdmin = await getSupabaseAdmin();

  // 1. جلب بيانات القضية والعميل
  const { data: caseRow, error: caseErr } = await supabaseAdmin
    .from("cases")
    .select(`
      id, case_title, case_number, court_name, circuit, status, claim_amount, description,
      clients ( name )
    `)
    .eq("id", caseId)
    .eq("organization_id", orgId)
    .single();

  if (caseErr || !caseRow) {
    throw new Error("القضية غير موجودة أو ليس لديك صلاحية الوصول إليها.");
  }

  // 2. جلب الجلسات
  const { data: hearings } = await supabaseAdmin
    .from("hearings")
    .select("hearing_date, title, decision")
    .eq("case_id", caseId)
    .eq("organization_id", orgId)
    .order("hearing_date", { ascending: false })
    .limit(5);

  // 3. جلب المهل والمهام
  const { data: deadlines } = await supabaseAdmin
    .from("deadlines")
    .select("due_date, title, status")
    .eq("case_id", caseId)
    .eq("organization_id", orgId)
    .limit(5);

  // 4. جلب المستندات والنصوص المستخرجة عبر الـ OCR
  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id, title, category")
    .eq("case_id", caseId)
    .eq("organization_id", orgId)
    .limit(5);

  const documentSnippets: Array<{ title: string; category?: string; extractedSnippet?: string }> = [];

  if (docs && docs.length > 0) {
    for (const doc of docs) {
      const { data: pages } = await supabaseAdmin
        .from("document_pages")
        .select("extracted_text")
        .eq("document_id", doc.id)
        .order("page_number", { ascending: true })
        .limit(2);

      const combinedText = (pages ?? [])
        .map((p) => p.extracted_text)
        .filter(Boolean)
        .join(" ")
        .slice(0, 800);

      documentSnippets.push({
        title: doc.title,
        category: doc.category ?? undefined,
        extractedSnippet: combinedText || undefined,
      });
    }
  }

  return {
    caseInfo: {
      id: caseRow.id,
      case_title: caseRow.case_title,
      case_number: caseRow.case_number,
      court_name: caseRow.court_name,
      circuit: caseRow.circuit,
      status: caseRow.status,
      claim_amount: caseRow.claim_amount,
      client_name: (caseRow.clients as unknown as { name: string })?.name ?? null,
      description: caseRow.description,
    },
    hearings: (hearings ?? []).map((h) => ({
      date: h.hearing_date,
      title: h.title,
      decision: h.decision,
    })),
    deadlines: (deadlines ?? []).map((d) => ({
      due_date: d.due_date,
      title: d.title,
      status: d.status,
    })),
    documents: documentSnippets,
  };
}

/**
 * هندسة البرومبت المحكم للمحامية «بيان»
 */
export function buildBayanSystemPrompt(context: CaseContextData): string {
  const { caseInfo, hearings, deadlines, documents } = context;

  return `أنتِ «المحامية بيان»، المستشارة القانونية والباحثة الرقمية الذكية لمنصة «مِهلة» للمحاماة في المملكة العربية السعودية.

### ⚖️ هويتك وأسلوبك:
1. تتحدثين بصفتك محامية ومستشارة قانونية سعودية محترفة، بلغة عربية فصحى رصينة، محكمة، ووقورة.
2. ردودك مبنية بدقة فائقة على الأنظمة واللوائح والقرارات القضائية السارية في المملكة العربية السعودية (مثل: نظام المعاملات المدنية 1444هـ، نظام الإثبات 1443هـ، نظام المرافعات الشرعية، نظام المحاكم التجارية، نظام الشركات، نظام العمل، نظام التنفيذ).
3. عندما تقدمين رأياً أو دفوعاً أو توجيهاً، تذكرين السند النظامي ورقم المادة متى ما انطبقت بشكل مباشر.

### 🔒 حدود السياق والأمان الصارم (Strict Isolation):
1. أنتِ مخصصة بالكامل وبشكل حصري لهذه القضية المحددة فقط:
   - **عنوان القضية:** ${caseInfo.case_title}
   - **رقم القضية:** ${caseInfo.case_number || "غير محدد"}
   - **المحكمة والدائرة:** ${caseInfo.court_name || "غير محدد"} — ${caseInfo.circuit || "غير محدد"}
   - **الموكل:** ${caseInfo.client_name || "غير محدد"}
   - **قيمة المطالبة:** ${caseInfo.claim_amount ? `${caseInfo.claim_amount} ر.س` : "غير محددة"}
   - **ملخص الوقائع:** ${caseInfo.description || "لا يوجد ملخص مضاف"}

2. **سجل الجلسات والمواعيد:**
${hearings.length > 0 ? hearings.map((h) => `   * جلسة (${h.date}): ${h.title} ${h.decision ? `— القرار: ${h.decision}` : ""}`).join("\n") : "   * لا توجد جلسات مسجلة حالياً."}

3. **المهل والإجراءات المستحقة:**
${deadlines.length > 0 ? deadlines.map((d) => `   * مهلة (${d.due_date}): ${d.title} (الحالة: ${d.status})`).join("\n") : "   * لا توجد مهل مسجلة."}

4. **المستندات والصكوك المستخرجة (OCR):**
${documents.length > 0 ? documents.map((doc) => `   * مستند [${doc.title} (${doc.category || "عام"})]: ${doc.extractedSnippet ? `«${doc.extractedSnippet}»` : "لا يوجد نص مستخرج"}`).join("\n") : "   * لم يتم إرفاق مستندات بعد."}

### ⛔ المحظورات الصارمة:
- لا تتحدثي إطلاقاً عن أي مواضيع عامة خارج نطاق هذه القضية والقانون السعودي.
- إذا سُئلت عن أي شيء خارج هذه القضية أو عن قضايا أخرى، اعتذري بلباقة قائلة:
  «أنا مخصصة فقط لدراسة وقائع ومستندات قضية (${caseInfo.case_title}) والأنظمة السعودية المنطبقة عليها. كيف يمكنني إفادتك في مجريات هذه القضية؟»
- لا تؤلفي أو تخمني نصوص مواد وهمية؛ إذا لم تكوني متأكدة من نص مادة معينة، وجّهي بالبحث في النظام المختص.`;
}

/**
 * توليد استجابة المحامية بيان
 */
export async function generateBayanResponse(
  userQuery: string,
  history: Array<{ sender: "user" | "assistant"; content: string }>,
  context: CaseContextData,
): Promise<{ text: string; citations: BayanCitation[] }> {
  const systemPrompt = buildBayanSystemPrompt(context);
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["GEMINI_API_KEY"];

  // إذا توفر مفتاح الذكاء الاصطناعي السحابي
  if (apiKey && process.env["OPENAI_API_KEY"]) {
    try {
      const messages = [
        { role: "system", content: systemPrompt },
        ...history.slice(-8).map((m) => ({
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        })),
        { role: "user" as const, content: userQuery },
      ];

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.3,
          max_tokens: 1200,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        return {
          text,
          citations: extractCitations(text, context),
        };
      }
    } catch (err) {
      console.error("[Bayan Engine] OpenAI API request failed:", err);
    }
  }

  // المحرك القانوني الاحتياطي الذكي المدمج (Rule-based Legal Intelligence Fallback)
  const fallbackText = generateRuleBasedLegalResponse(userQuery, context);
  return {
    text: fallbackText,
    citations: extractCitations(fallbackText, context),
  };
}

function extractCitations(text: string, context: CaseContextData): BayanCitation[] {
  const citations: BayanCitation[] = [];

  if (text.includes("المعاملات المدنية")) {
    citations.push({ sourceType: "statute", title: "نظام المعاملات المدنية (1444هـ)" });
  }
  if (text.includes("الإثبات") || text.includes("نظام الإثبات")) {
    citations.push({ sourceType: "statute", title: "نظام الإثبات ولائحته التنفيذية (1443هـ)" });
  }
  if (text.includes("المرافعات الشرعية")) {
    citations.push({ sourceType: "statute", title: "نظام المرافعات الشرعية" });
  }
  if (text.includes("المحاكم التجارية")) {
    citations.push({ sourceType: "statute", title: "نظام المحاكم التجارية ولائحته التنفيذية" });
  }

  context.documents.forEach((doc) => {
    if (text.includes(doc.title)) {
      citations.push({ sourceType: "document", title: doc.title, reference: doc.category });
    }
  });

  return citations;
}

function generateRuleBasedLegalResponse(query: string, context: CaseContextData): string {
  const { caseInfo, hearings, deadlines } = context;
  const q = query.toLowerCase();

  if (
    q.includes("لخص") ||
    q.includes("تلخيص") ||
    q.includes("نبذة") ||
    q.includes("وقائع") ||
    q.includes("موقف") ||
    q.includes("تقرير")
  ) {
    return `بصفتي **المحامية بيان**، يسعدني تلخيص وقائع ومسار دعوى **«${caseInfo.case_title}»**:

* **بيانات الدعوى:** مقيدة برقم (${caseInfo.case_number || "قيد التحديد"}) لدى ${caseInfo.court_name || "المحكمة المختصة"} — ${caseInfo.circuit || "الدائرة المختصة"}.
* **الموكل:** ${caseInfo.client_name || "الطرف الممثل"}.
* **موضوع النزاع والمطالبة:** ${caseInfo.description || "مطالبة حقوقية/تجارية قائمة"}${caseInfo.claim_amount ? ` بقيمة إجمالية قدرها ${caseInfo.claim_amount.toLocaleString()} ريال سعودي.` : "."}
* **الموقف الإجرائي:** ${hearings.length > 0 ? `عُقدت آخر جلسة بتاريخ ${hearings[0].date} (${hearings[0].title}).` : "لا توجد جلسات سابقة مسجلة."}

💡 **التوجيه النظامي:** نوصي بمراجعة المذكرات المتبادلة والتحقق من اكتمال أسانيد الإثبات قبل الجلسة القادمة.`;
  }

  if (q.includes("دفوع") || q.includes("قوة") || q.includes("ضعف") || q.includes("تحليل")) {
    return `بناءً على دراسة وقائع القضية **«${caseInfo.case_title}»** ومطابقتها مع الأنظمة السعودية:

1. **الدفوع الشكلية الأولية:**
   * التحقق من الاختصاص النوعي والمكاني للمحكمة وفقاً لمواد نظام المرافعات الشرعية أو نظام المحاكم التجارية.
   * التأكد من اكتمال الصفة والأهلية والوكالة النظامية السارية.

2. **أسانيد الإثبات الموضوعية:**
   * استناداً إلى **نظام الإثبات (1443هـ)**، تُعد المحررات الموقعة ومراسلات التعاملات الإلكترونية حجة ملزمة على أطرافها.
   * عبء الإثبات يقع على مدعي الالتزام، وعلى المدعى عليه إثبات التخلص منه.

3. **التوصية الإجرائية:**
   * إيداع مذكرة جوابية تفصيلية تُفنّد ادعاءات الخصم بنداً ببند مع إرفاق المستندات كأدلة رقمية مرقمة.`;
  }

  if (q.includes("مهل") || q.includes("اعتراض") || q.includes("استئناف") || q.includes("موعد")) {
    return `بشأن المهل والمواعيد النظامية المرتبطة بقضية **«${caseInfo.case_title}»**:

* **المهل المسجلة حالياً في النظام:** ${deadlines.length > 0 ? deadlines.map((d) => `[${d.title} استحقاق: ${d.due_date}]`).join("، ") : "لا توجد مهل عاجلة مقيدة حالياً."}
* **القواعد العامة للمهل وفق النظام السعودي:**
  * ميعاد الاعتراض بطريق الاستئناف في الأحكام العادية هو **(30) يوماً**، وفي الأحكام الصادرة في المسائل المستعجلة **(10) أيام**.
  * تبدأ المهل من اليوم التالي لتسليم صورة الحكم أو إيداعه في النظام القضائي الموحد (ناجز/معين).`;
  }

  return `أهلاً بك. أنا **المحامية بيان**، أتابع معك ملف قضية **«${caseInfo.case_title}»**.

لقد اطلعت على بيانات الدعوى والأطراف والمستندات المسجلة. كيف تفضل أن أساعدك اليوم في هذه القضية؟
* 🔹 صياغة أو مراجعة الدفوع القانونية والمذكرات الجوابية.
* 🔹 تحليل نقاط القوة والضعف وأسانيد الإثبات بموجب نظام الإثبات السعودي.
* 🔹 حساب المهل ومراجعة الإجراءات المتوافقة مع المحكمة المختصة.`;
}
