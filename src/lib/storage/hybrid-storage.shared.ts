/**
 * النماذج والأنواع المشتركة للتخزين الهجين وربط سحابة المكتب (OneDrive & Google Drive BYOS)
 * Hybrid Cloud Storage Shared Models
 */

export type StorageDestination = "vault" | "onedrive" | "both";

export type CloudStorageProvider = "onedrive" | "googledrive";

export interface CloudStorageConnection {
  provider: CloudStorageProvider;
  isConnected: boolean;
  accountEmail?: string | null;
  accountName?: string | null;
  rootFolderName: string;
  quotaUsedBytes?: number;
  quotaTotalBytes?: number;
  lastSyncAt?: string | null;
  status: "idle" | "connected" | "error" | "syncing";
  errorMessage?: string | null;
}

export interface HybridStorageSettings {
  organizationId: string;
  userId: string;
  defaultDestination: StorageDestination;
  defaultClientUploadDestination: StorageDestination;
  autoSyncToCloud: boolean;
  onedrive: CloudStorageConnection;
  googledrive: CloudStorageConnection;
  updatedAt: string;
}

export interface UploadDestinationOption {
  value: StorageDestination;
  label: string;
  description: string;
  badge?: string;
  icon: "vault" | "onedrive" | "both";
}

export const STORAGE_DESTINATION_OPTIONS: UploadDestinationOption[] = [
  {
    value: "vault",
    label: "خزينة مِهلة المشفرة الآمنة",
    description: "حفظ وتشفير الملفات في السحابة السيادية لمِهلة مع OCR والبحث الذكي.",
    icon: "vault",
  },
  {
    value: "onedrive",
    label: "سحابة ون درايف المكتب (OneDrive)",
    description: "توجيه الملفات مباشرة إلى حساب OneDrive أو SharePoint الخاص بالمكتب.",
    badge: "BYOS سحابي",
    icon: "onedrive",
  },
  {
    value: "both",
    label: "تخزين مزدوج متزامن (مِهلة + OneDrive)",
    description: "حفظ نسخة مشفرة في مِهلة للبحث الذكي ونسخة متزامنة في OneDrive للمكتب.",
    badge: "الأكثر أماناً",
    icon: "both",
  },
];

export interface FileUploadResult {
  success: boolean;
  documentId?: string;
  fileName: string;
  filePath: string;
  vaultSaved: boolean;
  cloudSaved: boolean;
  cloudProvider?: CloudStorageProvider;
  cloudFileUrl?: string | null;
  cloudPath?: string | null;
  errorMessage?: string;
}
