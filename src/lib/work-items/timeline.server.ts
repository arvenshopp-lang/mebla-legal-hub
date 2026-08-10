import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { WORK_EVENTS, type WorkEventName, type WorkItemTimelineEvent } from "./timeline.shared";

type Client = SupabaseClient<Database>;

const MAX_EVENTS = 200;

function isWorkEvent(value: string): value is WorkEventName {
  return (WORK_EVENTS as readonly string[]).includes(value);
}

/**
 * سجل أحداث عمل واحد (مهمة أو مهلة) لأي عضو يستطيع أصلاً قراءة العمل نفسه.
 * التحقق يجري بعميل المستخدم (RLS) على المهمة/المهلة، ثم تُقرأ الأحداث بعميل
 * الخدمة لأن الجدول مغلق أمام القراءة المباشرة ومحصور على مالك/مدير المكتب.
 */
export async function getWorkItemTimeline(
  userClient: Client,
  organizationId: string,
  itemType: "task" | "deadline",
  itemId: string,
): Promise<WorkItemTimelineEvent[]> {
  const table = itemType === "task" ? "tasks" : "deadlines";
  const { data: item, error: itemError } = await userClient
    .from(table)
    .select("id, organization_id")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (itemError) throw new Error("تعذّر التحقق من صلاحية عرض السجل");
  if (!item) throw new Error("لا تملك صلاحية عرض سجل هذا العمل");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("work_item_events")
    .select(
      "id, event, occurred_at, actor_id, from_user_id, to_user_id, from_due_date, to_due_date",
    )
    .eq("organization_id", organizationId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .order("occurred_at", { ascending: true })
    .limit(MAX_EVENTS);
  if (error) throw new Error("تعذّر جلب سجل الأحداث");

  const events = (rows ?? []).filter((r) => isWorkEvent(r.event));
  const userIds = Array.from(
    new Set(
      events.flatMap((r) => [r.actor_id, r.from_user_id, r.to_user_id]).filter(Boolean) as string[],
    ),
  );
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    (profiles ?? []).forEach((p) => names.set(p.id, p.full_name ?? "—"));
  }

  const nameOf = (id: string | null) => (id ? (names.get(id) ?? "مستخدم محذوف") : null);

  return events.map((r) => ({
    id: r.id,
    event: r.event as WorkEventName,
    occurredAt: r.occurred_at,
    actorName: nameOf(r.actor_id),
    fromUserName: nameOf(r.from_user_id),
    toUserName: nameOf(r.to_user_id),
    fromDueDate: r.from_due_date,
    toDueDate: r.to_due_date,
  }));
}
