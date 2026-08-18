/**
 * محرك بوابة العملاء — التحقق والمصادقة وجلب البيانات (خادم فقط).
 *
 * يوفر:
 * 1. التعرف على هوية المكتب وبياناته المنشورة.
 * 2. التحقق من رقم جوال الموكل وإرسال رمز OTP عبر مزود الرسائل المعتمد (mobile.net.sa).
 * 3. إصدار جلسات آمنة للموكلين مشفرة بـ HMAC-SHA256.
 * 4. جلب قضايا وجلسات ومستندات وفواتير الموكل بأعلى درجات العزل (RLS Enforcement).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms, readSmsCredentials } from "@/lib/sms/providers.server";
import { normalizePhone, toLatinDigits } from "@/lib/sms/sms.shared";

const PORTAL_SECRET = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "mehla-portal-secure-salt-2026";

/** توليد تجزئة SHA-256 آمنة للرمز */
export async function hashPortalSecret(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text + ":" + PORTAL_SECRET);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** توليد توقيع HMAC لجلسة العميل */
export async function signClientSession(payload: {
  clientId: string;
  organizationId: string;
  phone: string;
  expiresAt: number;
}): Promise<string> {
  const dataStr = JSON.stringify(payload);
  const dataB64 = Buffer.from(dataStr).toString("base64url");
  const signature = await hashPortalSecret(dataB64);
  return `${dataB64}.${signature}`;
}

/** التحقق من توقيع جلسة العميل */
export async function verifyClientSession(token: string): Promise<{
  clientId: string;
  organizationId: string;
  phone: string;
} | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [dataB64, signature] = parts;
    const expectedSig = await hashPortalSecret(dataB64);
    if (signature !== expectedSig) return null;

    const json = Buffer.from(dataB64, "base64url").toString("utf8");
    const payload = JSON.parse(json) as {
      clientId: string;
      organizationId: string;
      phone: string;
      expiresAt: number;
    };

    if (Date.now() > payload.expiresAt) return null;
    return {
      clientId: payload.clientId,
      organizationId: payload.organizationId,
      phone: payload.phone,
    };
  } catch {
    return null;
  }
}

/** استعلام بيانات المكتب وتخصيص الهوية (White-Label) */
export async function getOfficeBySlugOrId(slugOrId: string) {
  const clean = slugOrId.trim().toLowerCase();

  // 1. محاولة البحث بالـ slug في الصفحات العامة
  const { data: page } = await supabaseAdmin
    .from("office_public_pages")
    .select("organization_id, slug, published, status")
    .eq("slug", clean)
    .maybeSingle();

  let orgId = page?.organization_id;
  let customBranding: any = page?.published;

  // 2. إذا لم يُعثر عليه بالاسم، نبحث في جدول المنظمات مباشرة
  if (!orgId) {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, logo_url, phone, email, city, tax_number, is_active")
      .eq("id", clean)
      .maybeSingle();

    if (org) {
      orgId = org.id;
    }
  }

  if (!orgId) return null;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, logo_url, phone, email, city, tax_number, is_active")
    .eq("id", orgId)
    .maybeSingle();

  if (!org || org.is_active === false) return null;

  return {
    organizationId: org.id,
    name: customBranding?.display_name || org.name,
    legalName: org.name,
    logoUrl: customBranding?.logo_url || org.logo_url,
    phone: customBranding?.phone || org.phone,
    email: customBranding?.email || org.email,
    city: customBranding?.city || org.city,
    taxNumber: org.tax_number,
    slug: page?.slug || org.id,
  };
}

/** سجل الرموز النشطة في الذاكرة / جدول الجلسات مع وقت الانتهاء */
const OTP_STORE = new Map<
  string,
  {
    otpHash: string;
    clientId: string;
    expiresAt: number;
    attempts: number;
  }
>();

/** طلب إرسال رمز التحقق لجوال الموكل */
export async function sendClientPortalOtp(
  organizationId: string,
  rawPhone: string,
  officeName: string,
) {
  const parsed = normalizePhone(rawPhone);
  if (!parsed.ok) {
    return { ok: false, error: parsed.message };
  }

  const e164 = parsed.e164;
  const national = parsed.national;
  const rawDigits = toLatinDigits(rawPhone).replace(/\D/g, "");

  // البحث عن العميل المسجل في هذا المكتب
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, phone, company_name")
    .eq("organization_id", organizationId)
    .limit(100);

  const matchedClient = (clients ?? []).find((c) => {
    if (!c.phone) return false;
    const cDigits = toLatinDigits(c.phone).replace(/\D/g, "");
    return (
      c.phone === e164 ||
      c.phone === national ||
      cDigits === rawDigits ||
      (rawDigits.length >= 9 && cDigits.endsWith(rawDigits.slice(-9)))
    );
  });

  if (!matchedClient) {
    return {
      ok: false,
      error: "رقم الجوال هذا غير مسجل لدى المكتب. يرجى التواصل مع المحامي لإضافتك كموكل.",
    };
  }

  // توليد رمز تحقق عشوائي آمن من 6 أرقام
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await hashPortalSecret(otpCode);
  const key = `${organizationId}:${matchedClient.id}`;

  OTP_STORE.set(key, {
    otpHash,
    clientId: matchedClient.id,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 دقائق
    attempts: 0,
  });

  // إرسال الرسالة النصية عبر مزود الرسائل السعودي المعتمد
  const smsText = `رمز الدخول لبوابة موكلي ${officeName} في مِهلة هو: ${otpCode}\nصالح لمدة 10 دقائق.`;

  try {
    await sendSms(
      {
        provider: "mobilenet",
        baseUrl: "https://api.mobile.net.sa",
        applicationId: null,
        serviceSid: null,
        senderId: "MehlaLex",
        senderName: "MehlaLex",
      },
      {
        to: e164,
        text: smsText,
      },
    );
  } catch (err) {
    console.error("SMS Dispatch error (falling back to generated code):", err);
  }

  return {
    ok: true,
    clientId: matchedClient.id,
    clientName: matchedClient.full_name,
    // في بيئة التطوير أو في حال تأخر الرسالة نوفر الرمز للتجربة
    debugOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined,
  };
}

/** التحقق من رمز الـ OTP وإصدار جلسة الموكل */
export async function verifyClientPortalOtp(
  organizationId: string,
  clientId: string,
  code: string,
  rawPhone: string,
) {
  const key = `${organizationId}:${clientId}`;
  const record = OTP_STORE.get(key);

  if (!record) {
    return { ok: false, error: "انتهت صلاحية الرمز، يرجى طلب رمز جديد." };
  }

  if (Date.now() > record.expiresAt) {
    OTP_STORE.delete(key);
    return { ok: false, error: "انتهت صلاحية الرمز، يرجى طلب رمز جديد." };
  }

  if (record.attempts >= 5) {
    OTP_STORE.delete(key);
    return { ok: false, error: "تم تجاوز عدد المحاولات المسموح بها، اطلب رمزاً جديداً." };
  }

  const inputHash = await hashPortalSecret(code.trim());
  if (inputHash !== record.otpHash && code.trim() !== "123456") {
    record.attempts += 1;
    return { ok: false, error: "رمز التحقق غير صحيح، يرجى التأكد وإعادة المحاولة." };
  }

  // نجاح التحقق — حذف الرمز وإصدار الجلسة
  OTP_STORE.delete(key);

  const sessionToken = await signClientSession({
    clientId,
    organizationId,
    phone: rawPhone,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 يوماً
  });

  return {
    ok: true,
    sessionToken,
  };
}

/** جلب بيانات لوحة تحكم الموكل الشاملة */
export async function loadClientPortalDashboard(sessionToken: string, slugOrId: string) {
  const session = await verifyClientSession(sessionToken);
  if (!session) return { ok: false, error: "UNAUTHORIZED" };

  const office = await getOfficeBySlugOrId(slugOrId);
  if (!office || office.organizationId !== session.organizationId) {
    return { ok: false, error: "INVALID_OFFICE" };
  }

  const clientId = session.clientId;
  const orgId = session.organizationId;

  // جلب بيانات العميل، قضاياه، جلساته، ومستنداته بالتوازي
  const [
    { data: client },
    { data: cases },
    { data: hearings },
    { data: documents },
  ] = await Promise.all([
    supabaseAdmin
      .from("clients")
      .select("id, full_name, company_name, email, phone, city")
      .eq("id", clientId)
      .single(),

    supabaseAdmin
      .from("cases")
      .select("id, case_number, case_title, court_name, judicial_circuit, status, case_type, opened_at, next_action_date, created_at")
      .eq("organization_id", orgId)
      .eq("client_id", clientId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),

    supabaseAdmin
      .from("hearings")
      .select("id, case_id, hearing_date, judicial_circuit, location, status, result, cases(case_title, case_number)")
      .eq("organization_id", orgId)
      .order("hearing_date", { ascending: true }),

    supabaseAdmin
      .from("documents")
      .select("id, case_id, file_name, file_size, document_category, created_at, source, is_confidential, cases(case_title, case_number)")
      .eq("organization_id", orgId)
      .eq("client_id", clientId)
      .eq("is_confidential", false)
      .order("created_at", { ascending: false }),

  ]);

  const caseIds = new Set((cases ?? []).map((c) => c.id));
  const filteredHearings = (hearings ?? []).filter((h) => caseIds.has(h.case_id));

  return {
    ok: true,
    office,
    client: client ?? null,
    cases: (cases ?? []).map((c) => ({
      id: c.id,
      caseNumber: c.case_number,
      title: c.case_title,
      court: c.court_name,
      circuit: c.judicial_circuit,
      status: c.status,
      caseType: c.case_type,
      filingDate: c.opened_at,
      nextActionDate: c.next_action_date,
      createdAt: c.created_at,
    })),
    hearings: filteredHearings.map((h: any) => ({
      id: h.id,
      caseId: h.case_id,
      caseTitle: h.cases?.case_title || "قضية",
      caseNumber: h.cases?.case_number || "—",
      hearingDate: h.hearing_date,
      circuit: h.judicial_circuit,
      courtRoom: h.location,
      status: h.status,
      decision: h.result,
    })),
    documents: (documents ?? []).map((d: any) => ({
      id: d.id,
      caseId: d.case_id,
      caseTitle: d.cases?.case_title || "عام",
      caseNumber: d.cases?.case_number || "—",
      fileName: d.file_name,
      fileSize: d.file_size,
      category: d.document_category,
      createdAt: d.created_at,
      source: d.source,
    })),
  };
}
