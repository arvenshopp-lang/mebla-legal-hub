/** أنواع مشتركة للبحث العالمي وسجل النشاط ولوحة المراقبة في لوحة إدارة المنصة. */

export type SearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type SearchGroupKey =
  | "organizations"
  | "users"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "tickets"
  | "mail"
  | "pages"
  | "staff"
  | "logs";

export type SearchGroup = { key: SearchGroupKey; label: string; hits: SearchHit[] };

export type GlobalSearchResult = {
  query: string;
  groups: SearchGroup[];
  /** الأقسام التي استُثنيت لعدم توفر الصلاحية — تُعرض للموظف بشفافية. */
  restricted: string[];
};

export const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  organizations: "المكاتب",
  users: "المستخدمون",
  subscriptions: "الاشتراكات",
  invoices: "الفواتير",
  payments: "المدفوعات",
  tickets: "التذاكر",
  mail: "البريد",
  pages: "الصفحات",
  staff: "الموظفون",
  logs: "سجل التدقيق",
};

export type ActivitySource = "admin" | "tenant" | "failure";

export type ActivityEvent = {
  id: string;
  source: ActivitySource;
  action: string;
  actor: string;
  entityType: string;
  entityId: string | null;
  description: string;
  ip: string | null;
  device: string | null;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type ActivityFeed = { events: ActivityEvent[]; total: number; hasMore: boolean };

export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  admin: "عملية إدارية",
  tenant: "نشاط مكتب",
  failure: "عطل مسجّل",
};

export type QueueSnapshot = {
  key: string;
  label: string;
  pending: number;
  failed: number;
  done24h: number;
  oldestPendingAt: string | null;
  /** توضيح لمصدر الرقم حتى لا تُقرأ الأصفار على أنها تعطل. */
  note: string;
};

export type MonitoringSnapshot = {
  checkedAt: string;
  latency: { database: number; storage: number; slowestIntegration: { name: string; ms: number } | null };
  queues: QueueSnapshot[];
  storage: { documents: number; bytes: number };
  sessions: { active24h: number; total: number; revoked30d: number };
  security: { adminOps24h: number; failures24h: number; blockedLookups24h: number; lastFailureRef: string | null };
  integrations: { checks24h: number; failures24h: number; lastCheckAt: string | null };
};
