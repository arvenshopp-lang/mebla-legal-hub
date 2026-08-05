/**
 * أنواع لوحة تشغيل مالك المنصة — مشتركة بين الخادم والواجهة.
 * كل الأرقام تُحسب من قاعدة البيانات الفعلية عبر دوال RPC مؤمّنة.
 */

export type ActivityOverview = {
  generated_at: string;
  active_users: { today: number; week: number; month: number; events_today: number };
  active_organizations: { today: number; month: number };
  email: {
    total: number;
    inbound: number;
    outbound: number;
    today: number;
    threads: number;
    mailboxes: number;
    attachments: number;
    last_sync_at: string | null;
    last_sync_status: string | null;
  };
  tickets: { total: number; open: number; today: number; breached: number };
  storage: {
    documents_bytes: number;
    attachments_bytes: number;
    documents_count: number;
    pages_indexed: number;
  };
  database: { size_bytes: number; tables: number };
};

export type ServiceIntegration = {
  key: string;
  label: string;
  category: string | null;
  configured: boolean;
  enabled: boolean;
  status: string;
  last_check_at: string | null;
  latency_ms: number | null;
  last_error: string | null;
  last_error_at: string | null;
  checks_24h: number;
};

export type ServiceHealth = {
  generated_at: string;
  integrations: ServiceIntegration[];
  email_transport: {
    mailboxes: number;
    mailboxes_active: number;
    last_run_at: string | null;
    last_success_at: string | null;
    failed_runs_24h: number;
    last_error: string | null;
    outbox_queued: number;
    outbox_failed: number;
  };
  sms: { sent_24h: number; failed_24h: number; last_sent_at: string | null; last_error: string | null };
  otp: { issued_24h: number; verified_24h: number; pending: number };
  payments: {
    providers: number;
    providers_active: number;
    attempts_24h: number;
    failed_24h: number;
    webhooks_pending: number;
  };
  reliability: {
    failures_24h: number;
    failures_open: number;
    last_failure_at: string | null;
    last_failure_ref: string | null;
  };
  database: { size_bytes: number; connections: number; tables_public: number; rls_disabled: number };
};

export type JobQueue = {
  key: string;
  label: string;
  queued: number;
  scheduled: number;
  running: number;
  done: number;
  failed: number;
  dead: number;
  oldest_pending_at: string | null;
  next_attempt_at: string | null;
};

export type JobsOverview = {
  generated_at: string;
  queues: JobQueue[];
  sync_runs: {
    id: string;
    mailbox_id: string | null;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
  }[];
  failed_jobs: {
    queue: string;
    id: string;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    last_error_code: string | null;
    failure_ref: string | null;
    created_at: string;
  }[];
  cron: {
    email_sync_last_at: string | null;
    watermark_cleanup_last_at: string | null;
    sla_last_event_at: string | null;
    csat_last_invitation_at: string | null;
  };
};

export type GrowthPoint = {
  day: string;
  organizations: number;
  users: number;
  cases: number;
  documents: number;
  emails: number;
  tickets: number;
  active_users: number;
  revenue: number;
};

export type GrowthSeries = {
  generated_at: string;
  days: number;
  series: GrowthPoint[];
  top_organizations: {
    organization_id: string;
    name: string;
    events: number;
    cases: number;
    documents: number;
    storage_bytes: number;
    users: number;
  }[];
  ai_usage: { metric: string; total: number }[];
};

export const CONTENT_KINDS = {
  home: "الصفحة الرئيسية",
  pricing: "الأسعار",
  faq: "الأسئلة الشائعة",
  legal: "المحتوى النظامي",
  banner: "بنر إعلاني",
  contact: "بيانات التواصل",
  page: "صفحة عامة",
} as const;

export type ContentKind = keyof typeof CONTENT_KINDS;

export type ContentPage = {
  id: string;
  slug: string;
  kind: ContentKind;
  title: string;
  description: string | null;
  content: Record<string, unknown>;
  is_published: boolean;
  published_at: string | null;
  version: number;
  updated_at: string;
};

export const fmtBytes = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} ج.ب`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} م.ب`;
  if (v >= 1024) return `${(v / 1024).toFixed(0)} ك.ب`;
  return `${v} بايت`;
};

export const fmtNumber = (n: number | null | undefined): string =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const fmtMoney = (n: number | null | undefined): string =>
  `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(Number(n ?? 0))} ر.س`;
