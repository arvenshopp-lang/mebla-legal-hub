import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, requireDb, resolveOrganization, result, riyadhDate, windowEnd } from "../helpers";

export default defineTool({
  name: "upcoming_deadlines",
  title: "المهل القادمة",
  description:
    "يعرض المهل النظامية القادمة والمتأخرة لمكتب المستخدم خلال عدد محدد من الأيام، مرتبةً بتاريخ الاستحقاق.",
  inputSchema: {
    days: z.number().int().optional().describe("عدد الأيام القادمة (1 إلى 120، الافتراضي 14)."),
    include_overdue: z.boolean().optional().describe("تضمين المهل المتأخرة (الافتراضي: نعم)."),
    limit: z.number().int().optional().describe("عدد النتائج (1 إلى 50، الافتراضي 20)."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const days = Math.min(Math.max(input.days ?? 14, 1), 120);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const includeOverdue = input.include_overdue !== false;

    let query = db
      .from("deadlines")
      .select(
        "id, title, deadline_type, due_date, status, priority, notes, case_id, cases(case_title, case_number)",
      )
      .eq("organization_id", organizationId)
      .lte("due_date", windowEnd(days))
      .order("due_date", { ascending: true })
      .limit(limit);
    query = includeOverdue
      ? query.in("status", ["active", "overdue"])
      : query.eq("status", "active").gte("due_date", new Date().toISOString());

    const { data, error } = await query;
    if (error) dbError("قراءة المهل");

    const rows = data ?? [];
    if (rows.length === 0)
      return result(`لا توجد مهل مستحقة خلال ${days} يوماً.`, { deadlines: [] });

    const text = rows
      .map((row) => {
        const parent = row.cases as { case_title?: string } | null;
        return `• ${riyadhDate(row.due_date)} — ${row.title} — ${parent?.case_title ?? "قضية"} — ${row.status} (${row.priority})`;
      })
      .join("\n");
    return result(`${rows.length} مهلة خلال ${days} يوماً:\n${text}`, { deadlines: rows });
  },
});
