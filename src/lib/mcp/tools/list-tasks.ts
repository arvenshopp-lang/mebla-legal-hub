import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, requireDb, resolveOrganization, result, riyadhDate } from "../helpers";

const STATUS = ["pending", "in_progress", "completed", "cancelled", "overdue"] as const;

export default defineTool({
  name: "list_tasks",
  title: "قائمة المهام",
  description: "يعرض مهام مكتب المستخدم، مع إمكانية قصر النتائج على المهام المسندة إليه أو على حالة محددة.",
  inputSchema: {
    status: z.enum(STATUS).optional().describe("تصفية بحالة المهمة."),
    mine_only: z.boolean().optional().describe("قصر النتائج على المهام المسندة للمستخدم الحالي."),
    limit: z.number().int().optional().describe("عدد النتائج (1 إلى 50، الافتراضي 20)."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    let query = db
      .from("tasks")
      .select("id, title, description, status, priority, due_date, case_id, cases(case_title)")
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.mine_only) query = query.eq("assigned_to", ctx.getUserId() ?? "");

    const { data, error } = await query;
    if (error) dbError("قراءة المهام");
    const rows = data ?? [];
    if (rows.length === 0) return result("لا توجد مهام مطابقة.", { tasks: [] });

    const text = rows
      .map((row) => {
        const parent = row.cases as { case_title?: string } | null;
        return `• ${row.title} — ${row.status} (${row.priority}) — ${riyadhDate(row.due_date)}${
          parent?.case_title ? ` — ${parent.case_title}` : ""
        }`;
      })
      .join("\n");
    return result(`${rows.length} مهمة:\n${text}`, { tasks: rows });
  },
});