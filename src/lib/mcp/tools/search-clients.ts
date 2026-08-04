import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, requireDb, resolveOrganization, result } from "../helpers";

export default defineTool({
  name: "search_clients",
  title: "بحث العملاء",
  description:
    "يبحث في عملاء المكتب بالاسم أو اسم المنشأة ويعيد بيانات التعريف الأساسية فقط دون أي بيانات هوية أو اتصال حساسة.",
  inputSchema: {
    query: z.string().optional().describe("اسم العميل أو المنشأة."),
    limit: z.number().int().optional().describe("عدد النتائج (1 إلى 50، الافتراضي 20)."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    // أقل صلاحية ممكنة: لا هوية وطنية ولا سجل تجاري ولا هاتف ولا بريد.
    let query = db
      .from("clients")
      .select("id, full_name, company_name, client_type, status, city, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (input.query?.trim()) {
      const term = input.query.trim().replace(/[%,()]/g, " ");
      query = query.or(`full_name.ilike.%${term}%,company_name.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) dbError("قراءة العملاء");
    const rows = data ?? [];
    if (rows.length === 0) return result("لا يوجد عميل مطابق.", { clients: [] });

    const text = rows
      .map(
        (row) =>
          `• ${row.company_name ?? row.full_name} — ${row.client_type === "company" ? "منشأة" : "فرد"} — ${row.status}${row.city ? ` — ${row.city}` : ""}`,
      )
      .join("\n");
    return result(`${rows.length} عميل:\n${text}`, { clients: rows });
  },
});