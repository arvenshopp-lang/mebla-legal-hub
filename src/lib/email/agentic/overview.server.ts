/**
 * تجميع حالة تكامل Hostinger Agentic Mail لعرضها في مركز التكاملات — خادمي فقط.
 *
 * كل قيمة معروضة مصدرها القاعدة أو حالة التكامل المحفوظة؛ لا توجد قيمة
 * افتراضية تجميلية، والصناديق تُقيّد بنطاق الموظف قبل الإعادة، ولا يُعاد أي
 * سر أو رابط يحمل رمزاً.
 */
import {
  LINK_STATUS_LABELS,
  supportedOperations,
  readinessSatisfied,
  type AgenticLinkStatus,
  type AgenticMailboxLink,
  type AgenticState,
} from "./agentic.shared";
import { readAgenticState } from "./state.server";
import { readScheduler, type SchedulerState } from "./scheduler.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const PROVIDER = "agentic_mail";

export type AgenticOverview = {
  state: AgenticState;
  ready: boolean;
  supported: string[];
  mailboxes: AgenticMailboxLink[];
  scheduler: SchedulerState;
  fallback: { pending: number; failed: number; sentViaAgentic: number };
};

function linkStatus(value: unknown): AgenticLinkStatus {
  return value === "linked" || value === "missing" ? value : "unlinked";
}

export async function mailboxLinks(
  db: Db,
  scope: { isSuper: boolean; departmentId: string | null },
): Promise<AgenticMailboxLink[]> {
  const { data: boxes } = await db
    .from("email_mailboxes")
    .select(
      "id, address, display_name, type, is_active, sync_enabled, inbound_enabled, department_id, agentic_mailbox_id, agentic_link_status, agentic_unread_count",
    )
    .order("sort_order", { ascending: true });

  const rows = (boxes ?? []) as {
    id: string;
    address: string;
    display_name: string | null;
    type: string;
    is_active: boolean;
    sync_enabled: boolean;
    inbound_enabled: boolean;
    department_id: string | null;
    agentic_mailbox_id: string | null;
    agentic_link_status: string | null;
    agentic_unread_count: number | null;
  }[];

  const visible = rows.filter(
    (row) => scope.isSuper || !row.department_id || row.department_id === scope.departmentId,
  );
  if (visible.length === 0) return [];

  const { data: states } = await db
    .from("email_sync_state")
    .select("mailbox_id, last_sync_at, last_error, provider_cursor")
    .eq("provider", PROVIDER)
    .in(
      "mailbox_id",
      visible.map((row) => row.id),
    );

  const byMailbox = new Map(
    ((states ?? []) as {
      mailbox_id: string;
      last_sync_at: string | null;
      last_error: string | null;
      provider_cursor: string | null;
    }[]).map((row) => [row.mailbox_id, row]),
  );

  return visible.map((row) => {
    const sync = byMailbox.get(row.id);
    return {
      id: row.id,
      address: row.address,
      displayName: row.display_name ?? row.address,
      type: row.type,
      isActive: row.is_active,
      syncEnabled: row.sync_enabled,
      inboundEnabled: row.inbound_enabled,
      linkStatus: linkStatus(row.agentic_link_status),
      providerMailboxId: row.agentic_mailbox_id,
      unreadCount: row.agentic_unread_count ?? 0,
      lastSyncAt: sync?.last_sync_at ?? null,
      lastError: sync?.last_error ?? null,
      cursor: sync?.provider_cursor ?? null,
      departmentId: row.department_id,
    } satisfies AgenticMailboxLink;
  });
}

/** أرقام مسار الإرسال: ما زال في الانتظار، وما فشل، وما أُرسل عبر المزوّد. */
async function fallbackCounters(db: Db): Promise<AgenticOverview["fallback"]> {
  const [pending, failed, viaAgentic] = await Promise.all([
    db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "queued"),
    db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("provider", PROVIDER),
  ]);
  return {
    pending: (pending as { count: number | null }).count ?? 0,
    failed: (failed as { count: number | null }).count ?? 0,
    sentViaAgentic: (viaAgentic as { count: number | null }).count ?? 0,
  };
}

export async function buildOverview(
  db: Db,
  scope: { isSuper: boolean; departmentId: string | null },
): Promise<AgenticOverview> {
  const [state, links, scheduler, fallback] = await Promise.all([
    readAgenticState(db),
    mailboxLinks(db, scope),
    readScheduler(db),
    fallbackCounters(db),
  ]);
  return {
    state,
    ready: readinessSatisfied(state),
    supported: supportedOperations(state),
    mailboxes: links,
    scheduler,
    fallback,
  };
}

export { LINK_STATUS_LABELS };
