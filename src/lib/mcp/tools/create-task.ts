import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, requireDb, resolveOrganization, result, riyadhDate } from "../helpers";

const PRIORITY = ["low", "medium", "high", "urgent"] as const;

export default defineTool({
  name: "create_task",
  title: "إنشاء مهمة",
  description:
    "ينشئ مهمة جديدة في مكتب المستخدم، مع إمكانية ربطها بقضية قائمة وتحديد تاريخ الاستحقاق والأولوية.",
  inputSchema: {
    title: z.string().describe("عنوان المهمة."),
    description: z.string().optional().describe("تفاصيل المهمة."),
    case_reference: z.string().optional().describe("معرّف القضية أو رقمها لربط المهمة بها."),
    due_date: z.string().optional().describe("تاريخ الاستحقاق بصيغة YYYY-MM-DD أو ISO."),
    priority: z.enum(PRIORITY).optional().describe("أولوية المهمة (الافتراضي: medium)."),
    assign_to_me: z.boolean().optional().describe("إسناد المهمة للمستخدم الحالي (الافتراضي: نعم)."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const title = input.title.trim();
    if (title.length < 2 || title.length > 200) {
      throw new ToolError("عنوان المهمة يجب أن يكون بين حرفين و200 حرف.");
    }

    let dueDate: string | null = null;
    if (input.due_date?.trim()) {
      const parsed = Date.parse(input.due_date.trim());
      if (!Number.isFinite(parsed)) throw new ToolError("تاريخ الاستحقاق غير صالح.");
      dueDate = new Date(parsed).toISOString();
    }

    let caseId: string | null = null;
    if (input.case_reference?.trim()) {
      const reference = input.case_reference.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);
      let lookup = db.from("cases").select("id, case_title").eq("organization_id", organizationId).limit(1);
      lookup = isUuid
        ? lookup.eq("id", reference)
        : lookup.or(`case_number.eq.${reference},public_code.eq.${reference}`);
      const { data: found, error: lookupError } = await lookup.maybeSingle();
      if (lookupError) dbError("التحقق من القضية");
      if (!found) throw new ToolError("لا توجد قضية مطابقة في مكتبك لربط المهمة بها.");
      caseId = found.id;
    }

    const { data, error } = await db
      .from("tasks")
      .insert({
        organization_id: organizationId,
        case_id: caseId,
        title,
        description: input.description?.trim() || null,
        due_date: dueDate,
        priority: input.priority ?? "medium",
        status: "pending",
        assigned_to: input.assign_to_me === false ? null : (ctx.getUserId() ?? null),
        created_by: ctx.getUserId() ?? null,
      })
      .select("id, title, status, priority, due_date, case_id")
      .single();
    if (error || !data) dbError("إنشاء المهمة");

    return result(
      `أُنشئت المهمة «${data.title}» بأولوية ${data.priority} واستحقاق ${riyadhDate(data.due_date)}.`,
      { task: data },
    );
  },
});