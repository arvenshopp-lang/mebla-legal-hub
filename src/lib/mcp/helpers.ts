/**
 * مساعدات مشتركة لأدوات MCP: التحقق من الهوية، تحديد المكتب النشط،
 * وتشكيل النتائج. لا قراءة بيئة ولا أي أثر عند الاستيراد.
 */
import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

export type UserDb = ReturnType<typeof supabaseForUser>;

/** عميل بهوية المستخدم، أو خطأ واضح إن لم تكن الجلسة موثّقة. */
export function requireDb(ctx: ToolContext): UserDb {
  if (!ctx.isAuthenticated()) {
    throw new ToolError("يجب تسجيل الدخول إلى حسابك في مِهلة قبل استخدام هذه الأداة.");
  }
  return supabaseForUser(ctx);
}

/**
 * المكتب النشط للمستخدم. عند تعدد المكاتب يُطلب تحديد المعرّف صراحةً
 * بدلاً من الاختيار الضمني، حفاظاً على عزل بيانات المكاتب.
 */
export async function resolveOrganization(
  db: UserDb,
  ctx: ToolContext,
  organizationId?: string,
): Promise<string> {
  const { data, error } = await db
    .from("organization_members")
    .select("organization_id, organizations(name)")
    .eq("user_id", ctx.getUserId() ?? "")
    .eq("status", "active");
  if (error) throw new ToolError("تعذر قراءة عضويات المكاتب لحسابك.");
  const rows = data ?? [];
  if (rows.length === 0) {
    throw new ToolError("لا يوجد مكتب نشط مرتبط بحسابك في مِهلة.");
  }
  if (organizationId) {
    const match = rows.find((row) => row.organization_id === organizationId);
    if (!match) throw new ToolError("لا تملك عضوية نشطة في المكتب المحدد.");
    return match.organization_id;
  }
  if (rows.length > 1) {
    const options = rows
      .map((row) => {
        const org = row.organizations as { name?: string } | null;
        return `${org?.name ?? "مكتب"} (${row.organization_id})`;
      })
      .join(" — ");
    throw new ToolError(`حسابك مرتبط بعدة مكاتب؛ حدّد organization_id: ${options}`);
  }
  return rows[0]!.organization_id;
}

/** نتيجة نصية + بيانات منظمة، بصيغة يفهمها أي عميل MCP. */
export function result(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

const RIYADH_TZ = "Asia/Riyadh";

/** تاريخ ووقت بتوقيت الرياض بصيغة مقروءة للمحامي. */
export function riyadhDateTime(value: string | null): string {
  if (!value) return "غير محدد";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: RIYADH_TZ,
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "latn",
    calendar: "gregory",
  }).format(new Date(parsed));
}

/** تاريخ فقط بتوقيت الرياض. */
export function riyadhDate(value: string | null): string {
  if (!value) return "غير محدد";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: RIYADH_TZ,
    dateStyle: "medium",
    numberingSystem: "latn",
    calendar: "gregory",
  }).format(new Date(parsed));
}

/** نهاية النافذة الزمنية للاستحقاقات القادمة (بالأيام). */
export function windowEnd(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** تحويل خطأ قاعدة البيانات إلى رسالة مفهومة بلا تفاصيل داخلية. */
export function dbError(action: string): never {
  throw new ToolError(`تعذر ${action}. تحقق من صلاحياتك في المكتب ثم أعد المحاولة.`);
}
