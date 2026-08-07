/**
 * حالة استقبال المستلم لدى خدمة البريد المُدارة — خادمي فقط.
 *
 * خدمة البريد المُدارة تحجب أي عنوان ألغى الاشتراك أو ارتد بريده أو رفع شكوى،
 * فيفشل الإرسال برمز `recipient_suppressed`. هذه الطبقة تكشف الحجب **قبل**
 * الإرسال حتى يرى الموظف السبب في نافذة الإنشاء بدل فشل لاحق في سجل الأعطال،
 * وتتيح رفع الحجب بعد موافقة موثقة من المستلم فقط.
 *
 * لا تُخزَّن حالة الحجب في أي جدول محلي؛ المصدر الوحيد للحقيقة هو خدمة البريد.
 */
import { EmailAPIError, getEmailUnsubscribe, setEmailUnsubscribe } from "@lovable.dev/email-js";

/** نطاق الإرسال المُعتمد لخدمة البريد المُدارة (نفس القيمة في محرك البريد). */
export const MANAGED_SENDER_DOMAIN = "mail.mehlalex.com";

export type RecipientState = {
  address: string;
  /** محجوب عن الاستقبال عبر خدمة البريد المُدارة. */
  blocked: boolean;
  /** تعذّر التحقق (خدمة غير مهيأة أو تعطّل مؤقت) — لا يُعامل كحجب. */
  unknown: boolean;
};

function apiKey(): string | null {
  const key = (process.env["LOVABLE_API_KEY"] ?? "").trim();
  return key.length > 0 ? key : null;
}

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

/** حالة استقبال قائمة عناوين. لا ترمي أبداً: الفشل يُعاد كـ`unknown`. */
export async function recipientStates(addresses: string[]): Promise<RecipientState[]> {
  const unique = [...new Set(addresses.map(normalize).filter((a) => a.includes("@")))].slice(0, 50);
  const key = apiKey();
  if (!key) return unique.map((address) => ({ address, blocked: false, unknown: true }));
  return Promise.all(
    unique.map(async (address) => {
      try {
        const state = await getEmailUnsubscribe(
          { recipient: address, domain: MANAGED_SENDER_DOMAIN },
          { apiKey: key },
        );
        return { address, blocked: state.subscribed === false, unknown: false };
      } catch {
        return { address, blocked: false, unknown: true };
      }
    }),
  );
}

export type LiftResult = { lifted: boolean; message: string };

/**
 * رفع الحجب لعنوان واحد بعد تجديد الموافقة. لا يُستخدم جماعياً أبداً،
 * وشكوى السبام غير قابلة للرفع لدى المزوّد فتُعاد رسالة عربية واضحة.
 */
export async function liftRecipientBlock(address: string): Promise<LiftResult> {
  const key = apiKey();
  if (!key) return { lifted: false, message: "خدمة البريد غير مهيأة على الخادم." };
  try {
    const state = await setEmailUnsubscribe(
      { recipient: normalize(address), domain: MANAGED_SENDER_DOMAIN, subscribed: true },
      { apiKey: key },
    );
    return state.subscribed
      ? { lifted: true, message: "تم رفع الحجب؛ يمكن الإرسال إلى هذا العنوان الآن." }
      : { lifted: false, message: "بقي العنوان محجوباً لدى خدمة البريد." };
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === "complaint_not_liftable") {
      return {
        lifted: false,
        message:
          "العنوان محجوب بسبب شكوى بريد مزعج، وهذا النوع من الحجب لا يمكن رفعه. راسل صاحب العنوان بوسيلة أخرى.",
      };
    }
    return {
      lifted: false,
      message: "تعذّر رفع الحجب لدى خدمة البريد. أعد المحاولة لاحقاً.",
    };
  }
}
