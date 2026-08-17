/**
 * حالة استقبال المستلم — مملوكة لمِهلة بالكامل وخادمية فقط.
 *
 * المصدر الوحيد للحقيقة هو جدول `public.email_suppressions` في قاعدة مِهلة،
 * فلا اعتماد على أي مزوّد بريد خارجي ولا على واجهة إلغاء اشتراك مُدارة.
 * الجدول مغلق أمام المتصفح تماماً؛ الوصول من هنا بدور الخدمة بعد فحص الصلاحية
 * في دوال الخادم المستدعية.
 *
 * السجل تاريخي: الرفع يضبط `lifted_at`/`lifted_by` ولا يحذف أي صف إطلاقاً.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  blocksCategory,
  isLiftableReason,
  isSuppressionReason,
  looksLikeAddress,
  maskAddress,
  normalizeAddress,
  qualifiesAsHardBounce,
  type SuppressionCategory,
  type SuppressionReason,
} from "./suppression.shared";

export type { SuppressionCategory, SuppressionReason };

/** نطاق الإرسال الكنسي لمِهلة (Hostinger) — لا نطاق مزوّد مُدار. */
export const MEHLA_SENDER_DOMAIN = "mehlalex.com";

type SuppressionRow = {
  id: string;
  normalized_address: string;
  reason: string;
  source: string;
  created_at: string;
  lifted_at: string | null;
};

type SuppressionInsert = {
  address: string;
  normalized_address: string;
  reason: SuppressionReason;
  source: string;
  created_by?: string | null;
  note?: string | null;
};

type SuppressionUpdate = {
  lifted_at?: string | null;
  lifted_by?: string | null;
  note?: string | null;
};

/**
 * الجدول جديد ولم تُطبَّق هجرته بعد، فأنواع القاعدة المُولَّدة لا تعرفه.
 * نصف العقد محلياً بدقة بدل استخدام `any`، ونستبدله بالنوع المُولَّد بعد التطبيق.
 */
type SuppressionDb = SupabaseClient<{
  public: {
    Tables: {
      email_suppressions: {
        Row: SuppressionRow;
        Insert: SuppressionInsert;
        Update: SuppressionUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}>;

async function db(): Promise<SuppressionDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SuppressionDb;
}

export type RecipientState = {
  address: string;
  /** محجوب عن الاستقبال لهذه الفئة وفق حالة الحجب الفعّالة. */
  blocked: boolean;
  /** تعذّر التحقق (عطل قاعدة بيانات) — لا يُعامل كحجب ولا كسماح مؤكد. */
  unknown: boolean;
  /** سبب الحجب الفعّال عند وجوده — لعرض سبب صحيح للموظف. */
  reason: SuppressionReason | null;
};

/**
 * حالة استقبال قائمة عناوين لفئة بريد محددة. لا ترمي أبداً: الفشل يُعاد
 * كـ`unknown` حتى لا تتوقف واجهة الإنشاء بسبب عطل قراءة.
 */
export async function recipientStates(
  addresses: string[],
  category: SuppressionCategory = "human_mail",
): Promise<RecipientState[]> {
  const unique = [
    ...new Set(addresses.map(normalizeAddress).filter((a) => looksLikeAddress(a))),
  ].slice(0, 50);
  if (unique.length === 0) return [];
  try {
    const client = await db();
    const { data, error } = await client
      .from("email_suppressions")
      .select("id, normalized_address, reason, source, created_at, lifted_at")
      .in("normalized_address", unique)
      .is("lifted_at", null);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SuppressionRow[];
    return unique.map((address) => {
      const active = rows.filter((row) => row.normalized_address === address);
      const blocking = active.find(
        (row) =>
          isSuppressionReason(row.reason) &&
          blocksCategory(row.reason as SuppressionReason, category),
      );
      return {
        address,
        blocked: Boolean(blocking),
        unknown: false,
        reason: blocking ? (blocking.reason as SuppressionReason) : null,
      };
    });
  } catch (error) {
    console.error("[email-suppression] تعذّر قراءة حالة الحجب", {
      recipients: unique.length,
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return unique.map((address) => ({
      address,
      blocked: false,
      unknown: true,
      reason: null,
    }));
  }
}

/** هل يُمنع الإرسال لهذا العنوان في هذه الفئة؟ عند تعذّر القراءة: لا يُمنع. */
export async function isRecipientBlocked(
  address: string,
  category: SuppressionCategory = "human_mail",
): Promise<boolean> {
  const [state] = await recipientStates([address], category);
  return Boolean(state?.blocked);
}

export type LiftResult = { lifted: boolean; message: string };

/**
 * رفع الحجب لعنوان واحد بعد تجديد الموافقة. لا يُستخدم جماعياً أبداً، ولا يحذف
 * أي صف: يضبط `lifted_at`/`lifted_by` فقط فيبقى الدليل التاريخي كاملاً.
 * حجب الشكوى غير قابل للرفع.
 */
export async function liftRecipientBlock(
  address: string,
  options?: { liftedBy?: string | null; note?: string | null },
): Promise<LiftResult> {
  const normalized = normalizeAddress(address);
  if (!looksLikeAddress(normalized)) {
    return { lifted: false, message: "عنوان البريد غير صالح." };
  }
  try {
    const client = await db();
    const { data, error } = await client
      .from("email_suppressions")
      .select("id, normalized_address, reason, source, created_at, lifted_at")
      .eq("normalized_address", normalized)
      .is("lifted_at", null);
    if (error) throw new Error(error.message);
    const active = (data ?? []) as SuppressionRow[];
    if (active.length === 0) {
      return { lifted: false, message: "لا يوجد حجب فعّال على هذا العنوان." };
    }
    const nonLiftable = active.find(
      (row) => isSuppressionReason(row.reason) && !isLiftableReason(row.reason),
    );
    if (nonLiftable) {
      return {
        lifted: false,
        message:
          "العنوان محجوب بسبب شكوى بريد مزعج، وهذا النوع من الحجب لا يمكن رفعه. راسل صاحب العنوان بوسيلة أخرى.",
      };
    }
    const now = new Date().toISOString();
    const { error: updateError } = await client
      .from("email_suppressions")
      .update({
        lifted_at: now,
        lifted_by: options?.liftedBy ?? null,
        ...(options?.note ? { note: options.note.slice(0, 500) } : {}),
      })
      .in(
        "id",
        active.map((row) => row.id),
      );
    if (updateError) throw new Error(updateError.message);
    return { lifted: true, message: "تم رفع الحجب؛ يمكن الإرسال إلى هذا العنوان الآن." };
  } catch (error) {
    console.error("[email-suppression] تعذّر رفع الحجب", {
      recipient: maskAddress(normalized),
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { lifted: false, message: "تعذّر رفع الحجب في قاعدة البيانات. أعد المحاولة لاحقاً." };
  }
}

/** إضافة حجب صريح (يدوي أو شكوى أو إلغاء اشتراك). لا يرمي؛ يعيد النجاح فقط. */
export async function recordSuppression(input: {
  address: string;
  reason: SuppressionReason;
  source: string;
  createdBy?: string | null;
  note?: string | null;
}): Promise<{ recorded: boolean }> {
  const normalized = normalizeAddress(input.address);
  if (!looksLikeAddress(normalized)) return { recorded: false };
  try {
    const client = await db();
    const { error } = await client.from("email_suppressions").insert({
      address: normalized,
      normalized_address: normalized,
      reason: input.reason,
      source: input.source.slice(0, 100),
      created_by: input.createdBy ?? null,
      note: input.note?.slice(0, 500) ?? null,
    });
    // تصادم مع حجب فعّال بنفس السبب ليس عطلاً: الحالة المطلوبة قائمة بالفعل.
    if (error && !/duplicate key|unique/i.test(error.message)) throw new Error(error.message);
    return { recorded: true };
  } catch (error) {
    console.error("[email-suppression] تعذّر تسجيل الحجب", {
      recipient: maskAddress(normalized),
      reason: input.reason,
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { recorded: false };
  }
}

/**
 * التقاط الارتداد الصلب من نتيجة نقل حقيقية: رفض نهائي للمستلم برمز 5xx فقط.
 * المهل الزمنية وأعطال الاتصال والمصادقة و4xx المؤقتة لا تُنتج حجباً.
 * الفشل في الكتابة لا يُغيّر أبداً نتيجة الإرسال المُعادة للمستدعي.
 */
export async function captureHardBounce(input: {
  address: string;
  errorCode: string;
  smtpCode: number | null | undefined;
  source: string;
}): Promise<{ suppressed: boolean }> {
  if (!qualifiesAsHardBounce({ errorCode: input.errorCode, smtpCode: input.smtpCode })) {
    return { suppressed: false };
  }
  const result = await recordSuppression({
    address: input.address,
    reason: "bounce_hard",
    source: input.source,
    note: `رفض نهائي من مزوّد المستلم (${input.errorCode} / رمز ${input.smtpCode ?? "غير متوفر"}).`,
  });
  return { suppressed: result.recorded };
}
