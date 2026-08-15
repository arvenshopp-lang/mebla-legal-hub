/**
 * مؤشر الإنجاز التشغيلي — B3C: عقود الموافقة على الظهور العام ودعوة التأهل.
 *
 * قواعد ثابتة:
 * - مصدر الحقيقة للموافقة هو `public_opt_in` فقط، ولا توجد حالة (State Machine) جديدة.
 * - توثيق الموافقة (`opted_in_at` / `opted_in_by`) تحدده قاعدة البيانات، وهذه الوحدة
 *   تعكس دلالتها فقط لأغراض العرض والاختبار — لا تكتبها بديلاً عن الحارس.
 * - دعوة التأهل لا تُعرض إذا كان أي شرط آخر يمنع الظهور الفعلي.
 */

/** مدة التأجيل الرسمية لـ v1 عند «ليس الآن» أو الإغلاق بلا اختيار. */
export const OPT_IN_SNOOZE_DAYS = 30;
export const OPT_IN_SNOOZE_MS = OPT_IN_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

/** أقل فاصل بين كتابتين لطابع ظهور الدعوة — يمنع كتابة مع كل تحميل/إعادة رسم. */
export const PROMPT_MARK_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const OPT_IN_PROMPT_TITLE = "مكتبك مؤهل للظهور ضمن الأكثر إنجازاً على مِهلة";
export const OPT_IN_PROMPT_BODY = [
  "حقق مكتبك مستوى يؤهله للظهور ضمن قائمة المكاتب الأكثر إنجازاً على مِهلة.",
  "عند الموافقة، قد يظهر للعامة اسم المكتب المعتمد وشعاره ومؤشر الإنجاز التشغيلي وترتيبه فقط.",
  "لن تعرض مِهلة بيانات العملاء أو القضايا أو المستندات أو الموظفين أو أي بيانات قانونية أو مالية خاصة بالمكتب.",
] as const;
export const OPT_IN_PROMPT_DISCLAIMER =
  "يعكس المؤشر مستوى الإنجاز التشغيلي داخل مِهلة ولا يمثل تقييماً لجودة الخدمات القانونية أو نتائج القضايا.";
export const OPT_IN_PROMPT_ACCEPT_LABEL = "نعم، أريد الظهور";
export const OPT_IN_PROMPT_SNOOZE_LABEL = "ليس الآن";
export const OPT_IN_ACCEPT_TOAST = "تم تفعيل الظهور العام لمكتبك";

/** أسباب عدم عرض الدعوة — تشخيصية للمكتب نفسه فقط، بلا أي بيانات مكاتب أخرى. */
export type PromptBlockReason =
  | "eligible"
  | "not_authorized"
  | "score_not_eligible"
  | "score_below_threshold"
  | "organization_inactive"
  | "subscription_inactive"
  | "platform_excluded"
  | "already_opted_in"
  | "public_name_missing"
  | "snoozed";

export type PromptEligibilityInput = {
  /** هل المستخدم مخوّل بإدارة إعدادات المكتب (owner/admin). */
  isManager: boolean;
  scoreEligible: boolean;
  score: number | null;
  minimumScore: number;
  organizationActive: boolean;
  subscriptionActive: boolean;
  platformExcluded: boolean;
  publicOptIn: boolean;
  /** الاسم العام المعتمد الذي ستستخدمه قائمة الترتيب فعلياً (صفحة عامة منشورة). */
  publicNameApproved: boolean;
  snoozedUntil: string | null;
  now: string | number | Date;
};

export type PromptEligibility = { visible: boolean; reason: PromptBlockReason };

/**
 * قرار عرض الدعوة. الترتيب مقصود: الصلاحية أولاً ثم موانع الظهور الفعلي،
 * فلا يُخبر المكتب أنه «مؤهل للظهور» وهناك شرط آخر يمنع ظهوره.
 */
export function evaluatePromptEligibility(input: PromptEligibilityInput): PromptEligibility {
  if (!input.isManager) return { visible: false, reason: "not_authorized" };
  if (input.publicOptIn) return { visible: false, reason: "already_opted_in" };
  if (input.platformExcluded) return { visible: false, reason: "platform_excluded" };
  if (!input.organizationActive) return { visible: false, reason: "organization_inactive" };
  if (!input.subscriptionActive) return { visible: false, reason: "subscription_inactive" };
  if (!input.scoreEligible || input.score === null)
    return { visible: false, reason: "score_not_eligible" };
  if (input.score < input.minimumScore) return { visible: false, reason: "score_below_threshold" };
  if (!input.publicNameApproved) return { visible: false, reason: "public_name_missing" };
  const now = new Date(input.now).getTime();
  if (input.snoozedUntil !== null && new Date(input.snoozedUntil).getTime() > now)
    return { visible: false, reason: "snoozed" };
  return { visible: true, reason: "eligible" };
}

export type OptInMetadata = { optedInAt: string | null; optedInBy: string | null };

/**
 * دلالة توثيق الموافقة المفروضة في `private.ranking_settings_guard`:
 * - false → true: قيم موثوقة من القاعدة (`now()`, `auth.uid()`).
 * - true → true: الحفاظ على التوثيق الأصلي.
 * - أي حالة بلا موافقة: تفريغ التوثيق (الحقل يمثل الموافقة الحالية لا السجل التاريخي).
 * السجل التاريخي لعمليات opt-in/opt-out يبقى في سجلات التدقيق.
 */
export function resolveOptInMetadata(args: {
  previous: { publicOptIn: boolean } & OptInMetadata;
  nextOptIn: boolean;
  actorUserId: string | null;
  now: string;
}): OptInMetadata {
  if (!args.nextOptIn) return { optedInAt: null, optedInBy: null };
  if (args.previous.publicOptIn) {
    return { optedInAt: args.previous.optedInAt, optedInBy: args.previous.optedInBy };
  }
  return { optedInAt: args.now, optedInBy: args.actorUserId };
}

/** طابع نهاية التأجيل الرسمي (30 يوماً) من لحظة الاختيار. */
export function snoozeUntil(now: string | number | Date = new Date()): string {
  return new Date(new Date(now).getTime() + OPT_IN_SNOOZE_MS).toISOString();
}
