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
  | "integrity_not_pass"
  | "snoozed";

export type PromptEligibilityInput = {
  /** هل المستخدم مخوّل بإدارة إعدادات المكتب (owner/admin). */
  isManager: boolean;
  scoreEligible: boolean;
  score: number | null;
  minimumScore: number;
  /** بوابة نزاهة الظهور العام: الدعوة لا تُعرض إلا عند `pass`. */
  integrityPass: boolean;
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
  if (!input.integrityPass) return { visible: false, reason: "integrity_not_pass" };
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

/* ==========================================================================
 * إعداد الظهور العام الدائم في إعدادات المكتب (Consent Control)
 * مصدر الحقيقة للموافقة هو `public_opt_in` نفسه — لا حالة موافقة موازية،
 * ولا يمكن للإعداد تجاوز الأهلية أو بوابة النزاهة (Fail closed).
 * ========================================================================== */

export const CONSENT_SECTION_TITLE = "الظهور في مؤشر الإنجاز";
export const CONSENT_SECTION_BODY = [
  "يمكن للمكاتب المؤهلة السماح بإظهار اسم المكتب المعتمد وشعاره ومؤشر الإنجاز التشغيلي وترتيبه ضمن قائمة الأكثر إنجازاً على مِهلة.",
  "لن تظهر بيانات العملاء أو القضايا أو المستندات أو الموظفين أو أي بيانات قانونية أو مالية خاصة.",
] as const;
export const CONSENT_PUBLIC_FIELDS = [
  "اسم المكتب المعتمد",
  "الشعار",
  "مؤشر الإنجاز التشغيلي",
  "الترتيب",
] as const;
export const CONSENT_TOGGLE_LABEL = "السماح بالظهور العام";
export const CONSENT_DISCLAIMER = OPT_IN_PROMPT_DISCLAIMER;
export const CONSENT_ENABLE_TOAST = OPT_IN_ACCEPT_TOAST;
export const CONSENT_DISABLE_TOAST = "تم إيقاف الظهور العام لمكتبك";
export const CONSENT_MANAGER_ONLY_NOTE = "إدارة الظهور العام متاحة لمدير المكتب فقط.";

/** حالة الظهور العام كما تُعرض للمكتب — بلا أي سبب تقني لبوابة منع التلاعب. */
export type ConsentStatus = "enabled" | "under_review" | "eligible_off" | "not_eligible";

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  enabled: "الظهور العام مفعّل",
  under_review: "الظهور العام قيد المراجعة.",
  eligible_off: "مؤهل — الظهور العام غير مفعّل",
  not_eligible: "غير مؤهل للظهور العام حالياً",
};

export const CONSENT_STATUS_HINTS: Record<ConsentStatus, string> = {
  enabled:
    "قد يظهر اسم المكتب المعتمد وشعاره ومؤشر الإنجاز التشغيلي وترتيبه ضمن قائمة الأكثر إنجازاً على مِهلة.",
  under_review: "سنعيد تقييم الظهور العام تلقائياً بعد اكتمال المراجعة.",
  eligible_off: "يمكنك تفعيل الظهور العام في أي وقت، وإيقافه لاحقاً بلا أثر على بيانات مكتبك.",
  not_eligible: "يتطلب التأهل توفر بيانات تشغيلية كافية واستيفاء شروط مؤشر الإنجاز.",
};

export type ConsentEvaluationInput = {
  /** هل المستخدم مدير مكتب (owner/admin) بعضوية نشطة. */
  isManager: boolean;
  publicOptIn: boolean;
  scoreEligible: boolean;
  score: number | null;
  minimumScore: number;
  /** بوابة منع التلاعب: `pass` فقط تسمح بالتفعيل. */
  integrityStatus: "pass" | "review_required" | "ineligible";
  organizationActive: boolean;
  subscriptionActive: boolean;
  platformExcluded: boolean;
  publicNameApproved: boolean;
  /** مفتاح الميزة على مستوى المنصة. */
  featureEnabled: boolean;
};

export type ConsentEvaluation = {
  status: ConsentStatus;
  /** هل تتحقق كل شروط الظهور الفعلي الآن (بغض النظر عن الموافقة). */
  eligible: boolean;
  canEnable: boolean;
  canDisable: boolean;
  isManager: boolean;
  publicOptIn: boolean;
};

/** قرار نقي لحالة الظهور العام في الإعدادات — لا يعدل النتيجة ولا حدود البوابة. */
export function evaluateConsentState(input: ConsentEvaluationInput): ConsentEvaluation {
  const eligible =
    input.featureEnabled &&
    input.scoreEligible &&
    input.score !== null &&
    input.score >= input.minimumScore &&
    input.integrityStatus === "pass" &&
    input.organizationActive &&
    input.subscriptionActive &&
    !input.platformExcluded &&
    input.publicNameApproved;

  const status: ConsentStatus = input.publicOptIn
    ? "enabled"
    : eligible
      ? "eligible_off"
      : input.integrityStatus === "review_required"
        ? "under_review"
        : "not_eligible";

  return {
    status,
    eligible,
    canEnable: input.isManager && eligible && !input.publicOptIn,
    canDisable: input.isManager && input.publicOptIn,
    isManager: input.isManager,
    publicOptIn: input.publicOptIn,
  };
}
