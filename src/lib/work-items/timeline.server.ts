import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  TIMELINE_MAX_PAGE_SIZE,
  TIMELINE_PAGE_SIZE,
  WORK_EVENTS,
  type WorkEventName,
  type WorkItemTimelineCursor,
  type WorkItemTimelinePage,
} from "./timeline.shared";

type Client = SupabaseClient<Database>;

/** أعطال التقاط الأحداث تُقيَّد بهذا الإجراء داخل سجل الأعطال. */
const CAPTURE_ACTION = "work_item_events.capture";

function isWorkEvent(value: string): value is WorkEventName {
  return (WORK_EVENTS as readonly string[]).includes(value);
}

/**
 * تحقّق أن المستخدم يملك أصلاً حق رؤية هذا العمل: إمّا الصف نفسه مقروء له
 * (RLS)، أو — إذا كان محذوفاً — أنه عضو فعلي في المكتب.
 */
async function assertCanSeeWorkItem(
  userClient: Client,
  organizationId: string,
  itemType: "task" | "deadline",
  itemId: string,
): Promise<void> {
  const table = itemType === "task" ? "tasks" : "deadlines";
  const { data: item, error: itemError } = await userClient
    .from(table)
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (itemError) throw new Error("تعذّر التحقق من صلاحية عرض السجل");
  if (item) return;

  const { data: member, error: memberError } = await userClient
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (memberError) throw new Error("تعذّر التحقق من صلاحية عرض السجل");
  if (!member) throw new Error("لا تملك صلاحية عرض سجل هذا العمل");
}

/**
 * آخر عطل التقاط حدث لهذا العمل بعد لحظة الحفظ — يُستخدم لتنبيه غير معيق
 * يربط المستخدم بمرجع التتبع WIE-XXXX دون كشف تفاصيل خادمية.
 */
export async function getWorkItemCaptureIssue(
  userClient: Client,
  organizationId: string,
  itemType: "task" | "deadline",
  itemId: string,
  since: string,
): Promise<{ ref: string; event: string | null; occurredAt: string } | null> {
  await assertCanSeeWorkItem(userClient, organizationId, itemType, itemId);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_failures")
    .select("ref, metadata, created_at")
    .eq("action", CAPTURE_ACTION)
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("تعذّر التحقق من حالة تسجيل الحدث");

  const hit = (data ?? []).find(
    (row) => (row.metadata as { item_id?: string } | null)?.item_id === itemId,
  );
  if (!hit) return null;
  return {
    ref: hit.ref,
    event: (hit.metadata as { event?: string } | null)?.event ?? null,
    occurredAt: hit.created_at,
  };
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
  options: { limit?: number; cursor?: WorkItemTimelineCursor | null } = {},
): Promise<WorkItemTimelinePage> {
  const limit = Math.min(Math.max(options.limit ?? TIMELINE_PAGE_SIZE, 1), TIMELINE_MAX_PAGE_SIZE);
  const cursor = options.cursor ?? null;
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
  let query = supabaseAdmin
    .from("work_item_events")
    .select(
      "id, event, occurred_at, seq, actor_id, from_user_id, to_user_id, from_due_date, to_due_date",
    )
    .eq("organization_id", organizationId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  // ترقيم keyset: يمنع التكرار أو القفز عند إضافة أحداث جديدة بين الصفحات
  if (cursor) {
    query = query.or(
      `occurred_at.gt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},seq.gt.${cursor.seq})`,
    );
  }

  const { data: rows, error } = await query
    .order("occurred_at", { ascending: true })
    // فاصل ترجيح ثابت: حدثان في نفس اللحظة (نفس المعاملة) يظهران بترتيب تسجيلهما
    .order("seq", { ascending: true })
    .limit(limit + 1);
  if (error) throw new Error("تعذّر جلب سجل الأحداث");

  const all = rows ?? [];
  const hasMore = all.length > limit;
  const pageRows = hasMore ? all.slice(0, limit) : all;
  const last = pageRows.at(-1);
  const nextCursor: WorkItemTimelineCursor | null =
    hasMore && last ? { occurredAt: last.occurred_at, seq: last.seq } : null;

  const events = pageRows.filter((r) => isWorkEvent(r.event));
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

  return {
    events: events.map((r) => ({
      id: r.id,
      event: r.event as WorkEventName,
      occurredAt: r.occurred_at,
      actorName: nameOf(r.actor_id),
      fromUserName: nameOf(r.from_user_id),
      toUserName: nameOf(r.to_user_id),
      fromDueDate: r.from_due_date,
      toDueDate: r.to_due_date,
    })),
    nextCursor,
  };
}
