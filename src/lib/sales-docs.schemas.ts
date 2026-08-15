/**
 * مخططات التحقق من مدخلات وحدة عروض الأسعار والمقترحات والعقود.
 * قاعدة ثابتة: لا تُقبل أي إجماليات محسوبة في المتصفح — فقط البنود الخام،
 * وتُعاد الإجماليات عبر computeSalesDocTotals على الخادم قبل أي كتابة.
 */
import { z } from "zod";

export const uuid = z.string().uuid("معرّف غير صالح.");
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح.")
  .nullable()
  .optional();

export const paginationSchema = z.object({
  page: z.number().int().min(1).max(5000).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

export const kindEnum = z.enum(["quote", "proposal", "contract"]);
export const statusEnum = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
  "active",
  "terminated",
]);

export const listFiltersSchema = paginationSchema.extend({
  search: optionalText(120),
  kind: kindEnum.nullable().optional(),
  status: statusEnum.nullable().optional(),
  companyId: uuid.nullable().optional(),
  from: optionalText(40),
  to: optionalText(40),
  discarded: z.enum(["exclude", "only", "include"]).nullable().optional(),
});

export const itemInputSchema = z.object({
  description: text(300).min(2, "وصف البند مطلوب."),
  quantity: z.number().finite().min(0.01, "الكمية يجب أن تكون أكبر من صفر.").max(100_000),
  unitPrice: z.number().finite().min(0).max(100_000_000),
  discountAmount: z.number().finite().min(0).max(100_000_000),
});

export const draftSchema = z.object({
  id: uuid.nullable().optional(),
  kind: kindEnum,
  title: text(200).min(2, "عنوان المستند مطلوب."),
  organizationId: uuid.nullable().optional(),
  companyId: uuid.nullable().optional(),
  contactId: uuid.nullable().optional(),
  dealId: uuid.nullable().optional(),
  templateId: uuid.nullable().optional(),
  currency: z.enum(["SAR"]).default("SAR"),
  discountType: z.enum(["percent", "amount"]),
  discountValue: z.number().finite().min(0).max(100_000_000),
  taxRate: z.number().finite().min(0).max(100),
  intro: optionalText(2000),
  terms: optionalText(4000),
  notes: optionalText(1000),
  validUntil: isoDate,
  startsOn: isoDate,
  endsOn: isoDate,
  recipientName: optionalText(150),
  recipientCompany: optionalText(180),
  recipientPhone: optionalText(30),
  recipientEmail: z
    .union([z.literal(""), z.string().trim().email("بريد إلكتروني غير صالح.")])
    .transform((v) => (v === "" ? null : (v ?? null)))
    .nullable()
    .optional(),
  recipientAddress: optionalText(300),
  items: z.array(itemInputSchema).min(1, "أضف بنداً واحداً على الأقل.").max(80),
});

export const idSchema = z.object({ id: uuid });
export const deleteSchema = z.object({ id: uuid });

export const requestApprovalSchema = z.object({ id: uuid, note: optionalText(400) });
export const approveSchema = z.object({ id: uuid, approve: z.boolean(), note: optionalText(400) });
export const sendSchema = z.object({
  id: uuid,
  toEmail: z.string().trim().email("بريد إلكتروني غير صالح."),
  message: optionalText(1000),
});

export const decisionSchema = z.object({
  id: uuid,
  decision: z.enum(["accepted", "rejected", "expired", "cancelled"]),
  note: optionalText(400),
  signerName: optionalText(150),
  signerEmail: z
    .union([z.literal(""), z.string().trim().email()])
    .nullable()
    .optional(),
});

export const signSchema = z.object({
  id: uuid,
  signerName: text(150).min(2, "اسم الموقّع مطلوب."),
  signerEmail: z.string().trim().email("بريد إلكتروني غير صالح."),
  signerRole: optionalText(80),
});

export const lifecycleSchema = z.object({ id: uuid, note: optionalText(400) });

export const convertInvoiceSchema = z.object({ id: uuid, dueAt: optionalText(40) });
export const convertSubscriptionSchema = z.object({
  id: uuid,
  planCode: text(60).min(1, "رمز الباقة مطلوب."),
  startsOn: isoDate,
  endsOn: isoDate,
});

export const templateSchema = z.object({
  id: uuid.nullable().optional(),
  kind: kindEnum,
  name: text(150).min(2, "اسم القالب مطلوب."),
  intro: optionalText(2000),
  terms: optionalText(4000),
  defaultTaxRate: z.number().finite().min(0).max(100),
  defaultValidityDays: z.number().int().min(0).max(365),
  isActive: z.boolean().default(true),
  items: z.array(itemInputSchema).max(80).default([]),
});
