import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  dbError,
  requireDb,
  resolveOrganization,
  result,
  riyadhDateTime,
  windowEnd,
} from "../helpers";

export default defineTool({
  name: "upcoming_hearings",
  title: "الجلسات القادمة",
  description:
    "يعرض الجلسات المجدولة القادمة لمكتب المستخدم خلال عدد محدد من الأيام بتوقيت الرياض.",
  inputSchema: {
    days: z.number().int().optional().describe("عدد الأيام القادمة (1 إلى 120، الافتراضي 14)."),
    limit: z.number().int().optional().describe("عدد النتائج (1 إلى 50، الافتراضي 20)."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const days = Math.min(Math.max(input.days ?? 14, 1), 120);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    const { data, error } = await db
      .from("hearings")
      .select(
        "id, title, hearing_type, hearing_date, status, court_name, judicial_circuit, location, remote_link, case_id, cases(case_title, case_number)",
      )
      .eq("organization_id", organizationId)
      .eq("status", "scheduled")
      .gte("hearing_date", new Date().toISOString())
      .lte("hearing_date", windowEnd(days))
      .order("hearing_date", { ascending: true })
      .limit(limit);
    if (error) dbError("قراءة الجلسات");

    const rows = data ?? [];
    if (rows.length === 0)
      return result(`لا توجد جلسات مجدولة خلال ${days} يوماً.`, { hearings: [] });

    const text = rows
      .map((row) => {
        const parent = row.cases as { case_title?: string; case_number?: string | null } | null;
        return `• ${riyadhDateTime(row.hearing_date)} — ${row.title} — ${parent?.case_title ?? "قضية"} — ${
          row.court_name ?? "بلا محكمة"
        }`;
      })
      .join("\n");
    return result(`${rows.length} جلسة خلال ${days} يوماً:\n${text}`, { hearings: rows });
  },
});
