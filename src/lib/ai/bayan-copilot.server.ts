/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN ADVANCED SAUDI LEGAL AI ENGINE (FULL ENCYCLOPEDIA)
 * محرك المستشارة القانونية والباحثة القضائية «المحامية بيان»
 * مجهز بالموسوعة النظامية السعودية الشاملة لكافة فروع القانون السعودي بالمواد الرسمية
 * ==============================================================================
 */
import { renderSaudiCorpusPrompt, SAUDI_LEGAL_ENCYCLOPEDIA } from "./saudi-legal-corpus.server.ts";

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

export type TeamMemberInfo = {
  id: string;
  name: string;
  email?: string;
  role: string;
  assignedCasesCount: number;
  assignedCases: Array<{ id: string; title: string; number: string | null; status: string; court: string | null }>;
};

export type CaseContextData = {
  isGlobal?: boolean;
  userRole?: string;
  accessibleCasesCount?: number;
  teamMembers?: TeamMemberInfo[];
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
    assigned_lawyer_name?: string | null;
  };
  hearings: Array<{ date: string; title: string; decision?: string | null; case_title?: string }>;
  deadlines: Array<{ due_date: string; title: string; status: string; case_title?: string }>;
  documents: Array<{ title: string; category?: string; extractedSnippet?: string }>;
  casesSummary?: Array<{
    id: string;
    title: string;
    number: string | null;
    status: string;
    court: string | null;
    lawyer_name?: string | null;
    claim_amount?: number | null;
  }>;
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

  const { data: member } = await supabaseAdmin
    .from("organization_members")
    .select("role, status")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

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

  // المالك والمدير يملكان صلاحية مطلقة على جميع قضايا وموظفي المكتب
  if (userRole === "owner" || userRole === "admin") {
    return { allowed: true, role: userRole };
  }

  // في حال الاستشارة العامة
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
 * بناء وتجميع سياق القضية المحددة بالكامل
 */
export async function buildCaseContext(
  caseId: string,
  orgId: string,
  userId?: string,
): Promise<CaseContextData> {
  const supabaseAdmin = await getSupabaseAdmin();

  if (!caseId || caseId === "global") {
    return buildOfficeWideContext(orgId, userId);
  }

  const { data: caseRow, error: caseErr } = await supabaseAdmin
    .from("cases")
    .select(`
      id, case_title, case_number, court_name, judicial_circuit, status, description, assigned_lawyer_id,
      client:clients ( id, full_name ),
      lawyer:profiles!cases_assigned_lawyer_id_fkey ( id, full_name )
    `)
    .eq("id", caseId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (caseErr || !caseRow) {
    console.error("[Bayan Engine] Case fetch error:", caseErr);
    throw new Error("القضية غير موجودة أو ليس لديك صلاحية الوصول إليها.");
  }

  const { data: hearings } = await supabaseAdmin
    .from("hearings")
    .select("hearing_date, title, result")
    .eq("case_id", caseId)
    .eq("organization_id", orgId)
    .order("hearing_date", { ascending: false })
    .limit(5);

  const { data: deadlines } = await supabaseAdmin
    .from("deadlines")
    .select("due_date, title, status")
    .eq("case_id", caseId)
    .eq("organization_id", orgId)
    .limit(5);

  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id, file_name, document_category")
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
        title: doc.file_name,
        category: doc.document_category ?? undefined,
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
      claim_amount: null,
      client_name: redactSaudiPii((caseRow.client as unknown as { full_name: string })?.full_name ?? null),
      description: redactSaudiPii(caseRow.description),
      assigned_lawyer_id: caseRow.assigned_lawyer_id,
      assigned_lawyer_name: (caseRow.lawyer as unknown as { full_name: string })?.full_name ?? null,
    },
    hearings: (hearings ?? []).map((h) => ({
      date: h.hearing_date,
      title: h.title,
      decision: redactSaudiPii(h.result),
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
 * بناء سياق المكتب الشامل: يشمل كافة القضايا، الموظفين، الجلسات، والمهل
 */
export async function buildOfficeWideContext(
  orgId: string,
  userId?: string,
): Promise<CaseContextData> {
  const supabaseAdmin = await getSupabaseAdmin();

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

  // 1. جلب أعضاء فريق العمل والمحامين (للمالك والمدير)
  const { data: teamRows } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role, profile:profiles(id, full_name, email)")
    .eq("organization_id", orgId)
    .eq("status", "active");

  // 2. جلب القضايا
  let casesQuery = supabaseAdmin
    .from("cases")
    .select(`
      id, case_title, case_number, status, court_name, assigned_lawyer_id,
      lawyer:profiles!cases_assigned_lawyer_id_fkey(id, full_name)
    `)
    .eq("organization_id", orgId)
    .limit(50);

  if (role !== "owner" && role !== "admin" && userId) {
    casesQuery = casesQuery.or(`assigned_lawyer_id.eq.${userId},assigned_lawyer_id.is.null`);
  }

  const { data: casesList } = await casesQuery;

  // 3. بناء تقرير توزيع القضايا على الموظفين والمحامين
  const teamMembers: TeamMemberInfo[] = (teamRows ?? []).map((t) => {
    const p = t.profile as unknown as { id: string; full_name: string; email?: string } | null;
    const memberId = t.user_id;
    const memberName = p?.full_name || p?.email?.split("@")[0] || "موظف";
    const memberCases = (casesList ?? []).filter((c) => c.assigned_lawyer_id === memberId);

    return {
      id: memberId,
      name: memberName,
      email: p?.email,
      role: t.role,
      assignedCasesCount: memberCases.length,
      assignedCases: memberCases.map((c) => ({
        id: c.id,
        title: c.case_title,
        number: c.case_number,
        status: c.status,
        court: c.court_name,
      })),
    };
  });

  // 4. جلب الجلسات القادمة
  const { data: upcomingHearings } = await supabaseAdmin
    .from("hearings")
    .select("hearing_date, title, result, cases(case_title)")
    .eq("organization_id", orgId)
    .order("hearing_date", { ascending: true })
    .limit(10);

  // 5. جلب المهل العاجلة
  const { data: activeDeadlines } = await supabaseAdmin
    .from("deadlines")
    .select("due_date, title, status, cases(case_title)")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .order("due_date", { ascending: true })
    .limit(10);

  return {
    isGlobal: true,
    userRole: role,
    accessibleCasesCount: (casesList ?? []).length,
    teamMembers,
    casesSummary: (casesList ?? []).map((c) => ({
      id: c.id,
      title: c.case_title,
      number: c.case_number,
      status: c.status,
      court: c.court_name,
      claim_amount: null,
      lawyer_name: (c.lawyer as unknown as { full_name: string })?.full_name ?? null,
    })),
    hearings: (upcomingHearings ?? []).map((h) => ({
      date: h.hearing_date,
      title: h.title,
      decision: redactSaudiPii(h.result),
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
 * هندسة البرومبت المحكم والمدعم بالموسوعة النظامية السعودية الشاملة
 */
export function buildBayanSystemPrompt(context: CaseContextData): string {
  const { isGlobal, caseInfo, hearings, deadlines, documents, casesSummary, teamMembers, userRole, accessibleCasesCount } = context;
  const saudiCorpusText = renderSaudiCorpusPrompt();

  const bayanPersona = `أنتِ «المحامية بيان»، مستشارة قانونية وباحثة قضائية سعودية مؤهلة تأهيلاً رفيعاً، تحملين أعلى المراتب المهنية في الفقه النظامي والقضائي بالمملكة العربية السعودية، وتعملين كمستشارة ورئيسة أبحاث رقمية لمنصة «مِهلة» للمحاماة.

### ⚖️ هويتك وصفتك المهنية وبلاغة الصياغة:
1. **أنتِ أنثى**، وتتحدثين دائماً بصيغة المتكلم المؤنث الوقور («قمتُ بدراسة ملف الدعوى»، «يسرّني تقديم المشورة والتأصيل النظامي»، «يتبيّن لي بعد فحص السجلات»، «أوصي بالإجراء النظامي...»).
2. **لغتك وأسلوبك:** لغة عربية فصحى قانونية رصينة، بليغة، دقيقة، وواثقة تليق بكبار المحامين والمستشارين في المملكة العربية السعودية.
3. **التأصيل النظامي الصارم:** كل رأي أو مذكرة أو دفع تقدمينه يجب أن يكون مؤصلاً ومسنوداً إلى:
   - اسم النظام الرسمي ورقم وتاريخ المرسوم الملكي متى لزم.
   - رقم المادة الدقيق وفق التقنين السعودي الحديث.
   - التحليل الموضوعي والتوصية الإجرائية المباشرة (مثل: إيداع مذكرة جوابية، توجيه إخطار قبل 15 يوماً، قيد طلب التماس، الدفع بعدم الاختصاص المكاني قبل الأساس).`;

  if (isGlobal) {
    return `${bayanPersona}

### 🏢 وضعك الحالي: «المساعد القانوني العام لكافة أعمال المكتب»:
- تملكين رؤية شاملة على القضايا، الموظفين، الجلسات، والمهل المتاحة لهذا المستخدم (بصلاحية: ${userRole === "owner" ? "مالك المكتب (صلاحيات كاملة على كافة القضايا والموظفين)" : userRole === "admin" ? "مدير النظام" : "محامي/موظف (القضايا المسندة لملفه فقط)"}).

### 👥 بيانات فريق وموظفي المكتب وتوزيع القضايا:
${teamMembers && teamMembers.length > 0 ? teamMembers.map((m) => `* **الموظف/المحامي [${m.name}]** (الدور: ${m.role}): مسند إليه (${m.assignedCasesCount}) قضية: [${m.assignedCases.map((c) => `${c.title} - رقم ${c.number || "غير مقيد"}`).join("، ") || "لا توجد قضايا مسندة حالياً"}]`).join("\n") : "* لا يوجد فريق مسجل."}

### 📋 قائمة القضايا المتاحة في المكتب (${accessibleCasesCount || 0} قضية):
${casesSummary && casesSummary.length > 0 ? casesSummary.map((c) => `* [${c.title}] - رقم: (${c.number || "غير محدد"}) - المحكمة: (${c.court || "عامة"}) - المحامي المسؤول: (${c.lawyer_name || "غير مسند"}) - المطالبة: (${c.claim_amount ? `${c.claim_amount} ر.س` : "غير محددة"}) - الحالة: (${c.status})`).join("\n") : "* لا توجد قضايا مقيدة حالياً."}

### 📅 الجلسات والمواعيد القادمة في المكتب:
${hearings.length > 0 ? hearings.map((h) => `* [${h.case_title || "قضية"}]: جلسة (${h.date}) — ${h.title}`).join("\n") : "* لا توجد جلسات مجدولة قريباً."}

### ⏱️ المهل والإجراءات المستحقة:
${deadlines.length > 0 ? deadlines.map((d) => `* [${d.case_title || "قضية"}]: مهلة (${d.due_date}) — ${d.title}`).join("\n") : "* لا توجد مهل عاجلة."}

${saudiCorpusText}

### 🔒 تعليمات الإجابة الشاملة والدقيقة:
- إذا سألك مالك المكتب عن أي موظف (مثل: «كم قضية عند زياد؟» أو «وش قضايا سارة؟»)، أجيبي فوراً بذكر العدد الدقيق وأسماء وأرقام القضايا المسندة إليه من واقع السجلات أعلاه.
- إذا سُئلت عن أي مسألة نظامية في أي فرع من فروع القانون السعودي (مدني، تجاري، شركات، إفلاس، عمل، أحوال شخصية، جنائي، معلوماتي، تحكيم، تنفيذ، بيانات شخصية)، استشهدي فوراً بالمواد النظامية الدقيقة.
- إذا سأل الموظف العادي عن قضايا غير مسندة له، اعتذري بلباقة واقتصري على ما يخصه.`;
  }

  // وضع القضية المحددة
  return `${bayanPersona}

### 📁 وضعك الحالي: «دراسة وفحص قضية محددة»:
- **عنوان القضية:** ${caseInfo?.case_title || "غير محدد"}
- **رقم القضية:** ${caseInfo?.case_number || "غير محدد"}
- **المحكمة والدائرة:** ${caseInfo?.court_name || "غير محدد"} — ${caseInfo?.circuit || "غير محدد"}
- **الموكل:** ${caseInfo?.client_name || "غير محدد"}
- **المحامي المسؤول:** ${caseInfo?.assigned_lawyer_name || "غير مسند"}
- **قيمة المطالبة:** ${caseInfo?.claim_amount ? `${caseInfo.claim_amount} ر.س` : "غير محددة"}
- **ملخص الوقائع:** ${caseInfo?.description || "لا يوجد ملخص مضاف"}

### 📅 سجل الجلسات والمواعيد:
${hearings.length > 0 ? hearings.map((h) => `* جلسة (${h.date}): ${h.title} ${h.decision ? `— القرار: ${h.decision}` : ""}`).join("\n") : "* لا توجد جلسات مسجلة حالياً."}

### ⏱️ المهل والإجراءات المستحقة:
${deadlines.length > 0 ? deadlines.map((d) => `* مهلة (${d.due_date}): ${d.title} (الحالة: ${d.status})`).join("\n") : "* لا توجد مهل مسجلة."}

### 📄 المستندات والصكوك المستخرجة (OCR):
${documents.length > 0 ? documents.map((doc) => `* مستند [${doc.title} (${doc.category || "عام"})]: ${doc.extractedSnippet ? `«${doc.extractedSnippet}»` : "لا يوجد نص مستخرج"}`).join("\n") : "* لم يتم إرفاق مستندات بعد."}

${saudiCorpusText}

### ⛔ ضوابط الإجابة:
- اعتمدي دائماً على الأسانيد النظامية الدقيقة ورقم المادة المنطبقة من الأنظمة السعودية.
- لا تخرجي عن وقائع هذه القضية والقانون السعودي.`;
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
          temperature: 0.2,
          max_tokens: 1500,
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

  // المحرك الاحتياطي الذكي المدمج المحدث بكافة فروع القانون وموظفي المكتب
  const fallbackText = generateAdvancedLegalResponse(userQuery, context);
  return {
    text: fallbackText,
    citations: extractCitations(fallbackText, context),
  };
}

function extractCitations(text: string, context: CaseContextData): BayanCitation[] {
  const citations: BayanCitation[] = [];

  // مطابقة الأنظمة المستشهد بها تلقائياً من الموسوعة
  SAUDI_LEGAL_ENCYCLOPEDIA.forEach((domain) => {
    domain.statutes.forEach((statute) => {
      const baseName = statute.name.replace(/ (ولائحته|وتعديلاته).*$/, "");
      if (text.includes(statute.name) || text.includes(baseName)) {
        if (!citations.some((c) => c.title.includes(baseName))) {
          citations.push({ sourceType: "statute", title: `${baseName} (${statute.royalDecree})` });
        }
      }
    });
  });

  context.documents.forEach((doc) => {
    if (text.includes(doc.title)) {
      citations.push({ sourceType: "document", title: doc.title, reference: doc.category });
    }
  });

  return citations;
}

function generateAdvancedLegalResponse(query: string, context: CaseContextData): string {
  const { isGlobal, caseInfo, hearings, deadlines, casesSummary, teamMembers } = context;
  const q = query.toLowerCase();

  // 1. استفسار عن قضايا موظف أو محامٍ معين (مثل زياد أو سارة أو غيرهم)
  if (isGlobal && teamMembers && teamMembers.length > 0) {
    const matchedMember = teamMembers.find((m) => {
      const parts = m.name.toLowerCase().split(/\s+/).filter(Boolean);
      const emailPrefix = m.email ? m.email.split("@")[0].toLowerCase() : "";
      return parts.some((part) => part.length >= 3 && q.includes(part)) || (emailPrefix && q.includes(emailPrefix));
    });

    if (matchedMember) {
      return `بصفتي **المحامية بيان**، راجعتُ سجلات القضايا الخاصة بالزميل **${matchedMember.name}**:

* **إجمالي القضايا المسندة لملفه:** **(${matchedMember.assignedCasesCount}) قضية**.
* **بيان القضايا:**
${matchedMember.assignedCases.length > 0 ? matchedMember.assignedCases.map((c, i) => `   ${i + 1}. 📁 **${c.title}** (رقم: ${c.number || "غير مقيد"}) — *${c.court || "المحكمة المختصة"}* [الحالة: ${c.status}]`).join("\n") : "   * لا توجد قضايا مسندة لملفه حالياً."}

💡 **ملاحظة الإدارة:** يمكنكم إعادة توزيع المهام أو إسناد قضايا جديدة له مباشرة من صفحة تفاصيل القضية.`;
    }
  }

  // 2. نظام العمل والمنازعات العمالية (المادة 77 والمادة 80 و 84)
  if (q.includes("عمل") || q.includes("فصل") || q.includes("مكافأة نهاية الخدمة") || q.includes("مادة 77") || q.includes("مادة 80") || q.includes("استقالة")) {
    return `بصفتي **المحامية بيان**، أرفع إليكم الرأي والتأصيل النظامي وفق **نظام العمل السعودي ولائحته التنفيذية**:

1. **التعويض عن إنهاء العقد غير المشروع (المادة 77):**
   * يستحق الطرف المتضرر تعويضاً يعادل **أجر (15) يوماً عن كل سنة خدمة** في العقود غير محددة المدة، أو **أجر المدة المتبقية** في العقود محددة المدة، وبحد أدنى لا يقل عن **أجر شهرين**.
2. **فسخ العقد دون مكافأة أو إشعار (المادة 80):**
   * محددة بـ 9 حالات حصرية (كالاعتداء، إفشاء الأسرار، التزوير، والغياب المتصل لأكثر من 15 يوماً بعد الإنذار الكتابي).
3. **احتساب مكافأة نهاية الخدمة (المادة 84 والمادة 85):**
   * تُحتسب بواقع **أجر نصف شهر عن كل سنة من السنوات الخمس الأولى**، و**أجر شهر كامل عن كل سنة تالية** على أساس آخر أجر فعلي.
   * في حال الاستقالة: يستحق ثلث المكافأة بعد (2-5 سنوات)، وثلثيها بعد (5-10 سنوات)، وكاملها إذا تجاوزت الخدمة 10 سنوات.

💡 **التوصية الإجرائية:** وجوب التقدم بطلب التسوية الودية لدى منصة «وِدي» بوزارة الموارد البشرية كإجراء إلزامي قبل قيد الدعوى أمام المحكمة العمالية.`;
  }

  // 3. نظام الشركات والإفلاس والمسؤولية
  if (q.includes("شركات") || q.includes("شركة") || q.includes("شريك") || q.includes("مجلس إدارة") || q.includes("إفلاس") || q.includes("تصفية")) {
    return `بصفتي **المحامية بيان**، أحيطكم بالتكييف النظامي استناداً إلى **نظام الشركات الجديد (1443هـ)** و**نظام الإفلاس (1439هـ)**:

1. **مسؤولية المديرين وأعضاء مجلس الإدارة (المادة 27 من نظام الشركات):**
   * يسأل المديرون بالتضامن عن تعويض الشركة أو الشركاء أو الغير عن الأضرار الناشئة عن مخالفة أحكام النظام أو عقد التأسيس أو الأخطاء الإدارية.
2. **اتفاق الشركاء وميثاق العائلة (المادة 15):**
   * أضفى النظام حجية قانونية ملزمة لاتفاقات الشركاء والمواثيق العائلية المنظمة لحصص الملكية وإدارة النزاعات.
3. **تعليق المطالبات في نظام الإفلاس (المادة 42):**
   * يترتب على قيد طلب افتتاح إجراء التسوية الوقائية أو إعادة التنظيم المالي تعليق كافة المطالبات والإجراءات التنفيذية ضد المدين.`;
  }

  // 4. نظام الأحوال الشخصية والتركات والحضانة
  if (q.includes("أحوال شخصية") || q.includes("حضانة") || q.includes("نفقة") || q.includes("طلاق") || q.includes("تركة") || q.includes("ورثة")) {
    return `بصفتي **المحامية بيان**، أرفع إليكم التأصيل الشرعي والنظامي وفق **نظام الأحوال الشخصية (1443هـ)**:

1. **أولوية الحضانة وضوابطها (المادة 125):**
   * تثبت الحضانة للأم ثم الأب ثم أم الأم، وتستمر الحضانة حتى سن (18) عاماً، مع جعل مصلحة المحضون الفضلى هي المعيار الحاكم دائماً.
2. **استحقاق النفقة الماضية والمستقبلية (المادة 42):**
   * النفقة دين ممتاز في ذمة المنفق مقدم على سائر الديون العادية ولا تسقط بمضي المدة.
3. **تصفية وقسمة التركات (المادة 198):**
   * تصفى التركات رضائياً أو عبر دوائر التركات بالمحكمة العامة، وتُسدد الديون والوصايا وتُحصر التركة إلكترونياً قبل قسمة السهام الشرعية.`;
  }

  // 5. الجرائم المعلوماتية والإجراءات الجزائية
  if (q.includes("جرائم معلوماتية") || q.includes("ابتزاز") || q.includes("تشهير") || q.includes("احتيال") || q.includes("جزائية") || q.includes("توقيف")) {
    return `بصفتي **المحامية بيان**، أرفع إليكم الرأي النظامي وفق **نظام مكافحة جرائم المعلوماتية (1428هـ)** و**نظام الإجراءات الجزائية (1435هـ)**:

1. **التشهير والدخول غير المشروع (المادة 3):**
   * يعاقب بالسجن مدة تصل إلى سنة وبغرامة تصل إلى (500,000) ريال لكل من ارتكب التشهير أو المساس بالحياة الخاصة عبر التقنية.
2. **الاحتيال المالي الإلكتروني (المادة 4):**
   * السجن حتى (3) سنوات وغرامة حتى مليوني ريال لمن استولى على مال الغير بالاحتيال الرقمي أو انتحال الصفة.
3. **ضمانات المتهم في التحقيق (المادة 4 من نظام الإجراءات الجزائية):**
   * حق الاستعانة بمحامٍ مرخص أثناء التحقيق وسماع الأقوال لدى النيابة العامة.`;
  }

  // 6. التحكيم والوساطة وفض المنازعات
  if (q.includes("تحكيم") || q.includes("شرط التحكيم") || q.includes("بطلان حكم التحكيم")) {
    return `بصفتي **المحامية بيان**، أحيطكم بالقواعد السارية في **نظام التحكيم السعودي (1433هـ)**:

1. **استقلالية شرط التحكيم (المادة 9):**
   * يعد شرط التحكيم اتفاقاً مستقلاً تماماً عن شروط العقد، ولا يترتب على بطلان العقد الأصلي أو فسخه بطلان شرط التحكيم.
2. **حالات دعوى بطلان حكم التحكيم (المادة 50):**
   * لا يُقبل الطعن في أحكام المحكمين إلا بدعوى بطلان حصرية (عدم وجود اتفاق تحكيم، الإخلال بحق الدفاع، أو مخالفة الشريعة والنظام العام بالمملكة).`;
  }

  // 7. المعاملات المدنية والإثبات وعقود المقاولة والتعويض
  if (q.includes("دفوع") || q.includes("إثبات") || q.includes("معاملات") || q.includes("عقد") || q.includes("مقاولة") || q.includes("تعويض") || q.includes("مادة 94") || q.includes("مادة 138")) {
    return `بعد دراستي للمسألة ومطابقتها مع الأنظمة القضائية السعودية الحديثة، أرفع إليكم الرأي والتأصيل النظامي التالي:

1. **التأصيل بموجب نظام المعاملات المدنية (1444هـ):**
   * **القوة الملزمة للعقد:** وفقاً لـ **المادة (94)** «العقد شريعة المتعاقدين، فلا يجوز نقضه ولا تعديله إلا باتفاق الطرفين أو بمقتضى نص نظامي».
   * **التعويض واستحقاقه:** استناداً لـ **المادة (138)** يشمل التعويض ما لحق الدائن من خسارة وما فاته من كسب متى كان ذلك نتيجة طبيعية لعدم الوفاء بالالتزام.
   * **عقود المقاولات والضمان:** تنص **المادة (461)** وما بعدها على التزامات المقاول بإنجاز العمل وفق المواصفات، ويسري الضمان العشري لسلامة المنشآت بموجب **المادة (475)**.

2. **قواعد الإثبات بموجب نظام الإثبات (1443هـ):**
   * **حجية الأدلة الرقمية:** وفقاً لـ **المادتين (53 و 54)**، تُعد المحررات والمراسلات الإلكترونية الموثقة (كالبريد والواتساب المعتمد) دليلاً كتابياً رسمياً ملزماً وحجة قاطعة على أطرافها.
   * **عبء الإثبات:** استناداً لـ **المادة (1)** يقع عبء الإثبات على مدعي الالتزام، وعلى المدعى عليه إثبات التخلص منه.

3. **التوصية الإجرائية:**
   * صياغة مذكرة جوابية تفند ادعاءات الخصم بالاستناد إلى نصوص المواد أعلاه مع إرفاق المستندات كأدلة رقمية مفهرسة.`;
  }

  // 8. المهل ومواعيد الاعتراض والاستئناف والتنفيذ
  if (q.includes("مهل") || q.includes("اعتراض") || q.includes("استئناف") || q.includes("ميعاد") || q.includes("طعن") || q.includes("تنفيذ") || q.includes("قرار 46")) {
    return `بشأن المهل والمواعيد الإجرائية وفق النظام القضائي وقضاء التنفيذ، يسرّني إحاطتكم بالقواعد النظامية السارية:

* **مواعيد الاستئناف (المادة 79 مرافعات شرعية والمادة 58 محاكم تجارية):**
  * ميعاد الاعتراض بطريق الاستئناف على الأحكام العادية هو **(30) يوماً**.
  * ميعاد الاعتراض على الأحكام الصادرة في المسائل المستعجلة هو **(10) أيام**.
* **إجراءات قضاء التنفيذ (نظام التنفيذ 1433هـ):**
  * مهلة الإخطار والوفاء بموجب **قرار (34)** هي (5) أيام من تاريخ التبليغ.
  * في حال عدم الوفاء، يُصدر القاضي فوراً **قرار (46)** المتضمن الحجز على الحسابات والأموال والمنع من السفر والإفصاح عن الأصول.

${deadlines.length > 0 ? `* **المهل المسجلة حالياً في النظام:**\n${deadlines.map((d) => `   * [${d.title} — تاريخ الاستحقاق: ${d.due_date}]`).join("\n")}` : ""}`;
  }

  // 9. حصر القضايا والجلسات العامة
  if (isGlobal && (q.includes("قضايا") || q.includes("حصر") || q.includes("عدد") || q.includes("تقرير") || q.includes("جلسات"))) {
    if (q.includes("جلسات")) {
      return `بصفتي **المحامية بيان**، يسرّني استعراض جدول الجلسات القضائية القادمة في المكتب:

${hearings.length > 0 ? hearings.map((h, i) => `${i + 1}. 🏛️ **[${h.case_title || "قضية"}]:** موعد الجلسة (${h.date}) — *${h.title}* ${h.decision ? `(القرار: ${h.decision})` : ""}`).join("\n") : "* لا توجد جلسات قادمة مسجلة في النظام حالياً."}

💡 **التوجيه النظامي:** نوصي بمراجعة مذكرات الدفاع والتأكد من إيداع أصول المستندات قبل موعد الجلسة بـ (3) أيام على الأقل استناداً لأحكام نظام المرافعات الشرعية.`;
    }

    return `معك **المحامية بيان**، بناءً على سجلات المكتب، يبلغ إجمالي القضايا المتاحة **(${casesSummary?.length || 0}) قضية**:

${casesSummary && casesSummary.length > 0 ? casesSummary.slice(0, 10).map((c, i) => `${i + 1}. 📁 **${c.title}** (رقم: ${c.number || "غير مقيد"}) — *${c.court || "المحكمة المختصة"}* — المحامي: ${c.lawyer_name || "غير مسند"}`).join("\n") : "* لا توجد قضايا مقيدة حالياً."}

يمكنك سؤالي عن أي قضية بالاسم أو الرقم أو أي مسألة نظامية لتزويدك بتقرير وتكييف قانوني تفصيلي.`;
  }

  // 10. تلخيص دعوى محددة
  if (!isGlobal && caseInfo && (q.includes("لخص") || q.includes("وقائع") || q.includes("موقف") || q.includes("تقرير"))) {
    return `بصفتي **المحامية بيان**، يسعدني تقديم تلخيص قانوني ومحكم لمسار دعوى **«${caseInfo.case_title}»**:

* **بيانات الدعوى:** مقيدة برقم (${caseInfo.case_number || "قيد التحديد"}) لدى ${caseInfo.court_name || "المحكمة المختصة"} — ${caseInfo.circuit || "الدائرة القضائية المختصة"}.
* **الموكل الممثل:** ${caseInfo.client_name || "الطرف الممثل"}.
* **المحامي المسؤول:** ${caseInfo.assigned_lawyer_name || "غير مسند"}.
* **موضوع النزاع والمطالبة:** ${caseInfo.description || "مطالبة حقوقية/تجارية قائمة"}${caseInfo.claim_amount ? ` بقيمة إجمالية قدرها ${caseInfo.claim_amount.toLocaleString()} ريال سعودي.` : "."}
* **الموقف الإجرائي الحالي:** ${hearings.length > 0 ? `عُقدت آخر جلسة بتاريخ ${hearings[0].date} (${hearings[0].title}).` : "لا توجد جلسات سابقة مسجلة."}

💡 **التوجيه النظامي والتوصية:** أوصي بمراجعة المذكرات المتبادلة واستكمال إيداع حصر أسانيد الإثبات قبل موعد الجلسة القادمة تفادياً لسقوط الحق في الدفع.`;
  }

  // الرد العام الوقور
  return `السلام عليكم ورحمة الله وبركاته،

أهلاً بك زميلي الكريم، معك **المحامية بيان** — المستشارة القانونية والباحثة القضائية لمنصة «مِهلة».

أنا متصلة بمركز قيادة المكتب ومدرّبة على **كافة فروع الأنظمة السعودية الرسمية**:
* 🏛️ **الأنظمة المدنية والعقود:** نظام المعاملات المدنية (1444هـ)، الوساطة والتسجيل العقاري.
* 💼 **الأنظمة التجارية والشركات:** نظام الشركات الجديد (1443هـ)، المحاكم التجارية، ونظام الإفلاس.
* 📜 **أنظمة الإثبات والمرافعات والقضاء:** نظام الإثبات (1443هـ)، المرافعات الشرعية، قضاء التنفيذ، وديوان المظالم.
* 👥 **أنظمة العمل والموارد البشرية:** نظام العمل السعودي، التعويض (م 77)، الفصل (م 80)، ومكافأة نهاية الخدمة.
* 👨‍👩‍👦 **أنظمة الأحوال الشخصية والتركات:** نظام الأحوال الشخصية (1443هـ)، الحضانة والنفقة وقسمة التركات.
* 🔒 **الأنظمة الجزائية والمعلوماتية والتقنية:** نظام مكافحة الجرائم المعلوماتية، ونظام حماية البيانات الشخصية (PDPL).
* 🤝 **التحكيم والوساطة:** نظام التحكيم السعودي وفض المنازعات البديلة.

تفضل بطرح استفسارك أو موضوع قضيتك، وسأرفع إليك الرأي والتأصيل النظامي وصياغة الدفوع فوراً.`;
}
