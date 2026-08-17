/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN LEGAL AI COPILOT ENGINE
 * محرك المستشارة القانونية والباحثة الرقمية «المحامية بيان»
 * يشمل: درع تعمية الهويات (PII Masking) + مصفوفة الصلاحيات (RBAC) + الاستشارة الشاملة
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

/**
 * دالة تعمية وحجب البيانات الشخصية الحساسة (Saudi PII Anonymization)
 * تضمن عدم إرسال أي هوية وطنية أو رقم هاتف أو آيبان بنكي لأي نموذج ذكاء اصطناعي
 */
export function redactSaudiPii(text: string | null | undefined): string {
  if (!text) return "";
  let sanitized = String(text);

  // 1. تعمية أرقام الهويات الوطنية والإقامات السعودية (10 أرقام تبدأ بـ 1 أو 2)
  sanitized = sanitized.replace(/\b([12])\d{7}(\d{2})\b/g, "$1*******$2 [هوية محجوبة]");

  // 2. تعمية أرقام الجوالات السعودية
  sanitized = sanitized.replace(/\b(\+?966|0)?5\d{6}(\d{2})\b/g, "05******$2 [جوال محجوب]");

  // 3. تعمية أرقام الآيبان والحسابات البنكية (SA...)
  sanitized = sanitized.replace(/\bSA\d{2}[A-Za-z0-9]{16}(\d{4})\b/gi, "SA****************$1 [آيبان محجوب]");

  // 4. تعمية عناوين البريد الإلكتروني الشخصية
  sanitized = sanitized.replace(/([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]+@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, "$1***@$2 [بريد محجوب]");

  return sanitized;
}

export type CaseContextData = {
  isGlobal?: boolean;
  userRole?: string;
  accessibleCasesCount?: number;
  caseInfo?: {
    id: string;
    case_title: string;
    case_number: string | null;
    court_name: string | null;
    circuit: string | null;
    status: string;
    claim_amount: number | null;
    client_name?: string | null;
    description: string | null;
    assigned_lawyer_id?: string | null;
  };
  hearings: Array<{ date: string; title: string; decision?: string | null; case_title?: string }>;
  deadlines: Array<{ due_date: string; title: string; status: string; case_title?: string }>;
  documents: Array<{ title: string; category?: string; extractedSnippet?: string }>;
  casesSummary?: Array<{ id: string; title: string; number: string | null; status: string; court: string | null }>;
};

/**
 * التحقق من صلاحيات المستخدم في المنظمة وعلى القضية (RBAC)
 */
export async function checkCaseAccess(
  userId: string,
  orgId: string,
  caseId?: string | null,
): Promise<{ allowed: boolean; role: string; reason?: string }> {
  const supabaseAdmin = await getSupabaseAdmin();

  // 1. التحقق من عضوية ودور المستخدم في المنظمة
  const { data: member, error: memberErr } = await supabaseAdmin
    .from("organization_members")
    .select("role, status")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // إذا لم يكن مسجلاً في organization_members أو كان المالك الأول
  let userRole = member?.role || "lawyer";
  if (!member) {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();

    if (!org) {
      return { allowed: false, role: "none", reason: "المكتب غير موجود أو ليس لديك صلاحية وصول." };
    }
  }

  // المالك والمدير (Owner & Admin) يملكان صلاحية مطلقة على جميع قضايا المكتب
  if (userRole === "owner" || userRole === "admin") {
    return { allowed: true, role: userRole };
  }

  // في حال الاستشارة العامة عن قضايا المكتب المسندة له
  if (!caseId || caseId === "global") {
    return { allowed: true, role: userRole };
  }

  // بالنسبة للمحامي أو الموظف، نتحقق من إسناد القضية إليه
  const { data: caseRow } = await supabaseAdmin
    .from("cases")
    .select("id, assigned_lawyer_id, organization_id")
    .eq("id", caseId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!caseRow) {
    return { allowed: false, role: userRole, reason: "القضية غير موجودة في هذا المكتب." };
  }

  // إذا كانت القضية مسندة له أو لم يتم تقييدها
  if (caseRow.assigned_lawyer_id === userId || !caseRow.assigned_lawyer_id) {
    return { allowed: true, role: userRole };
  }

  return {
    allowed: false,
    role: userRole,
    reason: "عذراً زميلي الكريم، لستَ مخولاً بالاطلاع على بيانات هذه القضية وفق مصفوفة صلاحيات المكتب؛ حيث إن صلاحياتك مقتصرة على القضايا المسندة إليك فقط. يرجى مراجعة إدارة المكتب لمنحك الصلاحية.",
  };
}

/**
 * بناء وتجميع سياق القضية بالكامل من قاعدة البيانات
 */
export async function buildCaseContext(
  caseId: string,
  orgId: string,
  userId?: string,
): Promise<CaseContextData> {
  const supabaseAdmin = await getSupabaseAdmin();

  // وضع الاستشارة العامة على مستوى المنصة
  if (!caseId || caseId === "global") {
    return buildOfficeWideContext(orgId, userId);
  }

  // 1. جلب بيانات القضية والعميل مع تصحيح أسماء الحقول
  const { data: caseRow, error: caseErr } = await supabaseAdmin
    .from("cases")
    .select(`
      id, case_title, case_number, court_name, judicial_circuit, status, claim_amount, description, assigned_lawyer_id,
      client:clients ( id, full_name )
    `)
    .eq("id", caseId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (caseErr || !caseRow) {
    console.error("[Bayan Engine] Case fetch error:", caseErr);
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

      const combinedText = redactSaudiPii(
        (pages ?? [])
          .map((p) => p.extracted_text)
          .filter(Boolean)
          .join(" ")
          .slice(0, 800)
      );

      documentSnippets.push({
        title: doc.title,
        category: doc.category ?? undefined,
        extractedSnippet: combinedText || undefined,
      });
    }
  }

  return {
    isGlobal: false,
    caseInfo: {
      id: caseRow.id,
      case_title: caseRow.case_title,
      case_number: caseRow.case_number,
      court_name: caseRow.court_name,
      circuit: caseRow.judicial_circuit,
      status: caseRow.status,
      claim_amount: caseRow.claim_amount,
      client_name: redactSaudiPii((caseRow.client as unknown as { full_name: string })?.full_name ?? null),
      description: redactSaudiPii(caseRow.description),
      assigned_lawyer_id: caseRow.assigned_lawyer_id,
    },
    hearings: (hearings ?? []).map((h) => ({
      date: h.hearing_date,
      title: h.title,
      decision: redactSaudiPii(h.decision),
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
 * بناء سياق المكتب الشامل للاستشارات العامة في جميع قضايا المنصة وفق الصلاحيات
 */
export async function buildOfficeWideContext(
  orgId: string,
  userId?: string,
): Promise<CaseContextData> {
  const supabaseAdmin = await getSupabaseAdmin();

  // 1. جلب دور المستخدم
  let role = "owner";
  if (userId) {
    const { data: member } = await supabaseAdmin
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (member) role = member.role;
  }

  // 2. جلب القضايا المتاحة للمستخدم (الكل للمالك/المدير، أو المسندة فقط للمحامي)
  let casesQuery = supabaseAdmin
    .from("cases")
    .select("id, case_title, case_number, status, court_name, assigned_lawyer_id")
    .eq("organization_id", orgId)
    .limit(30);

  if (role !== "owner" && role !== "admin" && userId) {
    casesQuery = casesQuery.or(`assigned_lawyer_id.eq.${userId},assigned_lawyer_id.is.null`);
  }

  const { data: casesList } = await casesQuery;

  // 3. جلب الجلسات القادمة
  const { data: upcomingHearings } = await supabaseAdmin
    .from("hearings")
    .select("hearing_date, title, decision, cases(case_title)")
    .eq("organization_id", orgId)
    .order("hearing_date", { ascending: true })
    .limit(10);

  // 4. جلب المهل العاجلة
  const { data: activeDeadlines } = await supabaseAdmin
    .from("deadlines")
    .select("due_date, title, status, cases(case_title)")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("due_date", { ascending: true })
    .limit(10);

  return {
    isGlobal: true,
    userRole: role,
    accessibleCasesCount: (casesList ?? []).length,
    casesSummary: (casesList ?? []).map((c) => ({
      id: c.id,
      title: c.case_title,
      number: c.case_number,
      status: c.status,
      court: c.court_name,
    })),
    hearings: (upcomingHearings ?? []).map((h) => ({
      date: h.hearing_date,
      title: h.title,
      decision: redactSaudiPii(h.decision),
      case_title: (h.cases as unknown as { case_title: string })?.case_title,
    })),
    deadlines: (activeDeadlines ?? []).map((d) => ({
      due_date: d.due_date,
      title: d.title,
      status: d.status,
      case_title: (d.cases as unknown as { case_title: string })?.case_title,
    })),
    documents: [],
  };
}

/**
 * هندسة البرومبت المحكم للمحامية «بيان»
 */
export function buildBayanSystemPrompt(context: CaseContextData): string {
  const { isGlobal, caseInfo, hearings, deadlines, documents, casesSummary, userRole, accessibleCasesCount } = context;

  if (isGlobal) {
    return `أنتِ «المحامية بيان»، مستشارة قانونية وباحثة قضائية سعودية مؤهلة، والعقل الاستشاري الرقمي الذكي لكافة أعمال ومكتب منصة «مِهلة».

### ⚖️ هويتك وصفتك المهنية (المحامية بيان):
1. **أنتِ أنثى**، وتتحدثين بصيغة المتكلم المؤنث الوقور والمحترم («قمتُ بمراجعة السجلات»، «يسرّني تقديم المشورة»، «يتبيّن لي من واقع ملفات القضايا»، «أوصي بالإجراء النظامي...»).
2. أنتِ في وضع «المساعد القانوني العام للمكتب»، وتملكين رؤية شاملة على القضايا والجلسات والمهل المتاحة لهذا المستخدم (بصلاحية: ${userRole === "owner" ? "مالك المكتب (صلاحيات كاملة على كافة القضايا)" : userRole === "admin" ? "مدير النظام" : "محامي/موظف (القضايا المسندة لملفه فقط)"}).
3. عدد القضايا المخول له الاطلاع عليها: (${accessibleCasesCount || 0} قضية).

### 📋 قائمة القضايا المتاحة في سجل المكتب:
${casesSummary && casesSummary.length > 0 ? casesSummary.map((c) => `* [${c.title}] - رقم: (${c.number || "غير محدد"}) - المحكمة: (${c.court || "عامة"}) - الحالة: (${c.status})`).join("\n") : "* لا توجد قضايا مقيدة حالياً."}

### 📅 الجلسات والمواعيد القادمة في المكتب:
${hearings.length > 0 ? hearings.map((h) => `* [${h.case_title || "قضية"}]: جلسة (${h.date}) — ${h.title}`).join("\n") : "* لا توجد جلسات مجدولة قريباً."}

### ⏱️ المهل والإجراءات المستحقة:
${deadlines.length > 0 ? deadlines.map((d) => `* [${d.case_title || "قضية"}]: مهلة (${d.due_date}) — ${d.title}`).join("\n") : "* لا توجد مهل عاجلة."}

### 🔒 مصفوفة الصلاحيات والأمان:
- إذا سأل المستخدم عن قضية غير موجودة في القائمة المتاحة أعلاه وهو ليس مالكاً للمكتب، وضّحي بأدب:
  «عذراً زميلي الكريم، هذه القضية غير مسندة لملفك وفق مصفوفة صلاحيات المكتب، ويرجى مراجعة إدارة المكتب لمنحك الصلاحية.»
- ردودك مبنية بدقة على الأنظمة السعودية (المعاملات المدنية، الإثبات، المرافعات، المحاكم التجارية، العمل، التنفيذ).`;
  }

  // برومبت القضية المحددة
  return `أنتِ «المحامية بيان»، مستشارة قانونية وباحثة قضائية سعودية مؤهلة تأهيلاً رفيعاً، والعقل الاستشاري القانوني الذكي لمنصة «مِهلة» للمحاماة في المملكة العربية السعودية.

### ⚖️ هويتك وصفتك المهنية (المحامية بيان):
1. **أنتِ أنثى**، وتتحدثين بصيغة المتكلم المؤنث الوقور («قمتُ بدراسة ملف الدعوى»، «يسرّني تقديم المشورة والمساعدة»، «يتبيّن لي بعد فحص المستندات»، «أوصي بإيداع مذكرة جوابية...»).
2. لغتك وأسلوبك: لغة عربية فصحى رصينة، بليغة، واثقة، ومحكمة الصياغة، تليق بكبرى مكاتب المحاماة في المملكة العربية السعودية.
3. ردودك مبنية بدقة فائقة على الأنظمة واللوائح والقرارات القضائية السارية في المملكة العربية السعودية (مثل: نظام المعاملات المدنية 1444هـ، نظام الإثبات 1443هـ، نظام المرافعات الشرعية، نظام المحاكم التجارية ولائحته التنفيذية، نظام الشركات، نظام العمل، نظام التنفيذ).
4. عندما تقدمين رأياً أو دفوعاً أو توجيهاً، تذكرين السند النظامي ورقم المادة متى ما انطبقت بشكل مباشر.

### 🔒 حدود السياق والأمان الصارم (Strict Isolation):
1. أنتِ مخصصة بالكامل وبشكل حصري لهذه القضية المحددة فقط:
   - **عنوان القضية:** ${caseInfo?.case_title || "غير محدد"}
   - **رقم القضية:** ${caseInfo?.case_number || "غير محدد"}
   - **المحكمة والدائرة:** ${caseInfo?.court_name || "غير محدد"} — ${caseInfo?.circuit || "غير محدد"}
   - **الموكل:** ${caseInfo?.client_name || "غير محدد"}
   - **قيمة المطالبة:** ${caseInfo?.claim_amount ? `${caseInfo.claim_amount} ر.س` : "غير محددة"}
   - **ملخص الوقائع:** ${caseInfo?.description || "لا يوجد ملخص مضاف"}

2. **سجل الجلسات والمواعيد:**
${hearings.length > 0 ? hearings.map((h) => `   * جلسة (${h.date}): ${h.title} ${h.decision ? `— القرار: ${h.decision}` : ""}`).join("\n") : "   * لا توجد جلسات مسجلة حالياً."}

3. **المهل والإجراءات المستحقة:**
${deadlines.length > 0 ? deadlines.map((d) => `   * مهلة (${d.due_date}): ${d.title} (الحالة: ${d.status})`).join("\n") : "   * لا توجد مهل مسجلة."}

4. **المستندات والصكوك المستخرجة (OCR):**
${documents.length > 0 ? documents.map((doc) => `   * مستند [${doc.title} (${doc.category || "عام"})]: ${doc.extractedSnippet ? `«${doc.extractedSnippet}»` : "لا يوجد نص مستخرج"}`).join("\n") : "   * لم يتم إرفاق مستندات بعد."}

### ⛔ المحظورات الصارمة:
- لا تتحدثي إطلاقاً عن أي مواضيع عامة خارج نطاق هذه القضية والقانون السعودي.
- إذا سُئلت عن أي شيء خارج هذه القضية أو عن قضايا أخرى، اعتذري بلباقة قائلة:
  «أنا مخصصة فقط لدراسة وقائع ومستندات قضية (${caseInfo?.case_title}) والأنظمة السعودية المنطبقة عليها. كيف يمكنني إفادتك في مجريات هذه القضية؟»
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
  const { isGlobal, caseInfo, hearings, deadlines, casesSummary } = context;
  const q = query.toLowerCase();

  // الردود في الوضع العام للمكتب
  if (isGlobal) {
    if (q.includes("جلسات") || q.includes("مواعيد")) {
      return `بصفتي **المحامية بيان**، يسرّني استعراض جدول الجلسات القضائية القادمة في المكتب:

${hearings.length > 0 ? hearings.map((h) => `* 🏛️ **[${h.case_title || "قضية"}]:** موعد الجلسة (${h.date}) — *${h.title}*`).join("\n") : "* لا توجد جلسات قادمة مسجلة في النظام حالياً."}

💡 **التوجيه النظامي:** نوصي بمراجعة مذكرات الدفاع والتأكد من إيداع أصول المستندات قبل موعد الجلسة بـ (3) أيام على الأقل.`;
    }

    if (q.includes("قضايا") || q.includes("حصر") || q.includes("عدد")) {
      return `معك **المحامية بيان**، بناءً على صلاحياتك في المكتب، يبلغ إجمالي القضايا المتاحة في سجلك **(${casesSummary?.length || 0}) قضية**:

${casesSummary && casesSummary.length > 0 ? casesSummary.slice(0, 8).map((c) => `* 📁 **${c.title}** (رقم: ${c.number || "غير مقيد"}) — *${c.court || "المحكمة المختصة"}*`).join("\n") : "* لا توجد قضايا مقيدة حالياً."}

يمكنك سؤالي عن أي قضية بالاسم أو الرقم لتزويدك بتقرير وتكييف قانوني تفصيلي.`;
    }

    return `السلام عليكم ورحمة الله. معك **المحامية بيان**، المستشارة القانونية لمنصة «مِهلة».

أنا معك لمساندتك في كافة أعمال المكتب القضائية:
* 🔹 الاستفسار عن تفاصيل ووقائع أي قضية في المكتب.
* 🔹 استعراض الجلسات القضائية القادمة ومتابعة قرارات الدوائر.
* 🔹 متابعة المهل النظامية ومواعيد الاعتراض والاستئناف.
* 🔹 الاستشارة والبحث في الأنظمة السعودية (المعاملات المدنية، الإثبات، المرافعات، والشركات).`;
  }

  // الردود في وضع القضية المحددة
  if (
    q.includes("لخص") ||
    q.includes("تلخيص") ||
    q.includes("نبذة") ||
    q.includes("وقائع") ||
    q.includes("موقف") ||
    q.includes("تقرير")
  ) {
    return `بصفتي **المحامية بيان**، يسعدني تقديم تلخيص قانوني ومحكم لمسار دعوى **«${caseInfo?.case_title}»**:

* **بيانات الدعوى:** مقيدة برقم (${caseInfo?.case_number || "قيد التحديد"}) لدى ${caseInfo?.court_name || "المحكمة المختصة"} — ${caseInfo?.circuit || "الدائرة القضائية المختصة"}.
* **الموكل الممثل:** ${caseInfo?.client_name || "الطرف الممثل"}.
* **موضوع النزاع والمطالبة:** ${caseInfo?.description || "مطالبة حقوقية/تجارية قائمة"}${caseInfo?.claim_amount ? ` بقيمة إجمالية قدرها ${caseInfo.claim_amount.toLocaleString()} ريال سعودي.` : "."}
* **الموقف الإجرائي الحالي:** ${hearings.length > 0 ? `عُقدت آخر جلسة بتاريخ ${hearings[0].date} (${hearings[0].title}).` : "لا توجد جلسات سابقة مسجلة."}

💡 **التوجيه النظامي والتوصية:** أوصي بمراجعة المذكرات المتبادلة واستكمال إيداع حصر أسانيد الإثبات قبل موعد الجلسة القادمة تفادياً لسقوط الحق في الدفع.`;
  }

  if (q.includes("دفوع") || q.includes("قوة") || q.includes("ضعف") || q.includes("تحليل")) {
    return `بعد دراستي المتأنية لوقائع قضية **«${caseInfo?.case_title}»** ومطابقتها مع الأنظمة القضائية السعودية، أرفع إليكم الرأي والتحليل التالي:

1. **الدفوع الشكلية الأولية:**
   * التحقق من الاختصاص النوعي والمكاني للدائرة وفقاً لأحكام نظام المرافعات الشرعية ونظام المحاكم التجارية.
   * فحص سريان وصحة الوكالة والصفة النظامية لكافة الأطراف.

2. **أسانيد الإثبات الموضوعية:**
   * استناداً إلى **نظام الإثبات (1443هـ)**، تُعد المحررات الموقعة والمراسلات والتعاملات الإلكترونية الموثقة حجة قاطعة وملزمة على أطرافها.
   * يقع عبء الإثبات على مدعي الالتزام، وعلى المدعى عليه إثبات براءة ذمته أو انقضاء الالتزام بموجب نظام المعاملات المدنية.

3. **التوصية الإجرائية:**
   * أوصي بصياغة مذكرة جوابية تفصيلية تُفنّد ادعاءات الخصم بنداً ببند، مع إرفاق المستندات كأدلة رقمية مسبوقة بجدول فهرسة بيّنات.`;
  }

  if (q.includes("مهل") || q.includes("اعتراض") || q.includes("استئناف") || q.includes("موعد")) {
    return `بشأن المهل والمواعيد الإجرائية المرتبطة بدعوى **«${caseInfo?.case_title}»**، يسرّني إحاطتكم بالقواعد النظامية السارية:

* **المهل المسجلة حالياً في ملف القضية:** ${deadlines.length > 0 ? deadlines.map((d) => `[${d.title} — تاريخ الاستحقاق: ${d.due_date}]`).join("، ") : "لا توجد مهل عاجلة مقيدة حالياً."}
* **القواعد العامة للمهل وفق النظام القضائي السعودي:**
  * ميعاد الاعتراض بطريق الاستئناف في الأحكام الصادرة في الدعاوى العادية هو **(30) يوماً**، وفي الأحكام الصادرة في المسائل المستعجلة **(10) أيام**.
  * يبدأ سريان المهلة من اليوم التالي لتسليم صورة صك الحكم أو إيداعه في البوابة القضائية (ناجز/معين).`;
  }

  return `السلام عليكم ورحمة الله. معك **المحامية بيان**، أتابع معك ملف قضية **«${caseInfo?.case_title}»**.

لقد اطلعتُ على كامل وقائع الدعوى وبيانات الأطراف والمستندات المسجلة. كيف تفضل أن أباشر مساندتك اليوم؟
* 🔹 صياغة ومراجعة الدفوع القانونية والمذكرات الجوابية.
* 🔹 تحليل نقاط القوة والضعف وأسانيد الإثبات وفق أحكام الأنظمة السعودية.
* 🔹 احتساب المهل الإجرائية ومراجعة مواعيد الطعن والاستئناف.`;
}
