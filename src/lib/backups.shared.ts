/** أنواع مشتركة لمركز النسخ الاحتياطية — سجل ووثيقة اعتماد فقط، بلا تنفيذ فعلي للاستعادة. */

export const BACKUP_KINDS = {
  daily: "نسخة يومية",
  weekly: "نسخة أسبوعية",
  pre_release: "نسخة ما قبل الإصدار",
  manual: "نسخة يدوية",
} as const;
export type BackupKind = keyof typeof BACKUP_KINDS;

export const BACKUP_SOURCES = {
  managed_platform: "منصة الاستضافة المُدارة",
  manual_export: "تصدير يدوي",
  external: "مزوّد خارجي",
} as const;
export type BackupSource = keyof typeof BACKUP_SOURCES;

export const BACKUP_STATUSES = {
  unknown: "غير محددة",
  in_progress: "قيد التنفيذ",
  completed: "مكتملة",
  failed: "فشلت",
} as const;
export type BackupStatus = keyof typeof BACKUP_STATUSES;

export type BackupSnapshot = {
  id: string;
  kind: BackupKind;
  source: BackupSource;
  external_id: string | null;
  status: BackupStatus;
  started_at: string | null;
  finished_at: string | null;
  size_bytes: number | null;
  checksum: string | null;
  notes: string | null;
  recorded_by: string | null;
  retention_until: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
};

export const RESTORE_STATUSES = {
  pending: "بانتظار الاعتماد",
  approved: "مُعتمَد",
  rejected: "مرفوض",
  executed: "تم التنفيذ",
} as const;
export type RestoreStatus = keyof typeof RESTORE_STATUSES;

export type RestoreRequest = {
  id: string;
  snapshot_id: string | null;
  scope: string;
  reason: string;
  status: RestoreStatus;
  requested_by: string;
  requested_by_email: string;
  approved_by: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  decision_note: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const fmtBytes = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} ج.ب`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} م.ب`;
  if (v >= 1024) return `${(v / 1024).toFixed(0)} ك.ب`;
  return `${v} بايت`;
};
