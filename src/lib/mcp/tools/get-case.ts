import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, requireDb, resolveOrganization, result, riyadhDate, riyadhDateTime } from "../helpers";

export default defineTool({
  name: "get_case",
  title: "تفاصيل قضية",
  description:
    "يعرض ملف قضية واحدة (بالمعرّف أو رقم القضية أو الرمز العام) مع أقرب الجلسات والمهل والمهام المرتبطة بها.",
  inputSchema: {
    reference: z.string().describe("معرّف القضية أو رقمها أو رمزها العام المكوّن من عشرة أرقام."),
    organization_id: z.string().optional().describe("معرّف المكتب عند العضوية في أكثر من مكتب."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const db = requireDb(ctx);
    const organizationId = await resolveOrganization(db, ctx, input.organization_id);
    const reference = input.reference.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);

    let lookup = db
      .from("cases")
      .select(
        "id, case_number, public_code, case_title, case_type, status, priority, court_name, court_branch, judicial_circuit, judge_name, client_role, opponent_name, next_action, next_action_date, opened_at, closed_at, last_activity_at",
      )
      .eq("organization_id", organizationId)
      .limit(1);
    lookup = isUuid
      ? lookup.eq("id", reference)
      : lookup.or(`case_number.eq.${reference},public_code.eq.${reference}`);

    const { data, error } = await lookup.maybeSingle();
    if (error) dbError("قراءة بيانات القضية");
    if (!data) throw new ToolError("لا توجد قضية مطابقة في مكتبك.");

    const [hearings, deadlines, tasks] = await Promise.all([
      db
        .from("hearings")
        .select("id, title, hearing_type, hearing_date, status, court_name, location, result")
        .eq("case_id", data.id)
        .order("hearing_date", { ascending: true })
        .limit(10),
      db
        .from("deadlines")
        .select("id, title, deadline_type, due_date, status, priority")
        .eq("case_id", data.id)
        .order("due_date", { ascending: true })
        .limit(10),
      db
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("case_id", data.id)
        .order("due_date", { ascending: true })
        .limit(10),
    ]);

    const lines = [
      `القضية: ${data.case_title}`,
      `رقم القضية: ${data.case_number ?? "غير مسجل"} — الرمز العام: ${data.public_code ?? "غير مُصدر"}`,
      `النوع: ${data.case_type} — الحالة: ${data.status} — الأولوية: ${data.priority}`,
      `المحكمة: ${data.court_name ?? "غير محددة"}${data.judicial_circuit ? ` — الدائرة ${data.judicial_circuit}` : ""}`,
      `صفة العميل: ${data.client_role} — الخصم: ${data.opponent_name ?? "غير مسجل"}`,
      `الإجراء القادم: ${data.next_action ?? "لا يوجد"} (${riyadhDate(data.next_action_date)})`,
      "",
      `الجلسات (${hearings.data?.length ?? 0}):`,
      ...(hearings.data ?? []).map(
        (row) => `• ${row.title} — ${riyadhDateTime(row.hearing_date)} — ${row.status}`,
      ),
      `المهل (${deadlines.data?.length ?? 0}):`,
      ...(deadlines.data ?? []).map((row) => `• ${row.title} — ${riyadhDate(row.due_date)} — ${row.status}`),
      `المهام (${tasks.data?.length ?? 0}):`,
      ...(tasks.data ?? []).map((row) => `• ${row.title} — ${row.status} — ${riyadhDate(row.due_date)}`),
    ];

    return result(lines.join("\n"), {
      case: data,
      hearings: hearings.data ?? [],
      deadlines: deadlines.data ?? [],
      tasks: tasks.data ?? [],
    });
  },
});