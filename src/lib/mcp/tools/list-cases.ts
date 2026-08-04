import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, requireDb, resolveOrganization, result, riyadhDate } from "../helpers";

const STATUS = [
  "draft",
  "open",
  "in_progress",
  "waiting",
  "judgment_issued",
  "execution",
  "closed",
  "archived",
] as const;

export default defineTool({
  name: "list_cases",
  title: "قائمة القضايا",
  description:
    "يعرض قضايا مكتب المستخدم مع رقم القضية والمحكمة والحالة والإجراء القادم. يدعم البحث بالنص والتصفية بالحالة.",
  inputSchema: {
    query: z.string().optional().describe("بحث في عنوان القضية أو رقمها أو اسم المحكمة."),
    status: z.enum(STATUS).optional().describe("تصفية بحالة القضية."),
    limit: z.number().int().optional().describe("عدد النتائج (1 إلى 50، الافتراضي 20)."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    let query = db
      .from("cases")
      .select(
        "id, case_number, public_code, case_title, case_type, status, priority, court_name, judicial_circuit, next_action, next_action_date, opened_at, last_activity_at",
      )
      .eq("organization_id", organizationId)
      .order("last_activity_at", { ascending: false })
      .limit(limit);

    if (input.status) query = query.eq("status", input.status);
    if (input.query?.trim()) {
      const term = input.query.trim().replace(/[%,()]/g, " ");
      query = query.or(
        `case_title.ilike.%${term}%,case_number.ilike.%${term}%,court_name.ilike.%${term}%`,
      );
    }

    const { data, error } = await query;
    if (error) dbError("قراءة القضايا");
    const rows = data ?? [];
    if (rows.length === 0) return result("لا توجد قضايا مطابقة.", { cases: [] });

    const text = rows
      .map(
        (row) =>
          `• ${row.case_title} — رقم ${row.case_number ?? "غير مسجل"} — ${row.status} — ${
            row.court_name ?? "بلا محكمة"
          }${row.next_action ? ` — القادم: ${row.next_action} (${riyadhDate(row.next_action_date)})` : ""}`,
      )
      .join("\n");
    return result(`${rows.length} قضية:\n${text}`, { cases: rows });
  },
});