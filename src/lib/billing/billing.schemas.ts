/**
 * مخططات التحقق من مدخلات المركز المالي (مشتركة بين الخادم والواجهة).
 * قاعدة ثابتة: لا يُقبل أي إجمالي محسوب في المتصفح — تُقبل البنود فقط،
 * وتُحسب الإجماليات في قاعدة البيانات.
 */
import { z } from "zod";

const money = z.number().finite().min(0).max(100_000_000);
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const uuid = z.string().uuid("معرّف غير صالح.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح.");
const isoDateTime = z.string().min(4).max(40);

export const paginationSchema = z.object({
  page: z.number().int().min(1).max(5000).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

export const invoiceFiltersSchema = paginationSchema.extend({
  search: optionalText(120),
  status: optionalText(30),
  organizationId: uuid.nullable().optional(),
  from: optionalText(40),
  to: optionalText(40),
});

export const draftItemSchema = z.object({
  description: text(300).min(2, "وصف البند مطلوب."),
  quantity: z.number().finite().min(0.01, "الكمية يجب أن تكون أكبر من صفر.").max(100_000),
  unitPrice: money,
  discountAmount: money,
});

export const draftSchema = z
  .object({
    id: uuid.nullable().optional(),
    organizationId: uuid.nullable().optional(),
    userId: uuid.nullable().optional(),
    planCode: optionalText(60),
    planLabel: optionalText(120),
    customerName: text(200).min(2, "اسم العميل مطلوب."),
    customerLegalName: optionalText(200),
    customerEmail: z
      .union([z.literal(""), z.string().trim().email("البريد الإلكتروني غير صالح.").max(200)])
      .transform((v) => (v ? v : null))
      .nullable()
      .optional(),
    customerPhone: optionalText(40),
    billingAddress: optionalText(400),
    commercialRegistration: optionalText(60),
    taxNumber: optionalText(60),
    currency: z.enum(["SAR"]).default("SAR"),
    taxRate: z.number().finite().min(0).max(100),
    taxExempt: z.boolean(),
    taxExemptionReason: optionalText(300),
    servicePeriodStart: isoDate.nullable().optional(),
    servicePeriodEnd: isoDate.nullable().optional(),
    dueAt: isoDateTime.nullable().optional(),
    notes: optionalText(1000),
    internalNotes: optionalText(1000),
    items: z.array(draftItemSchema).min(1, "أضف بنداً واحداً على الأقل.").max(60),
  })
  .superRefine((value, ctx) => {
    if (value.taxExempt && !value.taxExemptionReason) {
      ctx.addIssue({
        code: "custom",
        path: ["taxExemptionReason"],
        message: "سبب الإعفاء الضريبي مطلوب.",
      });
    }
    value.items.forEach((item, index) => {
      if (item.discountAmount > item.quantity * item.unitPrice) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "discountAmount"],
          message: "الخصم لا يمكن أن يتجاوز قيمة البند.",
        });
      }
    });
  });

export const issueSchema = z.object({
  id: uuid,
  dueAt: isoDateTime.nullable().optional(),
  notify: z.boolean().default(true),
});

export const reasonSchema = z.object({
  id: uuid,
  reason: text(400).min(5, "اكتب سبباً واضحاً (5 أحرف على الأقل)."),
});

export const recordPaymentSchema = z.object({
  invoiceId: uuid,
  amount: money.refine((v) => v > 0, "المبلغ يجب أن يكون أكبر من صفر."),
  method: z.enum(["bank_transfer", "manual", "card", "apple_pay", "stc_pay", "other"]),
  receivedAt: isoDateTime.nullable().optional(),
  bankReference: optionalText(120),
  notes: optionalText(500),
  idempotencyKey: text(80).min(8, "مفتاح منع التكرار مطلوب."),
});

export const decisionSchema = z.object({
  paymentId: uuid,
  decision: z.enum(["approve", "reject"]),
  reason: optionalText(400),
});

export const refundCreateSchema = z.object({
  paymentId: uuid,
  amount: money.refine((v) => v > 0, "مبلغ الاسترداد يجب أن يكون أكبر من صفر."),
  reason: text(400).min(5, "اكتب سبب الاسترداد."),
});

export const refundDecisionSchema = z.object({
  refundId: uuid,
  decision: z.enum(["approve", "reject"]),
  reason: optionalText(400),
});

export const creditNoteSchema = z.object({
  invoiceId: uuid,
  amount: money.refine((v) => v > 0, "المبلغ يجب أن يكون أكبر من صفر."),
  taxAmount: money,
  reason: text(400).min(5, "اكتب سبب إشعار الخصم."),
});

export const noteSchema = z.object({
  resourceType: z.enum(["invoice", "payment", "refund"]),
  resourceId: uuid,
  body: text(1000).min(2, "اكتب نص الملاحظة."),
});

export const bankEntrySchema = z.object({
  statementRef: text(120).min(3, "مرجع الحركة البنكية مطلوب."),
  bankName: optionalText(120),
  amount: money.refine((v) => v > 0, "المبلغ يجب أن يكون أكبر من صفر."),
  valueDate: isoDate,
  payerName: optionalText(200),
  notes: optionalText(500),
});

export const matchEntrySchema = z.object({ entryId: uuid, paymentId: uuid });
export const ignoreEntrySchema = z.object({
  entryId: uuid,
  reason: text(400).min(5, "اكتب سبب التجاهل."),
});

export const closePeriodSchema = z
  .object({ periodStart: isoDate, periodEnd: isoDate, notes: optionalText(500) })
  .refine((v) => v.periodEnd >= v.periodStart, {
    path: ["periodEnd"],
    message: "تاريخ النهاية قبل البداية.",
  });

export const reopenRequestSchema = z.object({
  periodId: uuid,
  reason: text(400).min(10, "اكتب مبرراً تفصيلياً."),
});
export const approveReopenSchema = z.object({ approvalId: uuid });

export const providerCodeSchema = z.object({ code: z.enum(["manual", "moyasar"]) });
export const providerSecretsSchema = z.object({
  code: z.enum(["moyasar"]),
  secrets: z.record(z.string().min(1).max(60), z.string().trim().min(6).max(500)),
});
export const createProviderPaymentSchema = providerCodeSchema.extend({
  invoiceId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(80),
});

export const providerEnabledSchema = providerCodeSchema.extend({ enabled: z.boolean() });

export const sequenceSchema = z.object({
  kind: z.enum(["invoice", "quote", "credit_note"]),
  periodKey: text(10).min(4),
  prefix: text(20)
    .min(2)
    .regex(/^[A-Z0-9-]+$/, "البادئة تُكتب بحروف لاتينية كبيرة وأرقام وشرطات فقط."),
  padding: z.number().int().min(3).max(10),
});

export const taxSettingsSchema = z.object({
  defaultRate: z.number().finite().min(0).max(100),
  taxNumber: text(30),
  sellerName: text(160).min(2, "اسم الجهة المُصدرة مطلوب."),
  sellerAddress: text(400),
  paymentTermsDays: z.number().int().min(0).max(180),
  bankDetails: text(600),
});

export const rangeSchema = z.object({ from: isoDateTime, to: isoDateTime });

export const listFiltersSchema = paginationSchema.extend({
  status: optionalText(30),
  method: optionalText(30),
  search: optionalText(120),
});

/* ----------------------------------------- مخططات المزوّدين والترقيم والرسائل */

export const providerConfigSchema = providerCodeSchema.extend({
  sortOrder: z.number().int().min(0).max(99).nullable().optional(),
  mode: z.enum(["sandbox", "production"]).nullable().optional(),
});

export const sequencePreviewSchema = z.object({
  kind: z.enum(["invoice", "quote", "credit_note"]),
  periodKey: text(10).min(4),
});

export const webhookFiltersSchema = paginationSchema.extend({
  status: optionalText(30),
  provider: optionalText(30),
  search: optionalText(120),
});

export const webhookActionSchema = z.object({
  id: uuid,
  reason: text(400).min(5, "اكتب سبباً واضحاً (5 أحرف على الأقل)."),
});

/** كشف حساب مكتب خلال فترة (يستخدم لمخرج PDF). */
export const statementSchema = z.object({
  organizationId: uuid,
  from: isoDateTime,
  to: isoDateTime,
});
