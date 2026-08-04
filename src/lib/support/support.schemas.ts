/**
 * مخططات التحقق لمركز الدعم — مشتركة بين دوال الخادم والواجهة.
 * لا تُقبل أي قيمة حالة أو مهلة محسوبة في الواجهة: المهل والحالات تُفرض خادمياً.
 */
import { z } from "zod";
import { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from "./support.shared";

export const uuid = z.string().uuid("معرّف غير صالح");

const shortText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} مطلوب`).max(max, `${label} أطول من المسموح`);

export const ticketFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  priority: z.string().trim().max(20).optional(),
  category: z.string().trim().max(40).optional(),
  channel: z.string().trim().max(20).optional(),
  teamId: z.string().trim().max(40).optional(),
  assignedTo: z.string().trim().max(40).optional(),
  slaState: z.string().trim().max(20).optional(),
  organizationId: uuid.optional(),
  onlyBreached: z.boolean().optional(),
  onlyUnassigned: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  sort: z.enum(["updated_at", "created_at", "priority", "due_resolution_at"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
});
export type TicketFiltersInput = z.infer<typeof ticketFiltersSchema>;

export const ticketIdSchema = z.object({ ticketId: uuid });

export const createTicketSchema = z.object({
  subject: shortText(300, "الموضوع"),
  description: shortText(20_000, "الوصف"),
  category: shortText(40, "التصنيف"),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  channel: z.enum(TICKET_CHANNELS).default("internal"),
  requesterEmail: z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").optional().nullable(),
  requesterName: z.string().trim().max(160).optional().nullable(),
  organizationId: uuid.optional().nullable(),
  teamId: uuid.optional().nullable(),
});

export const updateTicketSchema = z.object({
  ticketId: uuid,
  subject: z.string().trim().min(1).max(300).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const transitionSchema = z.object({
  ticketId: uuid,
  to: z.enum(TICKET_STATUSES),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const assignSchema = z.object({
  ticketId: uuid,
  assignedTo: uuid.nullable().optional(),
  teamId: uuid.nullable().optional(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const replySchema = z.object({
  ticketId: uuid,
  body: shortText(20_000, "نص الرد"),
  replyAll: z.boolean().optional(),
  cc: z.array(z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح")).max(10).optional(),
  nextStatus: z.enum(TICKET_STATUSES).optional().nullable(),
  clientRequestId: z.string().trim().min(6).max(80).optional(),
});

export const noteSchema = z.object({
  ticketId: uuid,
  body: shortText(10_000, "نص الملاحظة"),
  mentions: z.array(uuid).max(20).optional(),
  clientRequestId: z.string().trim().min(6).max(80).optional(),
});

export const escalateSchema = z.object({
  ticketId: uuid,
  reason: shortText(500, "سبب التصعيد"),
});

export const mergeSchema = z.object({
  sourceId: uuid,
  targetId: uuid,
  reason: shortText(500, "سبب الدمج"),
});

export const splitSchema = z.object({
  ticketId: uuid,
  subject: shortText(300, "الموضوع"),
  description: shortText(20_000, "الوصف"),
  category: z.string().trim().max(40).optional().nullable(),
  messageIds: z.array(uuid).max(200).optional(),
  reason: shortText(500, "سبب التقسيم"),
});

export const tagsSchema = z.object({ ticketId: uuid, tagIds: z.array(uuid).max(30) });

export const reasonedIdSchema = z.object({
  ticketId: uuid,
  reason: z.string().trim().max(500).optional().nullable(),
});

export const reopenSchema = z.object({
  ticketId: uuid,
  reason: shortText(500, "سبب إعادة الفتح"),
});

/* ------------------------------------------------------------ الإعدادات */

export const teamSchema = z.object({
  id: uuid.optional(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,40}$/, "الرمز بحروف إنجليزية صغيرة وأرقام فقط"),
  nameAr: shortText(120, "اسم الفريق"),
  description: z.string().trim().max(400).optional().nullable(),
  mailboxId: uuid.optional().nullable(),
  managerUserId: uuid.optional().nullable(),
  escalationTeamId: uuid.optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const teamMemberSchema = z.object({
  teamId: uuid,
  userId: uuid,
  isLead: z.boolean().optional(),
});

export const categorySchema = z.object({
  id: uuid.optional(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,40}$/, "الرمز بحروف إنجليزية صغيرة وأرقام فقط"),
  nameAr: shortText(120, "اسم التصنيف"),
  description: z.string().trim().max(400).optional().nullable(),
  defaultPriority: z.enum(TICKET_PRIORITIES).default("medium"),
  defaultTeamId: uuid.optional().nullable(),
  slaPolicyId: uuid.optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const slaPolicySchema = z.object({
  id: uuid.optional(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,40}$/, "الرمز بحروف إنجليزية صغيرة وأرقام فقط"),
  nameAr: shortText(120, "اسم السياسة"),
  calendarId: uuid,
  planCode: z.string().trim().max(40).optional().nullable(),
  priority: z.enum(TICKET_PRIORITIES).optional().nullable(),
  channel: z.enum(TICKET_CHANNELS).optional().nullable(),
  category: z.string().trim().max(40).optional().nullable(),
  firstResponseMinutes: z.number().int().min(5).max(100_000),
  resolutionMinutes: z.number().int().min(15).max(500_000),
  pauseOnCustomerWait: z.boolean().default(true),
  warningPercent: z.number().int().min(10).max(99).default(75),
  criticalPercent: z.number().int().min(20).max(100).default(90),
  isActive: z.boolean().optional(),
});

export const escalationRuleSchema = z.object({
  id: uuid.optional(),
  nameAr: shortText(120, "اسم القاعدة"),
  triggerType: z.enum(["sla_breach", "sla_warning", "manual", "no_response", "priority"]),
  priority: z.enum(TICKET_PRIORITIES).optional().nullable(),
  category: z.string().trim().max(40).optional().nullable(),
  channel: z.enum(TICKET_CHANNELS).optional().nullable(),
  fromLevel: z.number().int().min(0).max(9).default(0),
  toLevel: z.number().int().min(1).max(10).default(1),
  targetTeamId: uuid.optional().nullable(),
  targetUserId: uuid.optional().nullable(),
  notifyManager: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const toggleSchema = z.object({ id: uuid, isActive: z.boolean() });

/* ------------------------------------------------------------ CSAT والتقارير */

export const csatRequestSchema = z.object({ ticketId: uuid });

export const csatSubmitSchema = z.object({
  token: z.string().trim().min(20).max(200),
  rating: z.number().int().min(1, "اختر تقييماً من 1 إلى 5").max(5, "اختر تقييماً من 1 إلى 5"),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const csatTokenSchema = z.object({ token: z.string().trim().min(20).max(200) });

export const reportRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  teamId: uuid.optional().nullable(),
  organizationId: uuid.optional().nullable(),
});
