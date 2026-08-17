/**
 * هوية مستندات فوترة المكتب (شعار، تذييل، مفوّض التوقيع، بيانات بنكية) — خادم فقط.
 *
 * الشعار يُخزَّن في دلو خاص لا يقبل أي وصول مباشر من المتصفح؛ الرفع والقراءة
 * يمرّان بدور الخدمة بعد تحقق صريح من عضوية المكتب وصلاحية إدارة الفوترة.
 */
import { PUBLIC_BUCKET } from "@/lib/office-page.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type InvoiceBranding = {
  logoPath: string | null;
  logoMime: string | null;
  footerNote: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  bankDetails: string | null;
  showSignature: boolean;
};

export const EMPTY_BRANDING: InvoiceBranding = {
  logoPath: null,
  logoMime: null,
  footerNote: null,
  signatoryName: null,
  signatoryTitle: null,
  bankDetails: null,
  showSignature: true,
};

const LOGO_PREFIX = "billing";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;

const trim = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
};

export async function readInvoiceBranding(
  supabase: Client,
  organizationId: string,
): Promise<InvoiceBranding> {
  const { data } = await supabase
    .from("office_invoice_branding")
    .select(
      "logo_path, logo_mime, footer_note, signatory_name, signatory_title, bank_details, show_signature",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return EMPTY_BRANDING;
  const row = data as Record<string, unknown>;
  return {
    logoPath: (row["logo_path"] as string | null) ?? null,
    logoMime: (row["logo_mime"] as string | null) ?? null,
    footerNote: (row["footer_note"] as string | null) ?? null,
    signatoryName: (row["signatory_name"] as string | null) ?? null,
    signatoryTitle: (row["signatory_title"] as string | null) ?? null,
    bankDetails: (row["bank_details"] as string | null) ?? null,
    showSignature: row["show_signature"] !== false,
  };
}

export type BrandingTextInput = {
  footerNote?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  bankDetails?: string | null;
  showSignature: boolean;
};

/** حفظ الحقول النصية دون المساس بالشعار المرفوع. */
export async function saveInvoiceBrandingText(
  supabase: Client,
  organizationId: string,
  input: BrandingTextInput,
): Promise<InvoiceBranding> {
  const { error } = await supabase.from("office_invoice_branding").upsert(
    {
      organization_id: organizationId,
      footer_note: trim(input.footerNote),
      signatory_name: trim(input.signatoryName),
      signatory_title: trim(input.signatoryTitle),
      bank_details: trim(input.bankDetails),
      show_signature: input.showSignature,
    } as never,
    { onConflict: "organization_id" },
  );
  if (error) throw new Error("تعذّر حفظ هوية الفواتير. أعد المحاولة.");
  return readInvoiceBranding(supabase, organizationId);
}

/** بصمة الملف: نتحقق من الرأس الفعلي ولا نثق بامتداد الملف ولا بنوعه المُعلن. */
export function detectImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/**
 * رفع شعار الفواتير: يُحفظ بمسار جديد كل مرة ثم يُحذف السابق، فلا يبقى ملف
 * معلّق ولا يظهر شعار قديم بسبب التخزين المؤقت.
 */
export async function uploadInvoiceLogo(
  supabase: Client,
  organizationId: string,
  bytes: Uint8Array,
): Promise<InvoiceBranding> {
  if (bytes.byteLength === 0) throw new Error("الملف فارغ.");
  if (bytes.byteLength > LOGO_MAX_BYTES)
    throw new Error("حجم الشعار يجب أن يكون أقل من 2 ميجابايت.");
  const mime = detectImageMime(bytes);
  if (!mime) throw new Error("صيغة الشعار غير مدعومة. استخدم PNG أو JPEG.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = await readInvoiceBranding(supabase, organizationId);
  const path = `${organizationId}/${LOGO_PREFIX}/logo-${Date.now()}.${mime === "image/png" ? "png" : "jpg"}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(PUBLIC_BUCKET)
    .upload(path, bytes as unknown as ArrayBuffer, { contentType: mime, upsert: true });
  if (uploadError) throw new Error("تعذّر رفع الشعار. أعد المحاولة.");

  const { error } = await supabase
    .from("office_invoice_branding")
    .upsert({ organization_id: organizationId, logo_path: path, logo_mime: mime } as never, {
      onConflict: "organization_id",
    });
  if (error) {
    await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove([path]);
    throw new Error("تعذّر حفظ الشعار. أعد المحاولة.");
  }
  if (current.logoPath && current.logoPath !== path) {
    await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove([current.logoPath]);
  }
  return readInvoiceBranding(supabase, organizationId);
}

export async function removeInvoiceLogo(
  supabase: Client,
  organizationId: string,
): Promise<InvoiceBranding> {
  const current = await readInvoiceBranding(supabase, organizationId);
  const { error } = await supabase
    .from("office_invoice_branding")
    .update({ logo_path: null, logo_mime: null } as never)
    .eq("organization_id", organizationId);
  if (error) throw new Error("تعذّر حذف الشعار. أعد المحاولة.");
  if (current.logoPath) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove([current.logoPath]);
  }
  return readInvoiceBranding(supabase, organizationId);
}

/** قراءة بايتس الشعار للاستخدام داخل مستند PDF فقط. */
export async function loadInvoiceLogoBytes(
  branding: InvoiceBranding,
  organizationId: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!branding.logoPath) return null;
  // حارس إضافي: لا نقرأ إلا مساراً يقع داخل مجلد المكتب نفسه.
  if (!branding.logoPath.startsWith(`${organizationId}/${LOGO_PREFIX}/`)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(PUBLIC_BUCKET)
    .download(branding.logoPath);
  if (error || !data) return null;
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mime: branding.logoMime ?? data.type ?? "image/png",
  };
}
